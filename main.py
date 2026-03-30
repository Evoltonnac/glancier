"""
Glanceus entrypoint: boot the FastAPI backend service.
"""

from dotenv import load_dotenv
load_dotenv()

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
from core.master_key_provider import MasterKeyProvider
from core.settings_manager import SettingsManager
from core.refresh_scheduler import RefreshScheduler
from core.scraper_task_store import ScraperTaskStore
from core.network_trust.policy import NetworkTrustPolicy
from core.storage.contract import StorageContract
from core.storage.settings_adapter import SettingsAdapter
from core.storage.migration import run_startup_migration
from core.storage.sqlite_connection import create_sqlite_connection
from core.storage.sqlite_resource_repo import SqliteResourceRepository
from core.storage.sqlite_runtime_repo import SqliteRuntimeRepository
from core.source_update_events import SourceUpdateEventBus
from core.storage.sqlite_trust_rule_repo import SqliteTrustRuleRepository
from core import api


def resolve_initial_log_level() -> int:
    data_root = Path(os.getenv("GLANCEUS_DATA_DIR", "."))
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


def ensure_startup_encryption_key(settings_manager: object, master_key_provider: object) -> None:
    """Provision a master key on startup when encryption is enabled by default."""
    load_settings = getattr(settings_manager, "load_settings", None)
    get_or_create_master_key = getattr(master_key_provider, "get_or_create_master_key", None)
    if not callable(load_settings) or not callable(get_or_create_master_key):
        return

    try:
        settings = load_settings()
    except Exception as exc:
        logger.warning("failed to load settings during startup key provisioning: %s", exc)
        return

    if not getattr(settings, "encryption_enabled", False):
        return

    try:
        get_or_create_master_key()
        logger.info("provisioned encryption master key during startup")
    except Exception as exc:
        logger.warning("failed to provision startup master key: %s", exc)


def resolve_default_http_private_target_policy(settings_manager: object) -> str:
    load_settings = getattr(settings_manager, "load_settings", None)
    if not callable(load_settings):
        return "prompt"
    try:
        settings = load_settings()
    except Exception:
        return "prompt"

    value = getattr(settings, "http_private_target_policy_default", "prompt")
    if isinstance(value, str) and value in {"prompt", "allow", "deny"}:
        return value
    return "prompt"


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
    storage_connection = getattr(app.state, "storage_connection", None)
    if storage_connection is not None:
        storage_connection.close()


def create_app() -> FastAPI:
    """Create and configure the FastAPI app."""
    app = FastAPI(
        title="Glanceus API",
        description="API for metric monitoring and data aggregation",
        version="1.2.0",
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

    # System settings manager remains JSON-backed.
    settings_manager = SettingsManager()

    # Shared storage contract for runtime/resources/settings boundary.
    storage_connection = create_sqlite_connection()
    trust_rule_repo = SqliteTrustRuleRepository(storage_connection)
    network_trust_policy = NetworkTrustPolicy(
        rule_repository=trust_rule_repo,
        default_policy_resolver=lambda: resolve_default_http_private_target_policy(settings_manager),
    )
    storage_contract = StorageContract(
        runtime=SqliteRuntimeRepository(storage_connection),
        resources=SqliteResourceRepository(storage_connection),
        settings=SettingsAdapter(settings_manager),
        trust_rules=trust_rule_repo,
    )
    run_startup_migration(storage_contract)

    # Initialize resource managers (used by first-launch seeding).
    resource_manager = ResourceManager(storage=storage_contract)
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

    source_update_bus = SourceUpdateEventBus()

    # Persistent runtime data store.
    data_controller = DataController(
        storage=storage_contract,
        source_update_bus=source_update_bus,
    )

    # Sensitive secret storage.
    secrets_controller = SecretsController()

    # Authentication manager.
    auth_manager = AuthManager(
        secrets_controller,
        app_config=config,
        settings_manager=settings_manager,
    )

    settings_file = getattr(
        settings_manager,
        "settings_file",
        Path(os.getenv("GLANCEUS_DATA_DIR", ".")) / "data" / "settings.json",
    )
    master_key_provider = MasterKeyProvider.from_settings_file(settings_file)
    ensure_startup_encryption_key(settings_manager, master_key_provider)

    # Executor.
    scraper_task_store = ScraperTaskStore()
    executor = Executor(
        data_controller,
        secrets_controller,
        settings_manager,
        scraper_task_store=scraper_task_store,
        network_trust_policy=network_trust_policy,
    )

    # Inject SettingsManager and MasterKeyProvider into SecretsController.
    secrets_controller.inject_settings_manager(settings_manager)
    secrets_controller.inject_master_key_provider(master_key_provider)

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
        master_key_provider=master_key_provider,
        scraper_task_store=scraper_task_store,
        source_update_bus=source_update_bus,
        trust_rule_repo=trust_rule_repo,
        network_trust_policy=network_trust_policy,
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
    app.state.storage_contract = storage_contract
    app.state.storage_connection = storage_connection
    app.state.trust_rule_repo = trust_rule_repo
    app.state.network_trust_policy = network_trust_policy
    app.state.startup_background_tasks = startup_background_tasks
    app.state.refresh_scheduler = refresh_scheduler

    return app


def main():
    """Application entrypoint."""
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8400

    logger.info("starting Glanceus backend (port=%s)...", port)

    app = create_app()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
