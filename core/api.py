"""
FastAPI 路由：暴露 REST API 供展现层和外部调用。
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException

from pydantic import BaseModel
from core.models import StoredSource, StoredView, ViewItem
from core.integration_manager import IntegrationManager
from core.source_state import SourceStatus, InteractionRequest
import yaml

class FileContentRequest(BaseModel):
    content: str

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# 这些全局引用会在 main.py 中注入
# 这些全局引用会在 main.py 中注入
_executor = None
_data_controller = None
_config = None
_auth_manager = None
_secrets = None
_resource_manager = None
_integration_manager = None
_settings_manager = None


def init_api(executor, data_controller, config, auth_manager, secrets_controller, resource_manager, integration_manager, settings_manager=None):
    """注入全局依赖（由 main.py 调用）。"""
    global _executor, _data_controller, _config, _auth_manager, _secrets, _resource_manager, _integration_manager, _settings_manager
    _executor = executor
    _data_controller = data_controller
    _config = config
    _auth_manager = auth_manager
    _secrets = secrets_controller
    _resource_manager = resource_manager
    _integration_manager = integration_manager
    _settings_manager = settings_manager


# ── 数据源列表 ────────────────────────────────────────

@router.get("/sources")
async def list_sources() -> list[dict]:
    """获取所有存储的数据源，包含运行时状态。"""
    stored_sources = _resource_manager.load_sources()

    result = []
    for source in stored_sources:
        # 获取运行时状态
        latest_data = _data_controller.get_latest(source.id)
        state = _executor.get_source_state(source.id)

        # 确定 has_data
        has_data = latest_data is not None and latest_data.get("data") is not None

        # 确定 error
        error = latest_data.get("error") if latest_data else None

        # 构建 SourceSummary
        summary = {
            "id": source.id,
            "name": source.name,
            "integration_id": source.integration_id,
            "description": source.config.get("description", ""),
            "icon": source.config.get("icon"),
            "enabled": True,  # StoredSource 默认启用
            "auth_type": source.config.get("auth_type", "none"),
            "has_data": has_data,
            "updated_at": latest_data.get("updated_at") if latest_data else None,
            "error": error,
            "status": state.status.value if state else "disabled",
            "message": state.message if state else None,
            "interaction": state.interaction.model_dump() if state and state.interaction else None,
        }
        result.append(summary)

    return result


# ── 数据查询 ──────────────────────────────────────────

def _get_stored_source(source_id: str) -> "StoredSource | None":
    """从 JSON 存储获取数据源。"""
    stored_sources = _resource_manager.load_sources()
    for stored in stored_sources:
        if stored.id == source_id:
            return stored
    return None

@router.get("/data/{source_id}")
async def get_data(source_id: str) -> dict[str, Any]:
    """获取指定数据源的最新数据。"""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    latest = _data_controller.get_latest(source_id)
    if latest is None:
        return {"source_id": source_id, "data": None, "message": "暂无数据"}
    return latest


@router.get("/data/{source_id}/history")
async def get_history(source_id: str, limit: int = 100) -> list[dict]:
    """获取指定数据源的历史数据。"""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    return _data_controller.get_history(source_id, limit=limit)


# ── 手动刷新 ──────────────────────────────────────────

def _resolve_stored_source(stored: "StoredSource"):
    """将 StoredSource 解析为可执行的 SourceConfig。"""
    import copy
    from core.config_loader import SourceConfig, ScheduleConfig

    # 查找对应的集成配置
    integration = _config.get_integration(stored.integration_id) if stored.integration_id else None

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

    # 确保 schedule 字段存在
    if "schedule" not in base:
        base["schedule"] = {}

    return SourceConfig.model_validate(base)


@router.post("/refresh/{source_id}")
async def refresh_source(source_id: str, background_tasks: BackgroundTasks) -> dict:
    """手动触发单个数据源刷新。"""
    # 从 JSON 存储中获取
    stored_sources = _resource_manager.load_sources()
    source = None
    for stored in stored_sources:
        if stored.id == source_id:
            source = _resolve_stored_source(stored)
            break

    if source is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    # 同步更新状态为正在刷新，防止前端立即请求 loadData 时读到旧状态
    _executor._update_state(source_id, SourceStatus.REFRESHING, "Fetching latest data...")
    background_tasks.add_task(_executor.fetch_source, source)
    return {"message": f"已触发刷新: {source.name}", "source_id": source_id}


@router.post("/refresh")
async def refresh_all(background_tasks: BackgroundTasks) -> dict:
    """手动触发所有数据源刷新。"""
    source_ids = []

    # 刷新 JSON 存储的数据源
    stored_sources = _resource_manager.load_sources()
    for stored in stored_sources:
        resolved = _resolve_stored_source(stored)
        if resolved:
            # 同步更新状态为正在刷新
            _executor._update_state(stored.id, SourceStatus.REFRESHING, "Refreshing all sources...")
            background_tasks.add_task(_executor.fetch_source, resolved)
            source_ids.append(stored.id)

    return {
        "message": f"已触发刷新 {len(source_ids)} 个数据源",
        "source_ids": source_ids,
    }


# ── 配置查询 ──────────────────────────────────────────

@router.get("/config")
async def get_config() -> dict[str, Any]:
    """获取当前配置摘要（不暴露敏感信息）。"""
    # 返回 JSON 存储的数据源
    stored_sources = _resource_manager.load_sources()
    sources = []
    for s in stored_sources:
        integration = _config.get_integration(s.integration_id) if s.integration_id else None
        auth_type = "none"
        if integration and integration.auth:
            auth_type = integration.auth.type.value
        elif s.config.get("auth"):
            auth_type = s.config.get("auth", {}).get("type", "none")
        sources.append({
            "id": s.id,
            "name": s.name,
            "integration_id": s.integration_id if hasattr(s, 'integration_id') else None,
            "enabled": True,
            "auth_type": auth_type,
            "schedule": {
                "cron": None,
                "interval_minutes": 60,
            },
        })
    return {
        "sources": sources,
    }


# ── OAuth 授权回调 ───────────────────────────────────

@router.get("/oauth/authorize/{source_id}")
async def oauth_authorize(source_id: str, redirect_uri: Optional[str] = None) -> dict:
    """重定向到 OAuth 授权页面。"""
    handler = _auth_manager.get_oauth_handler(source_id)
    if handler is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不是 OAuth 类型")
    url = handler.get_authorize_url(redirect_uri=redirect_uri)
    return {"authorize_url": url, "message": "请在浏览器中打开此 URL 进行授权"}



# ── 交互接口 ──────────────────────────────────────────

@router.post("/sources/{source_id}/interact")
async def interact_source(source_id: str, data: dict[str, Any], background_tasks: BackgroundTasks) -> dict:
    """
    处理数据源的交互请求（如提交 API Key、Captcha 等）。
    data 格式依赖于 interaction.type。
    """
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    # 将 StoredSource 解析为 SourceConfig
    source = _resolve_stored_source(stored)
    if source is None:
        raise HTTPException(500, f"无法解析数据源 '{source_id}'")

    state = _executor.get_source_state(source_id)
    
    # Special Handling: OAuth Code Exchange (Client-Side Callback)
    if data.get("type") == "oauth_code_exchange":
        handler = _auth_manager.get_oauth_handler(source_id)
        if not handler:
             raise HTTPException(400, "Source is not OAuth type")
        
        code = data.get("code")
        redirect_uri = data.get("redirect_uri")
        if not code:
            raise HTTPException(400, "Missing 'code' in interaction data")
            
        try:
            await handler.exchange_code(code, redirect_uri=redirect_uri)
        except Exception as e:
            logger.error(f"[{source_id}] OAuth Exchange Failed: {e}")
            raise HTTPException(400, f"授权失败: {str(e)}")
        
        background_tasks.add_task(_executor.fetch_source, source)
        return {"message": "OAuth 授权成功", "source_id": source_id}
    
    # 检查是否有挂起的交互请求
    if not state.interaction:
        # 如果没有明确的交互请求，假设是通用的更新
        logger.warning(f"[{source_id}] Received interaction but no pending interaction request found.")
    
    # 获取 source_id (优先从挂起的交互请求中获取)
    target_source_id = state.interaction.source_id if state.interaction else None

    # 如果请求中包含 source_id，覆盖状态中的 (允许前端显式指定)
    if "source_id" in data:
        target_source_id = data.pop("source_id")

    # 如果没有找到 source_id，回退到默认 (source_id)
    if not target_source_id:
        target_source_id = source_id

    if data:
        # 将数据保存到 Secrets，使用 source_id 作为键
        # 注意：这里假设 data 是平面字典，直接存入。
        _secrets.set_secrets(target_source_id, data)
        logger.info(f"[{source_id}] Received interaction data for source '{target_source_id}'.")
    
    # 同步更新状态为正在刷新
    _executor._update_state(source_id, SourceStatus.REFRESHING, "Processing interaction results...")
    # Trigger retry/resume
    # fetch_source handles "resume" by just running again and hopefully succeeding this time
    background_tasks.add_task(_executor.fetch_source, source)
    
    return {"message": "Interact received, retrying source.", "source_id": source_id}


# ── 鉴权状态查询 ──────────────────────────────────────

@router.get("/sources/{source_id}/auth-status")
async def get_auth_status(source_id: str) -> dict[str, Any]:
    """查询数据源的认证状态。"""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    # 获取 integration 配置来确定 auth 类型
    integration = _config.get_integration(stored.integration_id) if stored.integration_id else None
    auth_type = "none"
    if integration:
        if integration.auth:
            auth_type = integration.auth.type.value

    # 也检查 stored.config 中的 auth 覆盖
    if stored.config.get("auth"):
        auth_type = stored.config.get("auth", {}).get("type", auth_type)
    
    # 检查是否有注册错误
    error = _auth_manager.get_source_error(source_id)
    if error:
        return {
            "source_id": source_id,
            "auth_type": auth_type,
            "status": "error",
            "message": error,
        }
    
    # OAuth 特殊处理：检查是否有 token
    if auth_type == "oauth":
        handler = _auth_manager.get_oauth_handler(source_id)
        if handler and handler.has_token:
            return {
                "source_id": source_id,
                "auth_type": auth_type,
                "status": "ok",
            }
        else:
            return {
                "source_id": source_id,
                "auth_type": auth_type,
                "status": "missing",
                "message": "需要 OAuth 授权",
            }
    
    # 其他类型默认返回 ok（实际鉴权在请求时验证）
    return {
        "source_id": source_id,
        "auth_type": auth_type,
        "status": "ok",
    }


# ── 运行时鉴权更新 ────────────────────────────────────

@router.post("/auth/apikey/{source_id}")
async def update_api_key(source_id: str, api_key: str) -> dict:
    """运行时更新 API Key（仅用于前端临时填写，不持久化）。"""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    # 检查是否是 API Key 认证类型
    integration = _config.get_integration(stored.integration_id) if stored.integration_id else None
    auth_type = stored.config.get("auth", {}).get("type")
    if not auth_type and integration and integration.auth:
        auth_type = integration.auth.type.value

    if auth_type != "api_key":
        raise HTTPException(400, f"数据源 '{source_id}' 不是 API Key 认证类型")
    
    # 持久化到 Secrets
    _secrets.set_secrets(source_id, {"api_key": api_key})
    
    # 重新注册鉴权 (AuthManager handles reading from secrets)
    # _auth_manager.register_source(source) # Not strictly needed if get_client reads every time?
    # But register_source updates the map of handlers. 
    # ApiKeyAuth is stateless mostly, but let's refresh.
    
    logger.info(f"[{source_id}] API Key 已更新")
    return {"message": f"API Key 已更新: {source_id}"}


@router.post("/auth/cookie/refresh/{source_id}")
async def refresh_browser_cookie(source_id: str) -> dict:
    """触发重新读取浏览器 Cookie。"""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    # 检查是否是浏览器 Cookie 认证类型
    integration = _config.get_integration(stored.integration_id) if stored.integration_id else None
    auth_type = stored.config.get("auth", {}).get("type")
    if not auth_type and integration and integration.auth:
        auth_type = integration.auth.type.value

    if auth_type != "browser":
        raise HTTPException(400, f"数据源 '{source_id}' 不是浏览器 Cookie 认证类型")

    # 将 StoredSource 解析为 SourceConfig 并注册
    source = _resolve_stored_source(stored)
    if source:
        _auth_manager.register_source(source)

    logger.info(f"[{source_id}] 浏览器 Cookie 已刷新")
    return {"message": f"Cookie 已刷新: {source_id}"}


# ── Stored Sources (JSON-based) ──────────────────────────────────────────

@router.post("/sources")
async def create_stored_source(source: StoredSource, background_tasks: BackgroundTasks) -> StoredSource:
    """创建新的存储数据源。"""
    saved = _resource_manager.save_source(source)
    resolved = _resolve_stored_source(saved)
    if resolved:
        background_tasks.add_task(_executor.fetch_source, resolved)
    return saved


@router.put("/sources/{source_id}")
async def update_stored_source(source_id: str, source: StoredSource) -> StoredSource:
    """更新存储的数据源。"""
    if source.id != source_id:
        raise HTTPException(400, "ID mismatch")
    return _resource_manager.save_source(source)


@router.delete("/sources/{source_id}")
async def delete_stored_source(source_id: str) -> dict:
    """删除存储的数据源。"""
    if _resource_manager.delete_source(source_id):
        return {"message": f"Source {source_id} deleted"}
    raise HTTPException(404, f"Source {source_id} not found")


# ── Stored Views (JSON-based) ─────────────────────────────────────────────

@router.get("/views")
async def list_stored_views() -> list[StoredView]:
    """获取所有存储的视图。"""
    return _resource_manager.load_views()


@router.post("/views")
async def create_stored_view(view: StoredView) -> StoredView:
    """创建新的存储视图。"""
    return _resource_manager.save_view(view)


@router.put("/views/{view_id}")
async def update_stored_view(view_id: str, view: StoredView) -> StoredView:
    """更新存储的视图。"""
    if view.id != view_id:
        raise HTTPException(400, "ID mismatch")
    return _resource_manager.save_view(view)


@router.delete("/views/{view_id}")
async def delete_stored_view(view_id: str) -> dict:
    """删除存储的视图。"""
    if _resource_manager.delete_view(view_id):
        return {"message": f"View {view_id} deleted"}
    raise HTTPException(404, f"View {view_id} not found")


# ── Integration Templates ─────────────────────────────────────────────────

@router.get("/integrations/{integration_id}/templates")
async def get_integration_templates(integration_id: str) -> list[dict]:
    """获取指定集成的视图模板。"""
    integration = _config.get_integration(integration_id)
    if integration is None:
        raise HTTPException(404, f"Integration {integration_id} not found")
    return [t.model_dump() for t in integration.templates]


# ── Integration Management (YAML Files) ───────────────────────────────────

@router.get("/integrations/files")
async def list_integration_files() -> list[str]:
    """列出所有集成配置（返回 YAML 中定义的 id）。"""
    return _integration_manager.list_integrations()


@router.get("/integrations/files/{integration_id}")
async def get_integration_file(integration_id: str) -> dict:
    """获取集成 YAML 文件内容。"""
    content = _integration_manager.get_integration(integration_id)
    if content is None:
        raise HTTPException(404, f"Integration {integration_id} not found")
    return {"integration_id": integration_id, "content": content}


@router.post("/integrations/files")
async def create_integration_file(filename: str, request: FileContentRequest) -> dict:
    """创建新的集成 YAML 文件。"""
    success = _integration_manager.create_integration(filename, request.content)
    if not success:
        raise HTTPException(500, f"Failed to create integration {filename}")
    return {"message": f"Integration {filename} created", "integration_id": filename}


@router.put("/integrations/files/{integration_id}")
async def update_integration_file(integration_id: str, request: FileContentRequest) -> dict:
    """更新集成 YAML 文件内容。"""
    # 先进行 Pydantic 校验
    from core.config_loader import IntegrationConfig
    from pydantic import ValidationError

    try:
        # 解析 YAML 内容
        parsed = yaml.safe_load(request.content)
        if not parsed:
            raise HTTPException(400, "Empty YAML content")

        # 校验 integrations 列表
        if "integrations" not in parsed:
            raise HTTPException(400, "Missing 'integrations' key in YAML")

        integrations = parsed.get("integrations", [])
        if not isinstance(integrations, list):
            raise HTTPException(400, "'integrations' must be a list")

        # 使用 Pydantic 校验每个 integration
        diagnostics = []
        for idx, integration_data in enumerate(integrations):
            try:
                IntegrationConfig.model_validate(integration_data)
            except ValidationError as exc:
                # 将 Pydantic ValidationError 转换为前端可用的诊断信息
                for error in exc.errors():
                    field_path = ".".join(str(loc) for loc in error["loc"])
                    diagnostics.append({
                        "source": "backend",
                        "message": error["msg"],
                        "code": error["type"],
                        "fieldPath": f"integrations[{idx}].{field_path}" if field_path else f"integrations[{idx}]"
                    })

        # 如果有校验错误，返回详细信息
        if diagnostics:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Integration validation failed",
                    "diagnostics": diagnostics
                }
            )

    except yaml.YAMLError as exc:
        # YAML 语法错误
        raise HTTPException(400, f"Invalid YAML syntax: {exc}")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Validation error: %s", exc, exc_info=True)
        raise HTTPException(400, f"Validation failed: {exc}")

    # 校验通过，保存文件
    success = _integration_manager.save_integration(integration_id, request.content)
    if not success:
        raise HTTPException(500, f"Failed to save integration {integration_id}")
    return {"message": f"Integration {integration_id} saved", "integration_id": integration_id}


@router.delete("/integrations/files/{integration_id}")
async def delete_integration_file(integration_id: str) -> dict:
    """删除集成 YAML 文件。"""
    success = _integration_manager.delete_integration(integration_id)
    if not success:
        raise HTTPException(500, f"Failed to delete integration {integration_id}")
    return {"message": f"Integration {integration_id} deleted", "integration_id": integration_id}


# ── Config Reload ─────────────────────────────────────────────────────

@router.post("/system/reload")
async def reload_config() -> dict:
    """
    重新加载配置文件，并标记相关数据源为 CONFIG_CHANGED。
    """
    global _config

    # 重新加载配置
    from core.config_loader import load_config
    try:
        new_config = load_config()
    except Exception as exc:
        logger.error("Configuration reload failed: %s", exc, exc_info=True)
        raise HTTPException(400, f"Configuration reload failed: {exc}") from exc

    # 找出受影响的源（配置发生变化的集成所对应的源）
    changed_integrations = set()
    for new_int in new_config.integrations:
        old_int = _config.get_integration(new_int.id)
        if old_int is None or old_int.model_dump() != new_int.model_dump():
            changed_integrations.add(new_int.id)

    for old_int in _config.integrations:
        if new_config.get_integration(old_int.id) is None:
            changed_integrations.add(old_int.id)

    affected_sources = []

    # 从 JSON 存储获取数据源
    stored_sources = _resource_manager.load_sources()
    for stored in stored_sources:
        if stored.integration_id and stored.integration_id in changed_integrations:
            # 标记该源为 CONFIG_CHANGED
            state = _executor.get_source_state(stored.id)
            state.status = SourceStatus.CONFIG_CHANGED
            state.message = "Configuration changed, needs refresh"
            _executor.update_source_state(stored.id, state)
            affected_sources.append(stored.id)

    # 更新全局配置
    _config = new_config

    return {
        "message": "Configuration reloaded",
        "affected_sources": affected_sources,
        "total_sources": len(stored_sources)
    }


@router.get("/integrations/files/{filename}/sources")
async def get_integration_sources(filename: str) -> list[dict]:
    """获取使用指定集成的所有数据源。"""
    # 从文件名提取 integration_id (去掉 .yaml 后缀)
    integration_id = filename.replace(".yaml", "")
    # 从 JSON 存储中查找
    all_sources = _resource_manager.load_sources()
    related = [s for s in all_sources if s.integration_id == integration_id]
    return [s.model_dump() for s in related]


# ── System Settings ───────────────────────────────────────────────────

from core.settings_manager import SystemSettings

@router.get("/settings")
async def get_system_settings() -> SystemSettings:
    """获取所有系统设置"""
    if _settings_manager is None:
        return SystemSettings()
    return _settings_manager.load_settings()

@router.put("/settings")
async def update_system_settings(settings: SystemSettings) -> SystemSettings:
    """更新所有系统设置，并在加密开关变更时触发全量迁移。"""
    if _settings_manager is None:
        return settings

    old = _settings_manager.load_settings()
    old_enc = old.encryption_enabled
    new_enc = settings.encryption_enabled

    # 保存新设置（写入 master_key 之前需先确保主密钥存在）
    if new_enc and not settings.master_key:
        # 如果新开启了加密但没有主密钥，先生成一个
        settings.master_key = _settings_manager.get_or_create_master_key()

    _settings_manager.save_settings(settings)

    # 将新 master_key 注入 secrets_controller（以防刚切换）
    # secrets_controller 会在 _master_key() 中重新读取 settings.json，
    # 所以不需要额外注入，但可以触发迁移
    if old_enc != new_enc and _secrets:
        if new_enc:
            # 开启加密：全量加密现有明文
            logger.info("加密开关开启，开始全量加密 secrets...")
            _secrets.inject_settings_manager(_settings_manager)
            _secrets.migrate_encrypt_all()
        else:
            # 关闭加密：全量解密现有密文
            logger.info("加密开关关闭，开始全量解密 secrets...")
            _secrets.inject_settings_manager(_settings_manager)
            _secrets.migrate_decrypt_all()

    return settings


# ── 密钥同步通行码（方案 A） ─────────────────────────────

class MasterKeyImportRequest(BaseModel):
    master_key: str

@router.get("/settings/master-key/export")
async def export_master_key() -> dict:
    """导出当前主密钥（base64），用于设备间同步通行码。"""
    if _settings_manager is None:
        raise HTTPException(500, "Settings manager not initialized")
    key = _settings_manager.get_or_create_master_key()
    return {"master_key": key, "hint": "请妥善保管，将此通行码输入到目标设备以同步解密能力"}


@router.post("/settings/master-key/import")
async def import_master_key(req: MasterKeyImportRequest) -> dict:
    """导入主密钥（用于其他设备同步解密）。不触发迁移，仅替换本地主密钥。"""
    if _settings_manager is None:
        raise HTTPException(500, "Settings manager not initialized")
    settings = _settings_manager.load_settings()
    settings.master_key = req.master_key
    _settings_manager.save_settings(settings)
    return {"message": "主密钥已导入，后续读写将使用新主密钥"}
