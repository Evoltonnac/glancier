"""
Glancier 主入口：启动 FastAPI 后端服务。
"""

import asyncio
import copy
import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config_loader import load_config, AppConfig, SourceConfig
from core.models import StoredSource
from core.bootstrap import seed_first_launch_workspace
from core.data_controller import DataController
from core.secrets_controller import SecretsController
from core.executor import Executor
from core.auth.manager import AuthManager
from core.resource_manager import ResourceManager
from core.integration_manager import IntegrationManager
from core.settings_manager import SettingsManager
from core import api


def resolve_initial_log_level() -> int:
    data_root = Path(os.getenv("GLANCIER_DATA_DIR", "."))
    settings_file = data_root / "data" / "settings.json"
    try:
        payload = json.loads(settings_file.read_text(encoding="utf-8"))
        debug_enabled = bool(payload.get("debug_logging_enabled", False))
        return logging.DEBUG if debug_enabled else logging.INFO
    except Exception:
        return logging.INFO


def resolve_stored_source(stored: "StoredSource", config: AppConfig) -> SourceConfig | None:
    """将 StoredSource 解析为可执行的 SourceConfig。"""
    # 查找对应的集成配置
    integration = config.get_integration(stored.integration_id) if stored.integration_id else None

    if not integration:
        logger.warning(f"[{stored.id}] 集成 '{stored.integration_id}' 未找到")
        return None

    # 构建基础配置
    base = copy.deepcopy(integration.model_dump())
    base.pop("id", None)
    base.pop("templates", None)

    # 应用变量替换
    variables = stored.vars
    for k, v in base.items():
        if isinstance(v, str):
            try:
                base[k] = v.format(**variables)
            except (KeyError, IndexError):
                pass
        elif isinstance(v, dict):
            base[k] = {key: val.format(**variables) if isinstance(val, str) else val for key, val in v.items()}

    # 覆盖配置
    for key, val in stored.config.items():
        if key == "vars":
            continue
        base[key] = val

    # 添加必需字段
    base["id"] = stored.id
    base["name"] = stored.name

    return SourceConfig.model_validate(base)

# 日志配置
logging.basicConfig(
    level=resolve_initial_log_level(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class StartupBackgroundTasks:
    """Runtime-compatible background task collector for startup seeding."""

    def __init__(self) -> None:
        self._tasks: list[tuple[object, tuple[object, ...], dict[str, object]]] = []

    def add_task(self, func, *args, **kwargs) -> None:
        self._tasks.append((func, args, kwargs))

    def drain(self) -> list[tuple[object, tuple[object, ...], dict[str, object]]]:
        tasks = list(self._tasks)
        self._tasks.clear()
        return tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan 事件处理：启动时和关闭时的逻辑。"""

    startup_tasks = getattr(app.state, "startup_background_tasks", None)
    if startup_tasks is not None:
        scheduled = 0
        for func, args, kwargs in startup_tasks.drain():
            result = func(*args, **kwargs)
            if asyncio.iscoroutine(result):
                asyncio.create_task(result)
            scheduled += 1
        if scheduled:
            logger.info("启动时已调度 %d 个 bootstrap source 刷新任务", scheduled)

    yield  # 应用运行中

    # 关闭时：关闭数据库连接
    logger.info("正在关闭...")
    app.state.data_controller.close()


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用。"""
    app = FastAPI(
        title="Glancier API",
        description="API for metric monitoring and data aggregation",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS 中间件
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── 初始化资源管理器（用于首启样例） ───────────────────────
    resource_manager = ResourceManager()
    integration_manager = IntegrationManager()
    existing_source_ids_before_seed = {source.id for source in resource_manager.load_sources()}
    seeded = seed_first_launch_workspace(integration_manager, resource_manager)

    # ── 加载配置 ──────────────────────────────────────────────
    logger.info("正在加载配置...")
    try:
        config = load_config()
        logger.info(f"已加载 {len(config.integrations)} 个集成配置")
    except Exception as exc:
        logger.error("配置加载失败，使用空配置启动: %s", exc, exc_info=True)
        config = AppConfig()

    # 数据持久化
    data_controller = DataController()

    # 敏感信息存储
    secrets_controller = SecretsController()

    # 鉴权管理器
    auth_manager = AuthManager(secrets_controller, app_config=config)

    # 系统设置管理器
    settings_manager = SettingsManager()

    # 执行器
    executor = Executor(data_controller, secrets_controller, settings_manager)

    # 将 SettingsManager 注入 SecretsController，开启自适应加解密
    secrets_controller.inject_settings_manager(settings_manager)

    # 使用与 API 创建 source 一致的核心流程，为 bootstrap 新建 source 自动触发刷新
    startup_background_tasks = StartupBackgroundTasks()
    if seeded:
        source_by_id = {source.id: source for source in resource_manager.load_sources()}
        new_source_ids = sorted(set(source_by_id) - existing_source_ids_before_seed)
        for source_id in new_source_ids:
            api.create_stored_source_record(
                source_by_id[source_id],
                resource_manager,
                executor=executor,
                config=config,
                background_tasks=startup_background_tasks,
            )

    # 注入依赖到 API 模块
    api.init_api(
        executor=executor,
        data_controller=data_controller,
        config=config,
        auth_manager=auth_manager,
        secrets_controller=secrets_controller,
        resource_manager=resource_manager,
        integration_manager=integration_manager,
        settings_manager=settings_manager,
    )

    # 注册 API 路由
    app.include_router(api.router)

    # 将组件存到 app.state，供 lifespan 访问
    app.state.config = config
    app.state.executor = executor
    app.state.data_controller = data_controller
    app.state.resource_manager = resource_manager
    app.state.startup_background_tasks = startup_background_tasks

    return app


def main():
    """主入口。"""
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8400

    logger.info(f"🚀 启动 Glancier 后端 (port={port})...")

    app = create_app()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
