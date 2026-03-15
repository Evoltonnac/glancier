"""
Glancier entrypoint: boot the FastAPI backend service.
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
from core.refresh_scheduler import RefreshScheduler
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
    """Resolve a StoredSource into an executable SourceConfig."""
    # Find the referenced integration config.
    integration = config.get_integration(stored.integration_id) if stored.integration_id else None

    if not integration:
        logger.warning(f"[{stored.id}] integration '{stored.integration_id}' not found")
        return None

    # Build base config.
    base = copy.deepcopy(integration.model_dump())
    base.pop("id", None)
    base.pop("templates", None)

    # Apply variable substitution.
    variables = stored.vars
    for k, v in base.items():
        if isinstance(v, str):
            try:
                base[k] = v.format(**variables)
            except (KeyError, IndexError):
                pass
        elif isinstance(v, dict):
            base[k] = {key: val.format(**variables) if isinstance(val, str) else val for key, val in v.items()}

    # Apply source-level overrides.
    for key, val in stored.config.items():
        if key == "vars":
            continue
        base[key] = val

    # Add required fields.
    base["id"] = stored.id
    base["name"] = stored.name

    return SourceConfig.model_validate(base)

# Logging setup.
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
    """Lifespan hook with startup and shutdown handling."""
    refresh_scheduler = getattr(app.state, "refresh_scheduler", None)
    if refresh_scheduler is not None:
        await refresh_scheduler.start()

    startup_tasks = getattr(app.state, "startup_background_tasks", None)
    if startup_tasks is not None:
        scheduled = 0
        for func, args, kwargs in startup_tasks.drain():
            result = func(*args, **kwargs)
            if asyncio.iscoroutine(result):
                asyncio.create_task(result)
            scheduled += 1
        if scheduled:
            logger.info("scheduled %d bootstrap source refresh tasks on startup", scheduled)

    yield  # App is running.

    # Shutdown: stop scheduler and close data controller.
    logger.info("shutting down...")
    if refresh_scheduler is not None:
        await refresh_scheduler.stop()
    app.state.data_controller.close()


def create_app() -> FastAPI:
    """Create and configure the FastAPI app."""
    app = FastAPI(
        title="Glancier API",
        description="API for metric monitoring and data aggregation",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS middleware.
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

    # Initialize resource managers (used by first-launch seeding).
    resource_manager = ResourceManager()
    integration_manager = IntegrationManager()
    existing_source_ids_before_seed = {source.id for source in resource_manager.load_sources()}
    seeded = seed_first_launch_workspace(integration_manager, resource_manager)

    # Load configuration.
    logger.info("loading configuration...")
    try:
        config = load_config()
        logger.info("loaded %d integration configs", len(config.integrations))
    except Exception as exc:
        logger.error("failed to load config; starting with empty config: %s", exc, exc_info=True)
        config = AppConfig()

    # Persistent data store.
    data_controller = DataController()

    # Sensitive secret storage.
    secrets_controller = SecretsController()

    # Authentication manager.
    auth_manager = AuthManager(secrets_controller, app_config=config)

    # System settings manager.
    settings_manager = SettingsManager()

    # Executor.
    executor = Executor(data_controller, secrets_controller, settings_manager)

    # Inject SettingsManager into SecretsController for adaptive encryption/decryption.
    secrets_controller.inject_settings_manager(settings_manager)

    # Reuse the same core flow as API source creation and trigger refresh for seeded sources.
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

    # Inject dependencies into API module.
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

    # Register API routes.
    app.include_router(api.router)

    # Store components in app.state for lifespan access.
    refresh_scheduler = RefreshScheduler(
        executor=executor,
        data_controller=data_controller,
        resource_manager=resource_manager,
        settings_manager=settings_manager,
        get_config=api.get_runtime_config,
        resolve_stored_source=api._resolve_stored_source,
        tick_seconds=10,
        workers=1,
    )

    app.state.config = config
    app.state.executor = executor
    app.state.data_controller = data_controller
    app.state.resource_manager = resource_manager
    app.state.startup_background_tasks = startup_background_tasks
    app.state.refresh_scheduler = refresh_scheduler

    return app


def main():
    """Application entrypoint."""
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8400

    logger.info("starting Glancier backend (port=%s)...", port)

    app = create_app()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
