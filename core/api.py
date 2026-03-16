"""
FastAPI routes exposing REST APIs for frontend and external callers.
"""

import logging
from copy import deepcopy
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse

from pydantic import BaseModel
from core.models import StoredSource, StoredView, ViewItem
from core.integration_manager import IntegrationManager
from core.error_formatter import build_error_envelope
from core.source_state import SourceStatus, InteractionType, InteractionRequest
from core.refresh_policy import (
    DEFAULT_GLOBAL_REFRESH_INTERVAL_MINUTES,
    REFRESH_INTERVAL_OPTIONS_MINUTES,
    normalize_refresh_interval_minutes,
    resolve_refresh_interval_minutes,
)
import yaml

class FileContentRequest(BaseModel):
    content: str


class IntegrationPresetPayload(BaseModel):
    id: str
    label: str
    description: str
    filename_hint: str
    content_template: str


class ScraperTaskClaimRequest(BaseModel):
    worker_id: str
    lease_seconds: int = 20


class ScraperTaskHeartbeatRequest(BaseModel):
    worker_id: str
    source_id: str
    task_id: str
    attempt: int | None = None
    lease_seconds: int = 20


class ScraperTaskCompleteRequest(BaseModel):
    worker_id: str
    source_id: str
    task_id: str
    attempt: int | None = None
    data: Any


class ScraperTaskFailRequest(BaseModel):
    worker_id: str
    source_id: str
    task_id: str
    attempt: int | None = None
    error: str

logger = logging.getLogger(__name__)
DEFAULT_PRESETS_DIR = Path(__file__).resolve().parent.parent / "config" / "presets"

router = APIRouter(prefix="/api")

# These global references are injected from main.py.
# These global references are injected from main.py.
_executor = None
_data_controller = None
_config = None
_auth_manager = None
_secrets = None
_resource_manager = None
_integration_manager = None
_settings_manager = None
_scraper_task_store = None


def init_api(
    executor,
    data_controller,
    config,
    auth_manager,
    secrets_controller,
    resource_manager,
    integration_manager,
    settings_manager=None,
    scraper_task_store=None,
):
    """Inject global dependencies (called by main.py)."""
    global _executor, _data_controller, _config, _auth_manager, _secrets, _resource_manager, _integration_manager, _settings_manager, _scraper_task_store
    _executor = executor
    _data_controller = data_controller
    _config = config
    _auth_manager = auth_manager
    _secrets = secrets_controller
    _resource_manager = resource_manager
    _integration_manager = integration_manager
    _settings_manager = settings_manager
    _scraper_task_store = scraper_task_store


def get_runtime_config():
    """Expose current runtime config snapshot (used by background services)."""
    return _config


def _resolve_integration_presets_dir(config_root: Path | None) -> Optional[Path]:
    """Resolve presets directory with bundled fallback when workspace presets are absent."""
    if config_root is not None:
        workspace_dir = config_root / "presets"
        if workspace_dir.is_dir():
            return workspace_dir
    if DEFAULT_PRESETS_DIR.is_dir():
        return DEFAULT_PRESETS_DIR
    return None


def _require_local_request(request: Request) -> None:
    client_host = request.client.host if request.client else ""
    if client_host in {"127.0.0.1", "::1", "localhost", "testclient"}:
        return
    raise HTTPException(403, "Internal scraper endpoint is localhost-only")


def _build_webview_interaction_from_task(task: dict[str, Any], message: str) -> InteractionRequest:
    return InteractionRequest(
        type=InteractionType.WEBVIEW_SCRAPE,
        step_id=task.get("step_id") or "webview",
        source_id=task.get("source_id"),
        title="Manual Action Required",
        message=message,
        fields=[],
        data={
            "task_id": task.get("task_id"),
            "url": task.get("url"),
            "script": task.get("script"),
            "intercept_api": task.get("intercept_api"),
            "secret_key": task.get("secret_key"),
            "force_foreground": True,
            "manual_only": True,
        },
    )


def _apply_runtime_log_level(debug_enabled: bool) -> None:
    level = logging.DEBUG if debug_enabled else logging.INFO
    logging.getLogger().setLevel(level)
    logging.getLogger("uvicorn").setLevel(level)
    logging.getLogger("uvicorn.error").setLevel(level)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)


# ── Source Listing ────────────────────────────────────

@router.get("/sources")
async def list_sources() -> list[dict]:
    """Return all stored sources with runtime state snapshot."""
    stored_sources = _resource_manager.load_sources()
    global_refresh_interval = DEFAULT_GLOBAL_REFRESH_INTERVAL_MINUTES
    if _settings_manager is not None:
        try:
            loaded_settings = _settings_manager.load_settings()
            global_refresh_interval = (
                normalize_refresh_interval_minutes(
                    getattr(loaded_settings, "refresh_interval_minutes", None),
                )
                or DEFAULT_GLOBAL_REFRESH_INTERVAL_MINUTES
            )
        except Exception:
            logger.warning("Failed to load settings for refresh policy; fallback to global default")

    result = []
    for source in stored_sources:
        # Read persisted state (from data.json).
        latest_data = _data_controller.get_latest(source.id)

        # Prefer persisted state; fallback to in-memory runtime state.
        # Runtime memory state is lost on restart, so persisted data comes first.
        persisted_status = latest_data.get("status") if latest_data else None
        persisted_message = latest_data.get("message") if latest_data else None
        persisted_interaction = latest_data.get("interaction") if latest_data else None

        # Read runtime state (in-memory).
        runtime_state = _executor.get_source_state(source.id)

        # Resolve has_data.
        has_data = latest_data is not None and latest_data.get("data") is not None

        # Resolve error (persisted error first, then runtime ERROR first line).
        error = latest_data.get("error") if latest_data else None
        if not error and runtime_state and runtime_state.status == SourceStatus.ERROR and runtime_state.message:
            error = runtime_state.message.splitlines()[0].strip() or "Execution failed"

        # Prefer persisted status/message; fallback to runtime values.
        status = persisted_status if persisted_status else (runtime_state.status.value if runtime_state else "disabled")
        message = persisted_message if persisted_message else (runtime_state.message if runtime_state else None)
        interaction = persisted_interaction if persisted_interaction else (runtime_state.interaction.model_dump() if runtime_state and runtime_state.interaction else None)

        # Build SourceSummary.
        source_refresh_interval = normalize_refresh_interval_minutes(
            source.config.get("refresh_interval_minutes")
            if isinstance(source.config, dict)
            else None
        )
        integration_refresh_interval = None
        effective_refresh_interval = global_refresh_interval
        effective_refresh_source = "global"
        last_success_at = (
            latest_data.get("last_success_at")
            if latest_data and isinstance(latest_data, dict)
            else None
        )
        if last_success_at is None and latest_data and latest_data.get("data") is not None:
            # Backward-compatible fallback for old records before `last_success_at` was introduced.
            last_success_at = latest_data.get("updated_at")

        summary = {
            "id": source.id,
            "name": source.name,
            "integration_id": source.integration_id,
            "description": "", # Integration doesn't have description at top level in StoredSource config usually
            "icon": None,
            "enabled": True,  # StoredSource is enabled by default.
            "auth_type": "none", # Will be updated below
            "has_data": has_data,
            "updated_at": latest_data.get("updated_at") if latest_data else None,
            "error": error,
            "error_details": message if status == "error" else None,
            "status": status,
            "message": message,
            "interaction": interaction,
            "refresh_interval_minutes": source_refresh_interval,
            "integration_refresh_interval_minutes": integration_refresh_interval,
            "global_refresh_interval_minutes": global_refresh_interval,
            "effective_refresh_interval_minutes": effective_refresh_interval,
            "effective_refresh_interval_source": effective_refresh_source,
            "last_success_at": last_success_at,
        }

        # Try to determine auth_type from flow
        integration = _config.get_integration(source.integration_id)
        if integration and integration.flow:
            for step in integration.flow:
                if step.use.value == "oauth":
                    summary["auth_type"] = "oauth"
                    break
                elif step.use.value == "api_key":
                    summary["auth_type"] = "api_key"
                    break
        integration_refresh_interval = normalize_refresh_interval_minutes(
            getattr(integration, "default_refresh_interval_minutes", None)
            if integration
            else None,
        )
        effective_refresh_interval, effective_refresh_source = resolve_refresh_interval_minutes(
            source_refresh_interval,
            integration_refresh_interval,
            global_refresh_interval,
        )
        summary["integration_refresh_interval_minutes"] = integration_refresh_interval
        summary["effective_refresh_interval_minutes"] = effective_refresh_interval
        summary["effective_refresh_interval_source"] = effective_refresh_source

        result.append(summary)

    return result


# ── Data Query ────────────────────────────────────────

def _get_stored_source(source_id: str) -> "StoredSource | None":
    """Read source from JSON storage."""
    stored_sources = _resource_manager.load_sources()
    for stored in stored_sources:
        if stored.id == source_id:
            return stored
    return None

@router.get("/data/{source_id}")
async def get_data(source_id: str) -> dict[str, Any]:
    """Get latest data for a source."""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    latest = _data_controller.get_latest(source_id)
    if latest is None:
        return {"source_id": source_id, "data": None, "message": "暂无数据"}
    return latest


@router.get("/data/{source_id}/history")
async def get_history(source_id: str, limit: int = 100) -> list[dict]:
    """Get historical data for a source."""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    return _data_controller.get_history(source_id, limit=limit)


# ── Manual Refresh ────────────────────────────────────

def _resolve_stored_source_with_config(stored: "StoredSource", config):
    """Resolve StoredSource into executable SourceConfig."""
    import copy
    from core.config_loader import SourceConfig

    # Find referenced integration config.
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

    # Ensure schedule field exists.
    if "schedule" not in base:
        base["schedule"] = {}

    return SourceConfig.model_validate(base)


def _resolve_stored_source(stored: "StoredSource"):
    return _resolve_stored_source_with_config(stored, _config)


def _resume_source_after_oauth(source_id: str, background_tasks: BackgroundTasks, message: str) -> None:
    """
    Auto-resume source flow after OAuth success.
    Trigger only when source is currently suspended on OAuth interaction.
    """
    if _executor is None:
        return

    if not hasattr(_executor, "get_source_state"):
        return

    state = _executor.get_source_state(source_id)
    runtime_status = getattr(state, "status", None) if state else None
    runtime_interaction_type = (
        getattr(getattr(state, "interaction", None), "type", None)
        if state
        else None
    )
    runtime_waiting_oauth = (
        runtime_status == SourceStatus.SUSPENDED
        and runtime_interaction_type in {InteractionType.OAUTH_START, InteractionType.OAUTH_DEVICE_FLOW}
    )

    # Runtime state can be reset after backend restart, while persisted state still
    # indicates OAuth interaction is pending. In that case, fallback to persisted state.
    persisted_waiting_oauth = False
    if not runtime_waiting_oauth and _data_controller is not None and hasattr(_data_controller, "get_latest"):
        latest = _data_controller.get_latest(source_id)
        if isinstance(latest, dict):
            persisted_status = str(latest.get("status") or "").strip().lower()
            persisted_interaction = latest.get("interaction")
            persisted_interaction_type = ""
            if isinstance(persisted_interaction, dict):
                persisted_interaction_type = str(persisted_interaction.get("type") or "").strip().lower()
            persisted_waiting_oauth = (
                persisted_status == SourceStatus.SUSPENDED.value
                and persisted_interaction_type
                in {InteractionType.OAUTH_START.value, InteractionType.OAUTH_DEVICE_FLOW.value}
            )

    if not runtime_waiting_oauth and not persisted_waiting_oauth:
        return

    stored = _get_stored_source(source_id)
    if stored is None:
        logger.warning(f"[{source_id}] OAuth authorized but stored source missing; skip auto resume")
        return

    source = _resolve_stored_source(stored)
    if source is None:
        logger.warning(f"[{source_id}] OAuth authorized but source resolve failed; skip auto resume")
        return

    if hasattr(_executor, "_update_state"):
        _executor._update_state(source_id, SourceStatus.REFRESHING, message)
    if hasattr(_executor, "fetch_source"):
        background_tasks.add_task(_executor.fetch_source, source)


def create_stored_source_record(
    source: StoredSource,
    resource_manager,
    *,
    executor=None,
    config=None,
    background_tasks: BackgroundTasks | None = None,
) -> StoredSource:
    saved = resource_manager.save_source(source)
    if executor is not None and config is not None and background_tasks is not None:
        resolved = _resolve_stored_source_with_config(saved, config)
        if resolved:
            background_tasks.add_task(executor.fetch_source, resolved)
    return saved


def build_template_lookup_from_config(config) -> dict[str, dict[str, dict[str, Any]]]:
    template_lookup: dict[str, dict[str, dict[str, Any]]] = {}
    integrations = getattr(config, "integrations", []) if config is not None else []
    for integration in integrations:
        templates_by_id: dict[str, dict[str, Any]] = {}
        for template in integration.templates:
            template_payload = template.model_dump(exclude_none=True)
            template_id = str(template_payload.get("id", "")).strip()
            if not template_id:
                continue
            templates_by_id[template_id] = template_payload
        if templates_by_id:
            template_lookup[integration.id] = templates_by_id
    return template_lookup


def _merge_template_props(
    template_payload: dict[str, Any],
    overrides: dict[str, Any],
) -> dict[str, Any]:
    merged = deepcopy(template_payload)
    for key, value in overrides.items():
        base_value = merged.get(key)
        if isinstance(base_value, dict) and isinstance(value, dict):
            merged[key] = _merge_template_props(base_value, value)
            continue
        merged[key] = deepcopy(value)
    return merged


def _extract_template_overrides(
    current_props: dict[str, Any],
    template_payload: dict[str, Any],
) -> dict[str, Any]:
    overrides: dict[str, Any] = {}
    for key, value in current_props.items():
        if key not in template_payload:
            overrides[key] = deepcopy(value)
            continue

        template_value = template_payload[key]
        if isinstance(value, dict) and isinstance(template_value, dict):
            nested_overrides = _extract_template_overrides(value, template_value)
            if nested_overrides:
                overrides[key] = nested_overrides
            continue

        if value != template_value:
            overrides[key] = deepcopy(value)
    return overrides


def _resolve_item_template_payload(
    item: ViewItem,
    *,
    source_by_id: dict[str, StoredSource],
    template_lookup_by_integration: dict[str, dict[str, dict[str, Any]]],
) -> dict[str, Any] | None:
    source = source_by_id.get(item.source_id)
    if source is None:
        return None
    integration_templates = template_lookup_by_integration.get(source.integration_id, {})
    return integration_templates.get(item.template_id)


def _is_legacy_template_snapshot(item: ViewItem, props: dict[str, Any]) -> bool:
    """
    Legacy view items stored full template snapshots in props (`id` + `type` etc).
    Treat those as no overrides so template updates can flow through.
    """
    return props.get("id") == item.template_id and "type" in props


def inject_view_item_props_from_templates(
    view: StoredView,
    *,
    source_by_id: dict[str, StoredSource],
    template_lookup_by_integration: dict[str, dict[str, dict[str, Any]]],
) -> StoredView:
    """
    Build effective runtime props by combining current template payload with item overrides.
    """
    hydrated_items: list[ViewItem] = []
    for item in view.items:
        template_payload = _resolve_item_template_payload(
            item,
            source_by_id=source_by_id,
            template_lookup_by_integration=template_lookup_by_integration,
        )
        if template_payload is None:
            hydrated_items.append(item)
            continue

        raw_props = item.props if isinstance(item.props, dict) else {}
        if _is_legacy_template_snapshot(item, raw_props):
            raw_props = {}

        merged_props = _merge_template_props(dict(template_payload), raw_props)
        hydrated_items.append(item.model_copy(update={"props": merged_props}))

    return view.model_copy(update={"items": hydrated_items})


def normalize_view_item_props_for_storage(
    view: StoredView,
    *,
    source_by_id: dict[str, StoredSource],
    template_lookup_by_integration: dict[str, dict[str, dict[str, Any]]],
) -> StoredView:
    """
    Persist only item-level overrides instead of full template snapshots.
    """
    normalized_items: list[ViewItem] = []
    for item in view.items:
        template_payload = _resolve_item_template_payload(
            item,
            source_by_id=source_by_id,
            template_lookup_by_integration=template_lookup_by_integration,
        )
        if template_payload is None:
            normalized_items.append(item)
            continue

        raw_props = item.props if isinstance(item.props, dict) else {}
        if _is_legacy_template_snapshot(item, raw_props):
            raw_props = {}

        overrides = _extract_template_overrides(raw_props, dict(template_payload))
        normalized_items.append(item.model_copy(update={"props": overrides}))

    return view.model_copy(update={"items": normalized_items})


def create_stored_view_record(
    view: StoredView,
    resource_manager,
    *,
    config=None,
    source_by_id: dict[str, StoredSource] | None = None,
    template_lookup_by_integration: dict[str, dict[str, dict[str, Any]]] | None = None,
) -> StoredView:
    prepared_view = view
    if source_by_id is None:
        source_by_id = {source.id: source for source in resource_manager.load_sources()}

    if template_lookup_by_integration is None and config is not None:
        template_lookup_by_integration = build_template_lookup_from_config(config)

    if source_by_id and template_lookup_by_integration:
        prepared_view = normalize_view_item_props_for_storage(
            view,
            source_by_id=source_by_id,
            template_lookup_by_integration=template_lookup_by_integration,
        )

    saved_view = resource_manager.save_view(prepared_view)

    if source_by_id and template_lookup_by_integration:
        return inject_view_item_props_from_templates(
            saved_view,
            source_by_id=source_by_id,
            template_lookup_by_integration=template_lookup_by_integration,
        )

    return saved_view


@router.post("/refresh/{source_id}")
async def refresh_source(source_id: str, background_tasks: BackgroundTasks) -> dict:
    """Manually trigger refresh for one source."""
    # Read source from JSON storage.
    stored_sources = _resource_manager.load_sources()
    matched_stored = None
    source = None
    for stored in stored_sources:
        if stored.id == source_id:
            matched_stored = stored
            source = _resolve_stored_source(stored)
            break

    if matched_stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")
    if source is None:
        integration_id = matched_stored.integration_id if hasattr(matched_stored, "integration_id") else ""
        raise HTTPException(
            409,
            f"数据源 '{source_id}' 的集成配置 '{integration_id}' 未找到或无效，无法刷新",
        )

    # Update status immediately so frontend does not read stale state.
    _executor._update_state(source_id, SourceStatus.REFRESHING, "Fetching latest data...")
    background_tasks.add_task(_executor.fetch_source, source)
    return {"message": f"已触发刷新: {source.name}", "source_id": source_id}


@router.post("/refresh")
async def refresh_all(background_tasks: BackgroundTasks) -> dict:
    """Manually trigger refresh for all sources."""
    source_ids = []
    skipped_sources = []

    # Refresh sources from JSON storage.
    stored_sources = _resource_manager.load_sources()
    for stored in stored_sources:
        resolved = _resolve_stored_source(stored)
        if resolved:
            # Update status to refreshing immediately.
            _executor._update_state(stored.id, SourceStatus.REFRESHING, "Refreshing all sources...")
            background_tasks.add_task(_executor.fetch_source, resolved)
            source_ids.append(stored.id)
        else:
            _executor._update_state(
                stored.id,
                SourceStatus.ERROR,
                f"Integration '{stored.integration_id}' is missing or invalid",
            )
            skipped_sources.append(stored.id)

    return {
        "message": f"已触发刷新 {len(source_ids)} 个数据源",
        "source_ids": source_ids,
        "skipped_source_ids": skipped_sources,
    }


def _serialize_scraper_task(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "task_id": task.get("task_id"),
        "source_id": task.get("source_id"),
        "step_id": task.get("step_id"),
        "url": task.get("url"),
        "script": task.get("script"),
        "intercept_api": task.get("intercept_api"),
        "secret_key": task.get("secret_key"),
        "status": task.get("status"),
        "attempt": task.get("attempt_count"),
        "lease_expires_at": task.get("lease_expires_at"),
    }


@router.post("/internal/scraper/claim")
async def internal_claim_scraper_task(
    payload: ScraperTaskClaimRequest,
    request: Request,
) -> dict[str, Any]:
    _require_local_request(request)
    if _scraper_task_store is None:
        raise HTTPException(503, "Scraper task store unavailable")
    task = _scraper_task_store.claim_next_task(
        worker_id=payload.worker_id,
        lease_seconds=payload.lease_seconds,
    )
    if task is None:
        return {"task": None}
    return {"task": _serialize_scraper_task(task)}


@router.post("/internal/scraper/heartbeat")
async def internal_heartbeat_scraper_task(
    payload: ScraperTaskHeartbeatRequest,
    request: Request,
) -> dict[str, Any]:
    _require_local_request(request)
    if _scraper_task_store is None:
        raise HTTPException(503, "Scraper task store unavailable")
    task = _scraper_task_store.get_task(payload.task_id)
    if task is None:
        raise HTTPException(404, "Scraper task not found")
    if task.get("source_id") != payload.source_id:
        raise HTTPException(409, "Scraper task/source mismatch")
    updated = _scraper_task_store.heartbeat_task(
        task_id=payload.task_id,
        worker_id=payload.worker_id,
        lease_seconds=payload.lease_seconds,
    )
    if updated is None:
        return {"ok": False, "reason": "lease_owned_by_other_worker"}
    return {"ok": True, "task": _serialize_scraper_task(updated)}


@router.post("/internal/scraper/complete")
async def internal_complete_scraper_task(
    payload: ScraperTaskCompleteRequest,
    background_tasks: BackgroundTasks,
    request: Request,
) -> dict[str, Any]:
    _require_local_request(request)
    if _scraper_task_store is None:
        raise HTTPException(503, "Scraper task store unavailable")
    task = _scraper_task_store.get_task(payload.task_id)
    if task is None:
        raise HTTPException(404, "Scraper task not found")
    if task.get("source_id") != payload.source_id:
        raise HTTPException(409, "Scraper task/source mismatch")

    updated, changed = _scraper_task_store.complete_task(
        task_id=payload.task_id,
        worker_id=payload.worker_id,
        attempt=payload.attempt,
    )
    if updated is None:
        return {"accepted": False, "reason": "lease_owned_by_other_worker"}
    if not changed:
        return {"accepted": True, "idempotent": True, "task": _serialize_scraper_task(updated)}

    secret_key = str(updated.get("secret_key") or "webview_data")
    _secrets.set_secret(payload.source_id, secret_key, payload.data)
    _executor._update_state(
        payload.source_id,
        SourceStatus.REFRESHING,
        "Scraper completed; resuming flow...",
    )

    stored = _get_stored_source(payload.source_id)
    source = _resolve_stored_source(stored) if stored else None
    if source is not None:
        background_tasks.add_task(_executor.fetch_source, source)
    else:
        logger.warning(
            "[%s] Scraper task completed but source resolve failed; skip resume",
            payload.source_id,
        )

    return {
        "accepted": True,
        "idempotent": False,
        "task": _serialize_scraper_task(updated),
    }


@router.post("/internal/scraper/fail")
async def internal_fail_scraper_task(
    payload: ScraperTaskFailRequest,
    request: Request,
) -> dict[str, Any]:
    _require_local_request(request)
    if _scraper_task_store is None:
        raise HTTPException(503, "Scraper task store unavailable")
    task = _scraper_task_store.get_task(payload.task_id)
    if task is None:
        raise HTTPException(404, "Scraper task not found")
    if task.get("source_id") != payload.source_id:
        raise HTTPException(409, "Scraper task/source mismatch")

    updated, changed = _scraper_task_store.fail_task(
        task_id=payload.task_id,
        worker_id=payload.worker_id,
        error=payload.error,
        attempt=payload.attempt,
    )
    if updated is None:
        return {"accepted": False, "reason": "lease_owned_by_other_worker"}
    if not changed:
        return {"accepted": True, "idempotent": True, "task": _serialize_scraper_task(updated)}

    interaction = _build_webview_interaction_from_task(
        updated,
        message=f"Web scraper failed: {payload.error}. Resume in foreground mode.",
    )
    _executor._update_state(
        payload.source_id,
        SourceStatus.SUSPENDED,
        payload.error,
        interaction=interaction,
    )
    return {
        "accepted": True,
        "idempotent": False,
        "task": _serialize_scraper_task(updated),
    }


# ── Config Query ──────────────────────────────────────

@router.get("/config")
async def get_config() -> dict[str, Any]:
    """Get config summary without sensitive fields."""
    # Return sources from JSON storage.
    stored_sources = _resource_manager.load_sources()
    sources = []
    for s in stored_sources:
        integration = _config.get_integration(s.integration_id) if s.integration_id else None
        auth_type = "none"
        if integration and integration.flow:
            for step in integration.flow:
                if step.use.value == "oauth":
                    auth_type = "oauth"
                    break
                elif step.use.value == "api_key":
                    auth_type = "api_key"
                    break
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


# ── OAuth Callbacks ───────────────────────────────────

@router.get("/oauth/authorize/{source_id}")
async def oauth_authorize(source_id: str, redirect_uri: Optional[str] = None) -> dict:
    """Start OAuth authorization. Supports code/device/client-credentials flows."""
    handler = _auth_manager.get_oauth_handler(source_id)
    if handler is None:
        stored = _get_stored_source(source_id)
        if stored:
            source = _resolve_stored_source(stored)
            if source:
                _auth_manager.register_source(source)
                handler = _auth_manager.get_oauth_handler(source_id)

    if handler is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不是 OAuth 类型")
    try:
        logger.info(f"[{source_id}] Starting OAuth authorization with redirect_uri: {redirect_uri}")
        result = await handler.start_authorization(redirect_uri=redirect_uri)
        logger.info(f"[{source_id}] OAuth authorization result: {result}")
    except ValueError as exc:
        logger.error(f"[{source_id}] OAuth authorization ValueError: {exc}")
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.error(f"[{source_id}] OAuth authorize start failed: {exc}")
        raise HTTPException(400, f"OAuth start failed: {exc}") from exc

    if result.get("flow") == "code":
        result.setdefault("message", "请在浏览器中打开授权链接")
    elif result.get("flow") == "device":
        result.setdefault("message", "请在设备授权页面输入验证码")
    elif result.get("flow") == "client_credentials":
        result.setdefault("message", "Client Credentials token acquired")

    return result


@router.get("/oauth/device/poll/{source_id}")
async def oauth_device_poll(source_id: str, background_tasks: BackgroundTasks) -> dict[str, Any]:
    """Poll one round of device flow token exchange."""
    handler = _auth_manager.get_oauth_handler(source_id)
    if handler is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不是 OAuth 类型")

    try:
        result = await handler.poll_device_token()
        if result.get("status") == "authorized":
            _resume_source_after_oauth(
                source_id,
                background_tasks,
                "OAuth 授权成功，正在继续执行数据拉取...",
            )
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.error(f"[{source_id}] Device flow poll failed: {exc}")
        raise HTTPException(400, f"Device flow poll failed: {exc}") from exc


@router.get("/oauth/device/status/{source_id}")
async def oauth_device_status(source_id: str, background_tasks: BackgroundTasks) -> dict[str, Any]:
    """Get current device flow status without implicit polling."""
    handler = _auth_manager.get_oauth_handler(source_id)
    if handler is None:
        stored = _get_stored_source(source_id)
        if stored:
            source = _resolve_stored_source(stored)
            if source:
                _auth_manager.register_source(source)
                handler = _auth_manager.get_oauth_handler(source_id)

    if handler is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不是 OAuth 类型")

    try:
        # Check if handler has get_device_flow_status method
        if hasattr(handler, "get_device_flow_status"):
            result = await handler.get_device_flow_status()
        else:
            # Fallback: try polling
            result = await handler.poll_device_token()

        if result.get("status") == "authorized":
            _resume_source_after_oauth(
                source_id,
                background_tasks,
                "OAuth 授权成功，正在继续执行数据拉取...",
            )
        return result
    except ValueError as exc:
        # No pending device flow - return idle
        return {"status": "idle"}
    except Exception as exc:
        logger.error(f"[{source_id}] Device flow status check failed: {exc}")
        raise HTTPException(400, f"Device flow status check failed: {exc}") from exc



# ── Interaction API ───────────────────────────────────

@router.post("/sources/{source_id}/interact")
async def interact_source(source_id: str, data: dict[str, Any], background_tasks: BackgroundTasks) -> dict:
    """
    Handle source interaction requests (for example API key, captcha).
    Data shape depends on interaction.type.
    """
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    # Resolve StoredSource into SourceConfig.
    source = _resolve_stored_source(stored)
    if source is None:
        raise HTTPException(500, f"无法解析数据源 '{source_id}'")

    state = _executor.get_source_state(source_id)
    
    # Special Handling: OAuth Code Exchange (Client-Side Callback)
    interaction_type = data.get("type")

    if interaction_type == "oauth_code_exchange":
        handler = _auth_manager.get_oauth_handler(source_id)
        if not handler:
            _auth_manager.register_source(source)
            handler = _auth_manager.get_oauth_handler(source_id)
        
        if not handler:
             raise HTTPException(400, "Source is not OAuth type")
        
        code_field = getattr(getattr(handler, "config", None), "authorization_code_field", "code") or "code"
        code = data.get("code")
        if not code and code_field != "code":
            code = data.get(code_field)
        redirect_uri = data.get("redirect_uri")
        if not code:
            raise HTTPException(400, f"Missing OAuth authorization code in interaction data (field: {code_field})")
            
        try:
            await handler.exchange_code(code, redirect_uri=redirect_uri)
        except Exception as e:
            logger.error(f"[{source_id}] OAuth Exchange Failed: {e}")
            raise HTTPException(400, f"授权失败: {str(e)}")
        
        background_tasks.add_task(_executor.fetch_source, source)
        return {"message": "OAuth 授权成功", "source_id": source_id}

    if interaction_type == "oauth_implicit_token":
        handler = _auth_manager.get_oauth_handler(source_id)
        if not handler:
            _auth_manager.register_source(source)
            handler = _auth_manager.get_oauth_handler(source_id)

        if not handler:
            raise HTTPException(400, "Source is not OAuth type")

        token_payload = handler.build_implicit_token_payload(data)
        access_token = token_payload.get("access_token")
        if not access_token:
            raise HTTPException(400, "Missing access_token in interaction data")

        try:
            handler.store_implicit_token(token_payload)
        except Exception as exc:
            logger.error(f"[{source_id}] OAuth implicit token store failed: {exc}")
            raise HTTPException(400, f"授权失败: {exc}") from exc

        background_tasks.add_task(_executor.fetch_source, source)
        return {"message": "OAuth Token 已保存", "source_id": source_id}
    
    # Check pending interaction request.
    if not state.interaction:
        # If there is no explicit pending request, treat as generic update.
        logger.warning(f"[{source_id}] Received interaction but no pending interaction request found.")
    
    # Resolve source_id (prefer pending interaction source_id).
    target_source_id = state.interaction.source_id if state.interaction else None

    # Allow request payload source_id to override pending-state source_id.
    if "source_id" in data:
        target_source_id = data.pop("source_id")

    # Fallback to route source_id when unresolved.
    if not target_source_id:
        target_source_id = source_id

    if data:
        # Save interaction data into Secrets keyed by source_id.
        # Assumes data is a flat dictionary.
        _secrets.set_secrets(target_source_id, data)
        logger.info(f"[{source_id}] Received interaction data for source '{target_source_id}'.")
    
    # Update status to refreshing.
    _executor._update_state(source_id, SourceStatus.REFRESHING, "Processing interaction results...")
    # Trigger retry/resume
    # fetch_source handles "resume" by just running again and hopefully succeeding this time
    background_tasks.add_task(_executor.fetch_source, source)
    
    return {"message": "Interact received, retrying source.", "source_id": source_id}


# ── Auth Status ───────────────────────────────────────

@router.get("/sources/{source_id}/auth-status")
async def get_auth_status(source_id: str) -> dict[str, Any]:
    """Query authentication status for source."""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    source = _resolve_stored_source(stored)

    # Lazy registration: ensure auth handler exists.
    if source and _auth_manager.get_oauth_handler(source_id) is None:
        _auth_manager.register_source(source)

    # Determine auth type from integration flow.
    auth_type = "none"
    if source:
        if source.flow:
            for step in source.flow:
                if step.use.value == "oauth":
                    auth_type = "oauth"
                    break
                elif step.use.value == "api_key":
                    auth_type = "api_key"
                    break

    # Check registration errors.
    error = _auth_manager.get_source_error(source_id)
    if error:
        return {
            "source_id": source_id,
            "auth_type": auth_type,
            "status": "error",
            "message": error,
        }
    
    # OAuth-specific check: token availability.
    if auth_type == "oauth":
        handler = _auth_manager.get_oauth_handler(source_id)
        if handler and handler.has_token:
            return {
                "source_id": source_id,
                "auth_type": auth_type,
                "status": "ok",
            }
        else:
            # Check for pending device flow
            if handler and hasattr(handler, "get_device_flow_status"):
                try:
                    device_status = await handler.get_device_flow_status()
                    if device_status.get("status") == "pending":
                        return {
                            "source_id": source_id,
                            "auth_type": auth_type,
                            "status": "pending",
                            "message": "等待设备授权确认",
                            "device": device_status.get("device"),
                        }
                    if device_status.get("status") == "expired":
                        return {
                            "source_id": source_id,
                            "auth_type": auth_type,
                            "status": "error",
                            "message": "设备授权已过期，请重新发起授权",
                        }
                except Exception:
                    pass  # Fall through to missing
            return {
                "source_id": source_id,
                "auth_type": auth_type,
                "status": "missing",
                "message": "需要 OAuth 授权",
            }
    
    # Other auth types default to ok (validated during real requests).
    return {
        "source_id": source_id,
        "auth_type": auth_type,
        "status": "ok",
    }


# ── Stored Sources (JSON-based) ──────────────────────────────────────────

@router.post("/sources")
async def create_stored_source(source: StoredSource, background_tasks: BackgroundTasks) -> StoredSource:
    """Create a new stored source."""
    return create_stored_source_record(
        source,
        _resource_manager,
        executor=_executor,
        config=_config,
        background_tasks=background_tasks,
    )


@router.put("/sources/{source_id}")
async def update_stored_source(source_id: str, source: StoredSource) -> StoredSource:
    """Update an existing stored source."""
    if source.id != source_id:
        raise HTTPException(400, "ID mismatch")
    return _resource_manager.save_source(source)


class RefreshIntervalUpdateRequest(BaseModel):
    interval_minutes: int | None = None


@router.put("/sources/{source_id}/refresh-interval")
async def update_source_refresh_interval(
    source_id: str,
    request: RefreshIntervalUpdateRequest,
) -> dict[str, Any]:
    """Update source-level refresh interval. None=unset, 0=disabled."""
    stored = _get_stored_source(source_id)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    normalized_interval = normalize_refresh_interval_minutes(request.interval_minutes)
    if request.interval_minutes is not None and normalized_interval is None:
        options = ", ".join(str(option) for option in REFRESH_INTERVAL_OPTIONS_MINUTES)
        raise HTTPException(400, f"Invalid refresh interval. Supported values: {options}, or null")

    config = dict(stored.config) if isinstance(stored.config, dict) else {}
    if normalized_interval is None:
        config.pop("refresh_interval_minutes", None)
    else:
        config["refresh_interval_minutes"] = normalized_interval

    updated = stored.model_copy(update={"config": config})
    _resource_manager.save_source(updated)
    return {
        "source_id": source_id,
        "refresh_interval_minutes": normalized_interval,
    }


@router.delete("/sources/{source_id}")
async def delete_stored_source(source_id: str) -> dict:
    """Delete stored source."""
    if not _resource_manager.delete_source(source_id):
        raise HTTPException(404, f"Source {source_id} not found")

    cleanup_warnings: list[str] = []
    affected_view_ids: list[str] = []

    try:
        if _data_controller and hasattr(_data_controller, "clear_source"):
            _data_controller.clear_source(source_id)
    except Exception as exc:
        logger.warning(
            "[%s] Failed to clear source data during source deletion: %s",
            source_id,
            exc,
        )
        cleanup_warnings.append("data")

    try:
        if _secrets and hasattr(_secrets, "delete_secrets"):
            _secrets.delete_secrets(source_id)
    except Exception as exc:
        logger.warning(
            "[%s] Failed to clear source secrets during source deletion: %s",
            source_id,
            exc,
        )
        cleanup_warnings.append("secrets")

    try:
        if _resource_manager and hasattr(_resource_manager, "remove_source_references_from_views"):
            affected_view_ids = _resource_manager.remove_source_references_from_views(source_id)
    except Exception as exc:
        logger.warning(
            "[%s] Failed to clear source references from views: %s",
            source_id,
            exc,
        )
        cleanup_warnings.append("views")

    # Best-effort cleanup of runtime memory state for removed source.
    try:
        if _executor and hasattr(_executor, "_states"):
            _executor._states.pop(source_id, None)
    except Exception:
        pass

    try:
        if _auth_manager and hasattr(_auth_manager, "_handlers"):
            _auth_manager._handlers.pop(source_id, None)
        if _auth_manager and hasattr(_auth_manager, "clear_error"):
            _auth_manager.clear_error(source_id)
    except Exception:
        pass

    return {
        "message": f"Source {source_id} deleted",
        "source_id": source_id,
        "cleanup": {
            "data_cleared": "data" not in cleanup_warnings,
            "secrets_cleared": "secrets" not in cleanup_warnings,
            "affected_view_ids": affected_view_ids,
            "affected_view_count": len(affected_view_ids),
            "warnings": cleanup_warnings,
        },
    }


# ── Stored Views (JSON-based) ─────────────────────────────────────────────

@router.get("/views")
async def list_stored_views() -> list[StoredView]:
    """Get all stored views."""
    views = _resource_manager.load_views()
    if not views:
        return views

    source_by_id = {source.id: source for source in _resource_manager.load_sources()}
    template_lookup_by_integration = build_template_lookup_from_config(_config)
    if not source_by_id or not template_lookup_by_integration:
        return views

    return [
        inject_view_item_props_from_templates(
            view,
            source_by_id=source_by_id,
            template_lookup_by_integration=template_lookup_by_integration,
        )
        for view in views
    ]


@router.post("/views")
async def create_stored_view(view: StoredView) -> StoredView:
    """Create new stored view."""
    return create_stored_view_record(view, _resource_manager, config=_config)


@router.put("/views/{view_id}")
async def update_stored_view(view_id: str, view: StoredView) -> StoredView:
    """Update stored view."""
    if view.id != view_id:
        raise HTTPException(400, "ID mismatch")
    return create_stored_view_record(view, _resource_manager, config=_config)


@router.delete("/views/{view_id}")
async def delete_stored_view(view_id: str) -> dict:
    """Delete stored view."""
    if _resource_manager.delete_view(view_id):
        return {"message": f"View {view_id} deleted"}
    raise HTTPException(404, f"View {view_id} not found")


# ── Integration Templates ─────────────────────────────────────────────────

@router.get("/integrations/{integration_id}/templates")
async def get_integration_templates(integration_id: str) -> list[dict]:
    """Get view templates for integration."""
    integration = _config.get_integration(integration_id)
    if integration is None:
        raise HTTPException(404, f"Integration {integration_id} not found")
    return [t.model_dump() for t in integration.templates]


# ── Integration Management (YAML Files) ───────────────────────────────────

@router.get("/integrations/files")
async def list_integration_files() -> list[str]:
    """List all integration config files."""
    return _integration_manager.list_integration_files()


@router.get("/integrations/files/meta")
async def list_integration_file_metadata() -> list[dict]:
    """List integration file metadata."""
    return _integration_manager.list_integration_file_metadata()


@router.get("/integrations/presets")
async def list_integration_presets() -> list[IntegrationPresetPayload]:
    """List integration presets (from config/presets/*.yaml)."""
    config_root = getattr(_integration_manager, "config_root", None)
    resolved_config_root = Path(config_root) if config_root else None
    presets_dir = _resolve_integration_presets_dir(resolved_config_root)
    if presets_dir is None:
        return []

    files: dict[str, Path] = {}
    for pattern in ("*.yaml", "*.yml"):
        for file_path in presets_dir.glob(pattern):
            files[file_path.name] = file_path

    presets: list[IntegrationPresetPayload] = []
    for filename in sorted(files):
        file_path = files[filename]
        try:
            content = file_path.read_text(encoding="utf-8")
            payload = yaml.safe_load(content)
        except Exception as exc:
            logger.warning("Skipping invalid preset file %s: %s", file_path, exc)
            continue

        if not isinstance(payload, dict):
            logger.warning("Skipping preset %s: top-level must be a mapping", file_path)
            continue

        preset_id = str(payload.get("id") or file_path.stem).strip()
        label = str(payload.get("label") or preset_id).strip()
        description = str(payload.get("description") or "").strip()
        filename_hint = str(payload.get("filename_hint") or f"{preset_id}_example").strip()
        content_template = str(payload.get("content_template") or "").rstrip()

        if not preset_id or not content_template:
            logger.warning("Skipping preset %s: missing required id/content_template", file_path)
            continue

        presets.append(
            IntegrationPresetPayload(
                id=preset_id,
                label=label,
                description=description,
                filename_hint=filename_hint,
                content_template=content_template,
            )
        )

    return presets


@router.get("/integrations/files/{filename}")
async def get_integration_file(filename: str) -> dict:
    """Get integration YAML file content."""
    content = _integration_manager.get_integration(filename)
    if content is None:
        raise HTTPException(404, f"Integration file {filename} not found")
    return {
        "filename": filename,
        "content": content,
        "integration_ids": _integration_manager.get_integration_ids_in_file(filename),
        "display_name": _integration_manager.get_integration_display_name(filename),
        "resolved_path": _integration_manager.get_integration_path(filename),
    }


@router.post("/integrations/files")
async def create_integration_file(filename: str, request: FileContentRequest) -> dict:
    """Create new integration YAML file."""
    try:
        normalized_filename = _integration_manager.normalize_filename(filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    existing_files = _integration_manager.list_integration_files()
    if normalized_filename in existing_files:
        raise HTTPException(409, f"Integration {normalized_filename} already exists")

    success = _integration_manager.create_integration(filename, request.content)
    if not success:
        raise HTTPException(500, f"Failed to create integration {normalized_filename}")
    return {"message": f"Integration {normalized_filename} created", "filename": normalized_filename}


@router.put("/integrations/files/{filename}")
async def update_integration_file(filename: str, request: FileContentRequest) -> dict:
    """Update integration YAML file content."""
    # Run Pydantic validation first.
    from core.config_loader import IntegrationConfig
    from pydantic import ValidationError

    try:
        # Parse YAML content.
        parsed = yaml.safe_load(request.content)
        if parsed is None:
            raise HTTPException(400, "Empty YAML content")
        if not isinstance(parsed, dict):
            raise HTTPException(400, "YAML top-level must be an object")

        # Runtime integration id is derived from filename.
        file_based_id = Path(filename).stem
        integration_payload = dict(parsed)
        diagnostics = []

        declared_id = integration_payload.pop("id", None)
        if isinstance(declared_id, str) and declared_id and declared_id != file_based_id:
            diagnostics.append(
                {
                    "source": "backend",
                    "message": (
                        f"Integration id '{declared_id}' conflicts with filename id '{file_based_id}'. "
                        "Please remove id from YAML or rename the file."
                    ),
                    "code": "value_error.integration_id_conflict",
                    "fieldPath": "id",
                }
            )

        integration_payload["id"] = file_based_id

        try:
            IntegrationConfig.model_validate(integration_payload)
        except ValidationError as exc:
            # Convert Pydantic ValidationError into frontend-friendly diagnostics.
            for error in exc.errors():
                field_path = ".".join(str(loc) for loc in error["loc"])
                diagnostics.append({
                    "source": "backend",
                    "message": error["msg"],
                    "code": error["type"],
                    "fieldPath": field_path or "",
                })

        # Return diagnostics when validation fails.
        if diagnostics:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Integration validation failed",
                    "diagnostics": diagnostics
                }
            )

    except yaml.YAMLError as exc:
        # YAML syntax error.
        error_text = str(exc)
        escape_hint = ""
        if "unknown escape character" in error_text and ("{" in error_text or "}" in error_text):
            escape_hint = (
                " Hint: In YAML double-quoted strings, \\{ / \\} is invalid escaping."
                "Use \\\\{ / \\\\}, or switch to single-quoted strings."
            )
        raise HTTPException(400, f"Invalid YAML syntax: {exc}{escape_hint}")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Validation error: %s", exc, exc_info=True)
        raise HTTPException(400, f"Validation failed: {exc}")

    # Save file after validation succeeds.
    success = _integration_manager.save_integration(filename, request.content)
    if not success:
        raise HTTPException(404, f"Integration file {filename} not found")
    return {"message": f"Integration {filename} saved", "filename": filename}


@router.delete("/integrations/files/{filename}")
async def delete_integration_file(filename: str) -> dict:
    """Delete integration YAML file."""
    success = _integration_manager.delete_integration(filename)
    if not success:
        raise HTTPException(404, f"Integration file {filename} not found")
    return {"message": f"Integration {filename} deleted", "filename": filename}


# ── Config Reload ─────────────────────────────────────────────────────

@router.get("/system/health")
async def system_health() -> dict:
    """Lightweight health check for frontend readiness wait."""
    return {"status": "ok"}


_VIEW_ONLY_INTEGRATION_FIELDS = {"templates", "name", "description"}


def _collect_changed_fields(
    old_payload: dict[str, Any] | None,
    new_payload: dict[str, Any] | None,
) -> list[str]:
    if old_payload is None:
        return ["integration_added"]
    if new_payload is None:
        return ["integration_removed"]

    changed_fields: list[str] = []
    for field in sorted(set(old_payload) | set(new_payload)):
        if old_payload.get(field) != new_payload.get(field):
            changed_fields.append(field)
    return changed_fields


def _is_logic_change(changed_fields: list[str]) -> bool:
    if not changed_fields:
        return False

    if "integration_added" in changed_fields or "integration_removed" in changed_fields:
        return True

    return any(field not in _VIEW_ONLY_INTEGRATION_FIELDS for field in changed_fields)


@router.post("/system/reload")
async def reload_config(background_tasks: BackgroundTasks) -> dict:
    """
    Reload config, classify changes as view/logic, and auto-refresh affected sources on logic changes.
    """
    global _config

    # Reload config.
    from core.config_loader import load_config
    try:
        new_config = load_config()
    except Exception as exc:
        logger.error("Configuration reload failed: %s", exc, exc_info=True)
        formatted_error = build_error_envelope(
            code="config.reload_failed",
            summary="Configuration reload failed",
            details=str(exc),
        )
        legacy_detail = formatted_error["summary"]
        if formatted_error["details"] != formatted_error["summary"]:
            legacy_detail = f"{legacy_detail}: {formatted_error['details']}"
        return JSONResponse(
            status_code=400,
            content={
                "detail": legacy_detail,
                "error": formatted_error,
            },
        )

    stored_sources = _resource_manager.load_sources()
    source_ids_by_integration: dict[str, list[str]] = {}
    stored_sources_by_id: dict[str, StoredSource] = {}
    for stored in stored_sources:
        stored_sources_by_id[stored.id] = stored
        if stored.integration_id:
            source_ids_by_integration.setdefault(stored.integration_id, []).append(stored.id)

    old_integrations = {integration.id: integration for integration in _config.integrations}
    new_integrations = {integration.id: integration for integration in new_config.integrations}

    changed_files: list[dict[str, Any]] = []
    changed_ids = sorted(set(old_integrations) | set(new_integrations))
    for integration_id in changed_ids:
        old_integration = old_integrations.get(integration_id)
        new_integration = new_integrations.get(integration_id)

        if (
            old_integration is not None
            and new_integration is not None
            and old_integration.model_dump() == new_integration.model_dump()
        ):
            continue

        changed_fields = _collect_changed_fields(
            old_integration.model_dump() if old_integration else None,
            new_integration.model_dump() if new_integration else None,
        )
        change_scope = "logic" if _is_logic_change(changed_fields) else "view"

        matched_files = (
            _integration_manager.find_files_by_integration_id(integration_id)
            if _integration_manager
            else []
        )
        filename = matched_files[0] if matched_files else f"{integration_id}.yaml"
        related_source_ids = source_ids_by_integration.get(integration_id, [])

        changed_files.append(
            {
                "filename": filename,
                "integration_id": integration_id,
                "change_scope": change_scope,
                "changed_fields": changed_fields,
                "related_sources": related_source_ids,
                "auto_refreshed_sources": [],
            }
        )

    # Update global config snapshot.
    _config = new_config

    affected_sources: list[str] = []
    auto_refreshed_sources: list[str] = []
    auto_refreshed_seen: set[str] = set()

    for changed in changed_files:
        if changed["change_scope"] != "logic":
            continue

        refreshed_for_file: list[str] = []
        for source_id in changed["related_sources"]:
            if source_id in auto_refreshed_seen:
                continue

            stored_source = stored_sources_by_id.get(source_id)
            if stored_source is None:
                continue

            resolved_source = _resolve_stored_source_with_config(stored_source, new_config)
            if resolved_source is None:
                _executor._update_state(
                    source_id,
                    SourceStatus.ERROR,
                    f"Integration '{stored_source.integration_id}' is missing or invalid",
                )
                continue

            _executor._update_state(
                source_id,
                SourceStatus.REFRESHING,
                "Configuration logic changed, refreshing source...",
            )
            background_tasks.add_task(_executor.fetch_source, resolved_source)
            auto_refreshed_seen.add(source_id)
            auto_refreshed_sources.append(source_id)
            affected_sources.append(source_id)
            refreshed_for_file.append(source_id)

        changed["auto_refreshed_sources"] = refreshed_for_file

    return {
        "message": "Configuration reloaded",
        "affected_sources": sorted(affected_sources),
        "auto_refreshed_sources": sorted(auto_refreshed_sources),
        "changed_files": changed_files,
        "total_sources": len(stored_sources),
    }


@router.get("/integrations/files/{filename}/sources")
async def get_integration_sources(filename: str) -> list[dict]:
    """Get all sources using any integration declared in the specified file."""
    content = _integration_manager.get_integration(filename)
    if content is None:
        raise HTTPException(404, f"Integration file {filename} not found")

    integration_ids = set(_integration_manager.get_integration_ids_in_file(filename))
    if not integration_ids:
        return []

    # Look up related sources from JSON storage.
    all_sources = _resource_manager.load_sources()
    related = [s for s in all_sources if s.integration_id in integration_ids]
    return [s.model_dump() for s in related]


# ── System Settings ───────────────────────────────────────────────────

from core.settings_manager import SystemSettings

@router.get("/settings")
async def get_system_settings() -> SystemSettings:
    """Get all system settings."""
    if _settings_manager is None:
        return SystemSettings()
    return _settings_manager.load_settings()

@router.put("/settings")
async def update_system_settings(settings: SystemSettings) -> SystemSettings:
    """Update all system settings and trigger migration on encryption-toggle change."""
    if _settings_manager is None:
        _apply_runtime_log_level(settings.debug_logging_enabled)
        return settings

    old = _settings_manager.load_settings()
    old_enc = old.encryption_enabled
    new_enc = settings.encryption_enabled

    # Save new settings (ensure master key exists before writing).
    if new_enc and not settings.master_key:
        # If encryption is newly enabled and key is missing, generate it first.
        settings.master_key = _settings_manager.get_or_create_master_key()

    _settings_manager.save_settings(settings)
    _apply_runtime_log_level(settings.debug_logging_enabled)

    # Inject new master key context into secrets controller after toggle.
    # secrets_controller re-reads settings.json in _master_key(), but this also triggers migration.
    if old_enc != new_enc and _secrets:
        if new_enc:
            # Enabling encryption: encrypt all existing plaintext.
            logger.info("加密开关开启，开始全量加密 secrets...")
            _secrets.inject_settings_manager(_settings_manager)
            _secrets.migrate_encrypt_all()
        else:
            # Disabling encryption: decrypt all existing ciphertext.
            logger.info("加密开关关闭，开始全量解密 secrets...")
            _secrets.inject_settings_manager(_settings_manager)
            _secrets.migrate_decrypt_all()

    return settings


# ── Key Sync Passcode (Plan A) ────────────────────────

class MasterKeyImportRequest(BaseModel):
    master_key: str

@router.get("/settings/master-key/export")
async def export_master_key() -> dict:
    """Export current base64 master key for cross-device sync."""
    if _settings_manager is None:
        raise HTTPException(500, "Settings manager not initialized")
    key = _settings_manager.get_or_create_master_key()
    return {"master_key": key, "hint": "请妥善保管，将此通行码输入到目标设备以同步解密能力"}


@router.post("/settings/master-key/import")
async def import_master_key(req: MasterKeyImportRequest) -> dict:
    """Import master key for cross-device decryption sync. No migration is triggered."""
    if _settings_manager is None:
        raise HTTPException(500, "Settings manager not initialized")
    settings = _settings_manager.load_settings()
    settings.master_key = req.master_key
    _settings_manager.save_settings(settings)
    return {"message": "主密钥已导入，后续读写将使用新主密钥"}
