"""
FastAPI routes exposing REST APIs for frontend and external callers.
"""

import logging
import hmac
import os
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import JSONResponse

from pydantic import BaseModel
from core.models import StoredSource, StoredView, ViewItem
from core.integration_manager import IntegrationManager
from core.error_formatter import build_error_envelope
from core.log_redaction import redact_sensitive_fields, sanitize_log_reason
from core.master_key_provider import MasterKeyUnavailableError
from core.storage.errors import StorageContractError, storage_error_to_api_response
from core.source_state import SourceStatus, InteractionType, InteractionRequest
from core.refresh_policy import (
    DEFAULT_GLOBAL_REFRESH_INTERVAL_MINUTES,
    MAX_REFRESH_INTERVAL_MINUTES,
    MIN_REFRESH_INTERVAL_MINUTES,
    normalize_integration_refresh_interval_minutes,
    normalize_refresh_interval_minutes,
    resolve_refresh_interval_minutes,
)
import yaml
from core.source_update_events import SourceUpdateEventBus

class FileContentRequest(BaseModel):
    content: str


class ViewReorderRequest(BaseModel):
    ordered_view_ids: list[str]


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


class ScraperTaskClearRequest(BaseModel):
    source_id: str | None = None


class ScraperTaskListRequest(BaseModel):
    pass

logger = logging.getLogger(__name__)
DEFAULT_PRESETS_DIR = Path(__file__).resolve().parent.parent / "config" / "presets"

router = APIRouter(prefix="/api")

# These global references are injected from main.py.
_executor = None
_data_controller = None
_config = None
_auth_manager = None
_secrets = None
_resource_manager = None
_integration_manager = None
_settings_manager = None
_master_key_provider = None
_scraper_task_store = None
_source_update_bus = None
_trust_rule_repo = None
_network_trust_policy = None


def init_api(
    executor,
    data_controller,
    config,
    auth_manager,
    secrets_controller,
    resource_manager,
    integration_manager,
    settings_manager=None,
    master_key_provider=None,
    scraper_task_store=None,
    source_update_bus: SourceUpdateEventBus | None = None,
    trust_rule_repo=None,
    network_trust_policy=None,
):
    """Inject global dependencies (called by main.py)."""
    global _executor, _data_controller, _config, _auth_manager, _secrets, _resource_manager, _integration_manager, _settings_manager, _master_key_provider, _scraper_task_store, _source_update_bus, _trust_rule_repo, _network_trust_policy
    _executor = executor
    _data_controller = data_controller
    _config = config
    _auth_manager = auth_manager
    _secrets = secrets_controller
    _resource_manager = resource_manager
    _integration_manager = integration_manager
    _settings_manager = settings_manager
    _master_key_provider = master_key_provider
    _scraper_task_store = scraper_task_store
    _source_update_bus = source_update_bus
    _trust_rule_repo = trust_rule_repo
    _network_trust_policy = network_trust_policy


def get_runtime_config():
    """Expose current runtime config snapshot (used by background services)."""
    return _config


def _storage_error_response(error: StorageContractError) -> JSONResponse:
    status_code, payload = storage_error_to_api_response(error)
    return JSONResponse(status_code=status_code, content=payload)


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


_INTERNAL_AUTH_HEADER = "X-Glanceus-Internal-Token"
_INTERNAL_AUTH_TOKEN_ENV = "GLANCEUS_INTERNAL_TOKEN"


_API_LOG_SENSITIVE_FIELDS = {
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "client_secret",
    "code",
    "device_code",
}
_WEBVIEW_FAIL_MANUAL_REQUIRED_KEYWORDS = (
    "captcha",
    "login",
    "sign in",
    "signin",
    "auth required",
    "authentication required",
    "verify",
    "verification",
    "2fa",
    "two-factor",
)


def _redact_log_payload(payload: Any) -> Any:
    return redact_sensitive_fields(payload, sensitive_fields=_API_LOG_SENSITIVE_FIELDS)


def _resolve_internal_auth_token() -> str:
    return os.getenv(_INTERNAL_AUTH_TOKEN_ENV, "").strip()


def _verify_internal_request(request: Request) -> None:
    expected_token = _resolve_internal_auth_token()
    provided_token = (request.headers.get(_INTERNAL_AUTH_HEADER) or "").strip()
    if (
        not expected_token
        or not provided_token
        or not hmac.compare_digest(provided_token, expected_token)
    ):
        raise HTTPException(403, "internal_auth_required")
    _require_local_request(request)


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
            "manual_only": True,
        },
    )


def _classify_scraper_fail_reason(reason: str) -> str:
    normalized = reason.lower()
    if any(keyword in normalized for keyword in _WEBVIEW_FAIL_MANUAL_REQUIRED_KEYWORDS):
        return "manual_required"
    return "retry_required"


def _is_manual_webview_state_for_task(source_id: str, task_id: str) -> bool:
    if _executor is None or not hasattr(_executor, "get_source_state"):
        return False
    try:
        runtime_state = _executor.get_source_state(source_id)
    except Exception:
        return False
    if runtime_state is None:
        return False

    status = getattr(runtime_state, "status", None)
    if isinstance(status, SourceStatus):
        normalized_status = status.value
    else:
        normalized_status = str(status or "")
    if normalized_status != SourceStatus.SUSPENDED.value:
        return False

    interaction = getattr(runtime_state, "interaction", None)
    if interaction is None:
        return False

    interaction_type = getattr(interaction, "type", None)
    interaction_data = getattr(interaction, "data", None)
    if isinstance(interaction, dict):
        interaction_type = interaction.get("type")
        interaction_data = interaction.get("data")

    if isinstance(interaction_type, InteractionType):
        normalized_type = interaction_type.value
    else:
        normalized_type = str(interaction_type or "")
    if normalized_type != InteractionType.WEBVIEW_SCRAPE.value:
        return False

    if not isinstance(interaction_data, dict):
        return False
    return str(interaction_data.get("task_id") or "") == task_id


def _apply_runtime_log_level(debug_enabled: bool) -> None:
    level = logging.DEBUG if debug_enabled else logging.INFO
    logging.getLogger().setLevel(level)
    logging.getLogger("uvicorn").setLevel(level)
    logging.getLogger("uvicorn.error").setLevel(level)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)


def _infer_error_code_from_interaction(interaction: dict[str, Any] | None) -> str | None:
    if not isinstance(interaction, dict):
        return None
    interaction_type = interaction.get("type")
    if interaction_type == "confirm":
        data = interaction.get("data")
        if isinstance(data, dict):
            confirm_kind = str(data.get("confirm_kind") or "").strip().lower()
            capability = str(data.get("capability") or "").strip().lower()
            if confirm_kind == "network_trust":
                return "runtime.network_trust_required"
            if confirm_kind == "db_operation_risk" and capability == "sql":
                return "runtime.sql_risk_operation_requires_trust"
    mapping = {
        "oauth_start": "auth.authorization_required",
        "oauth_device_flow": "auth.authorization_required",
        "input_text": "auth.missing_credentials",
        "input_form": "auth.missing_form_inputs",
        "cookies_refresh": "auth.invalid_credentials",
        "captcha": "auth.interactive_verification_required",
        "webview_scrape": "auth.manual_webview_required",
        "retry": "runtime.retry_required",
    }
    return mapping.get(interaction_type)


def _normalize_since_seq(raw: int | None) -> int | None:
    if raw is None:
        return None
    if raw < 0:
        return 0
    return raw


@router.websocket("/ws/source-updates")
async def source_updates_stream(
    websocket: WebSocket,
    since_seq: int | None = None,
) -> None:
    """
    Source update websocket stream.

    Message semantics:
    - Push lightweight source update events only (no detail payloads).
    - Client must fetch detail via HTTP and can use polling as reconciliation fallback.
    """
    await websocket.accept()
    if _source_update_bus is None:
        await websocket.send_json(
            {
                "event": "source.stream.unavailable",
                "reason": "event_bus_not_ready",
            },
        )
        await websocket.close(code=1013)
        return

    normalized_since_seq = _normalize_since_seq(since_seq)
    queue = _source_update_bus.subscribe()
    try:
        sync_required, replay_events, latest_seq = _source_update_bus.replay_since(
            normalized_since_seq,
        )
        await websocket.send_json(
            {
                "event": "source.stream.ready",
                "latest_seq": latest_seq,
                "sync_required": sync_required,
            },
        )

        if sync_required:
            await websocket.send_json(
                {
                    "event": "source.sync_required",
                    "latest_seq": latest_seq,
                    "reason": "history_gap",
                },
            )
        else:
            for event in replay_events:
                await websocket.send_json(event)

        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        return
    finally:
        _source_update_bus.unsubscribe(queue)


# ── Source Listing ────────────────────────────────────

@router.get("/sources")
async def list_sources() -> list[dict]:
    """Return all stored sources with runtime state snapshot."""
    try:
        stored_sources = _resource_manager.load_sources()
    except StorageContractError as error:
        return _storage_error_response(error)
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
        try:
            latest_data = _data_controller.get_latest(source.id)
        except StorageContractError as error:
            return _storage_error_response(error)

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
        error_code = latest_data.get("error_code") if latest_data else None

        # Prefer persisted status/message; fallback to runtime values.
        status = persisted_status if persisted_status else (runtime_state.status.value if runtime_state else "disabled")
        message = persisted_message if persisted_message else (runtime_state.message if runtime_state else None)
        interaction = persisted_interaction if persisted_interaction else (runtime_state.interaction.model_dump() if runtime_state and runtime_state.interaction else None)
        if not error_code:
            error_code = _infer_error_code_from_interaction(interaction)
        if not error_code and status == "error" and error:
            error_code = "runtime.fetch_failed"

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
            "error_code": error_code,
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
        integration_refresh_interval = normalize_integration_refresh_interval_minutes(
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
    try:
        stored = _get_stored_source(source_id)
    except StorageContractError as error:
        return _storage_error_response(error)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    try:
        latest = _data_controller.get_latest(source_id)
    except StorageContractError as error:
        return _storage_error_response(error)
    if latest is None:
        return {"source_id": source_id, "data": None, "message": "暂无数据"}
    return latest


@router.get("/data/{source_id}/history")
async def get_history(source_id: str, limit: int = 100) -> list[dict]:
    """Get historical data for a source."""
    try:
        stored = _get_stored_source(source_id)
    except StorageContractError as error:
        return _storage_error_response(error)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    try:
        return _data_controller.get_history(source_id, limit=limit)
    except StorageContractError as error:
        return _storage_error_response(error)


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


def _normalize_interaction_type(value: Any) -> str:
    if isinstance(value, InteractionType):
        return value.value
    if isinstance(value, str):
        return value.strip().lower()
    return ""


def _validate_interaction_source_binding(
    route_source_id: str,
    interaction: InteractionRequest | Any | None,
    *,
    expected_interaction_types: set[str],
    request_interaction_type: str,
    request_source_id: str | None,
    allow_missing_interaction: bool = False,
    allow_unexpected_pending_type: bool = False,
) -> InteractionRequest | Any:
    if request_source_id is not None and request_source_id != route_source_id:
        raise HTTPException(400, "interaction_source_mismatch")
    if interaction is None:
        if allow_missing_interaction:
            return InteractionRequest(
                type=InteractionType.OAUTH_START,
                source_id=route_source_id,
                fields=[],
            )
        raise HTTPException(400, "interaction_source_mismatch")

    pending_source_id = getattr(interaction, "source_id", None) or route_source_id
    pending_interaction_type = _normalize_interaction_type(getattr(interaction, "type", None))

    if pending_source_id != route_source_id:
        raise HTTPException(400, "interaction_source_mismatch")
    if pending_interaction_type not in expected_interaction_types and not allow_unexpected_pending_type:
        raise HTTPException(400, "interaction_source_mismatch")
    if request_interaction_type:
        expected_request_types = {item.value for item in InteractionType}
        if request_interaction_type in expected_request_types and request_interaction_type not in expected_interaction_types:
            raise HTTPException(400, "interaction_source_mismatch")

    return interaction


def _validate_interaction_payload_keys(
    payload: dict[str, Any],
    interaction: InteractionRequest | Any,
    *,
    allowed_protocol_keys: set[str],
) -> None:
    interaction_fields = getattr(interaction, "fields", None) or []
    allowed_fields = {
        getattr(field, "key", None)
        for field in interaction_fields
        if getattr(field, "key", None)
    }
    allowed_keys = allowed_fields | allowed_protocol_keys
    extra_keys = set(payload.keys()) - allowed_keys
    if extra_keys:
        raise HTTPException(400, "interaction_payload_invalid")


def _resolve_webview_interaction_secret_key(
    interaction: InteractionRequest | Any,
) -> str | None:
    interaction_data = getattr(interaction, "data", None)
    interaction_type = getattr(interaction, "type", None)
    if isinstance(interaction, dict):
        interaction_data = interaction.get("data")
        interaction_type = interaction.get("type")

    normalized_type = _normalize_interaction_type(interaction_type)
    if normalized_type != InteractionType.WEBVIEW_SCRAPE.value:
        return None

    if isinstance(interaction_data, dict):
        secret_key = interaction_data.get("secret_key")
        if isinstance(secret_key, str) and secret_key.strip():
            return secret_key.strip()
    return "webview_data"


def _extract_trust_binding_data(interaction: InteractionRequest | Any) -> dict[str, Any] | None:
    data = getattr(interaction, "data", None)
    if not isinstance(data, dict):
        return None
    required_keys = {"capability", "target_type", "target_value", "target_key"}
    if not required_keys.issubset(data.keys()):
        return None
    return data


def _normalize_persisted_interaction(interaction: Any) -> InteractionRequest | Any | None:
    if isinstance(interaction, InteractionRequest):
        return interaction
    if not isinstance(interaction, dict):
        return interaction

    raw_fields = interaction.get("fields")
    fields = []
    if isinstance(raw_fields, list):
        for raw_field in raw_fields:
            if isinstance(raw_field, dict):
                fields.append(SimpleNamespace(**raw_field))
            else:
                fields.append(raw_field)

    return SimpleNamespace(
        type=interaction.get("type"),
        source_id=interaction.get("source_id"),
        fields=fields,
        data=interaction.get("data"),
    )


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


def _resolve_next_view_sort_index(resource_manager) -> int:
    load_views = getattr(resource_manager, "load_views", None)
    if not callable(load_views):
        return 0
    views = load_views()
    if not views:
        return 0
    return max(view.sort_index for view in views) + 1


@router.post("/refresh/{source_id}")
async def refresh_source(source_id: str, background_tasks: BackgroundTasks) -> dict:
    """Manually trigger refresh for one source."""
    # Read source from configured resource storage backend.
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

    # Refresh sources from configured resource storage backend.
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


def _to_logical_integration_file(filename: str) -> dict[str, str]:
    normalized_filename = _integration_manager.normalize_filename(filename)
    return {
        "filename": normalized_filename,
        "integration_id": Path(normalized_filename).stem,
    }


@router.post("/internal/scraper/claim")
async def internal_claim_scraper_task(
    payload: ScraperTaskClaimRequest,
    request: Request,
) -> dict[str, Any]:
    _verify_internal_request(request)
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
    _verify_internal_request(request)
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
    _verify_internal_request(request)
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
    _verify_internal_request(request)
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

    classification = _classify_scraper_fail_reason(payload.error)
    if classification == "manual_required":
        interaction = _build_webview_interaction_from_task(
            updated,
            message=f"Web scraper failed: {payload.error}. Manual action is required before retry.",
        )
        _executor._update_state(
            payload.source_id,
            SourceStatus.SUSPENDED,
            payload.error,
            interaction=interaction,
            error_code="auth.manual_webview_required",
        )
    elif _is_manual_webview_state_for_task(payload.source_id, payload.task_id):
        logger.info(
            "[%s] Skip retry_required overwrite for task %s because source is already manual-required",
            payload.source_id,
            payload.task_id,
        )
    else:
        _executor._update_state(
            payload.source_id,
            SourceStatus.ERROR,
            payload.error,
            error=payload.error,
            error_code="runtime.retry_required",
        )
    return {
        "accepted": True,
        "idempotent": False,
        "task": _serialize_scraper_task(updated),
    }


@router.post("/internal/scraper/clear")
async def internal_clear_scraper_tasks(
    payload: ScraperTaskClearRequest,
    request: Request,
) -> dict[str, Any]:
    _verify_internal_request(request)
    if _scraper_task_store is None:
        raise HTTPException(503, "Scraper task store unavailable")

    removed_tasks = _scraper_task_store.clear_active_tasks(source_id=payload.source_id)
    return {
        "cleared_count": len(removed_tasks),
        "tasks": [_serialize_scraper_task(task) for task in removed_tasks],
    }


@router.post("/internal/scraper/list")
async def internal_list_scraper_tasks(
    payload: ScraperTaskListRequest,
    request: Request,
) -> dict[str, Any]:
    _verify_internal_request(request)
    if _scraper_task_store is None:
        raise HTTPException(503, "Scraper task store unavailable")
    tasks = _scraper_task_store.list_active_tasks()
    return {"tasks": [_serialize_scraper_task(task) for task in tasks]}


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
        logger.info("[%s] OAuth authorization result: %s", source_id, _redact_log_payload(result))
    except ValueError as exc:
        logger.error("[%s] OAuth authorization ValueError: %s", source_id, sanitize_log_reason(exc))
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.error("[%s] OAuth authorize start failed: %s", source_id, sanitize_log_reason(exc))
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
        logger.error("[%s] Device flow poll failed: %s", source_id, sanitize_log_reason(exc))
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
        logger.error("[%s] Device flow status check failed: %s", source_id, sanitize_log_reason(exc))
        raise HTTPException(400, f"Device flow status check failed: {exc}") from exc


def _resolve_oauth_callback_source_id(state: str) -> str:
    if not state:
        raise HTTPException(400, "oauth_state_invalid")

    matched_source_ids: list[str] = []
    for stored in _resource_manager.load_sources():
        source_secrets = _secrets.get_secrets(stored.id) if _secrets and hasattr(_secrets, "get_secrets") else {}
        pkce_state = source_secrets.get("oauth_pkce") if isinstance(source_secrets, dict) else None
        if isinstance(pkce_state, dict) and pkce_state.get("state") == state:
            matched_source_ids.append(stored.id)

    if not matched_source_ids:
        raise HTTPException(400, "oauth_state_invalid")
    if len(matched_source_ids) > 1:
        raise HTTPException(400, "oauth_state_ambiguous")
    return matched_source_ids[0]


@router.post("/oauth/callback/interact")
async def oauth_callback_interact(data: dict[str, Any], background_tasks: BackgroundTasks) -> dict:
    interaction_type = (
        _normalize_interaction_type(data.get("interaction_type"))
        or _normalize_interaction_type(data.get("type"))
    )
    if interaction_type not in {"oauth_code_exchange", "oauth_implicit_token"}:
        raise HTTPException(400, "oauth_interaction_type_invalid")

    callback_state = data.get("state")
    if not isinstance(callback_state, str) or not callback_state.strip():
        raise HTTPException(400, "oauth_state_invalid")

    source_id = _resolve_oauth_callback_source_id(callback_state)
    payload = dict(data)
    payload["source_id"] = source_id
    return await interact_source(source_id, payload, background_tasks)



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

    try:
        latest_data = (
            _data_controller.get_latest(source_id)
            if _data_controller is not None and hasattr(_data_controller, "get_latest")
            else None
        )
    except StorageContractError as error:
        return _storage_error_response(error)
    persisted_interaction = None
    if isinstance(latest_data, dict):
        persisted_interaction = _normalize_persisted_interaction(latest_data.get("interaction"))
    state = _executor.get_source_state(source_id)
    runtime_interaction = getattr(state, "interaction", None) if state else None
    pending_interaction = persisted_interaction if persisted_interaction is not None else runtime_interaction

    # Special Handling: OAuth Code Exchange (Client-Side Callback)
    interaction_type = (
        _normalize_interaction_type(data.get("interaction_type"))
        or _normalize_interaction_type(data.get("type"))
    )
    request_source_id = data.get("source_id")

    if interaction_type == "oauth_code_exchange":
        binding = _validate_interaction_source_binding(
            source_id,
            pending_interaction,
            expected_interaction_types={InteractionType.OAUTH_START.value},
            request_interaction_type=interaction_type,
            request_source_id=request_source_id,
            allow_missing_interaction=True,
            allow_unexpected_pending_type=True,
        )
        handler = _auth_manager.get_oauth_handler(source_id)
        if not handler:
            _auth_manager.register_source(source)
            handler = _auth_manager.get_oauth_handler(source_id)
        
        if not handler:
            raise HTTPException(400, "Source is not OAuth type")

        code_field = getattr(getattr(handler, "config", None), "authorization_code_field", "code") or "code"
        state_field = getattr(getattr(handler, "config", None), "authorization_state_field", "state") or "state"
        _validate_interaction_payload_keys(
            data,
            binding,
            allowed_protocol_keys={
                "type",
                "interaction_type",
                "source_id",
                "code",
                code_field,
                "state",
                state_field,
                "redirect_uri",
            },
        )

        code = data.get("code")
        if not code and code_field != "code":
            code = data.get(code_field)
        exchange_state = data.get("state")
        if exchange_state is None and state_field != "state":
            exchange_state = data.get(state_field)
        redirect_uri = data.get("redirect_uri")
        if not code:
            raise HTTPException(400, f"Missing OAuth authorization code in interaction data (field: {code_field})")
            
        try:
            await handler.exchange_code(code, redirect_uri=redirect_uri, state=exchange_state)
        except Exception as e:
            logger.error("[%s] OAuth exchange failed: %s", source_id, sanitize_log_reason(e))
            raise HTTPException(400, f"授权失败: {str(e)}")
        
        background_tasks.add_task(_executor.fetch_source, source)
        return {"message": "OAuth 授权成功", "source_id": source_id}

    if interaction_type == "oauth_implicit_token":
        binding = _validate_interaction_source_binding(
            source_id,
            pending_interaction,
            expected_interaction_types={InteractionType.OAUTH_START.value},
            request_interaction_type=interaction_type,
            request_source_id=request_source_id,
            allow_missing_interaction=True,
            allow_unexpected_pending_type=True,
        )
        handler = _auth_manager.get_oauth_handler(source_id)
        if not handler:
            _auth_manager.register_source(source)
            handler = _auth_manager.get_oauth_handler(source_id)

        if not handler:
            raise HTTPException(400, "Source is not OAuth type")

        _validate_interaction_payload_keys(
            data,
            binding,
            allowed_protocol_keys={
                "type",
                "interaction_type",
                "source_id",
                "oauth_payload",
                "access_token",
                "token_type",
                "expires_in",
                "scope",
                "state",
                "redirect_uri",
            },
        )
        token_payload = handler.build_implicit_token_payload(data)
        access_token = token_payload.get("access_token")
        if not access_token:
            raise HTTPException(400, "Missing access_token in interaction data")

        try:
            handler.store_implicit_token(token_payload)
        except Exception as exc:
            logger.error("[%s] OAuth implicit token store failed: %s", source_id, sanitize_log_reason(exc))
            raise HTTPException(400, f"授权失败: {exc}") from exc

        background_tasks.add_task(_executor.fetch_source, source)
        return {"message": "OAuth Token 已保存", "source_id": source_id}

    if interaction_type == InteractionType.CONFIRM.value:
        binding = _validate_interaction_source_binding(
            source_id,
            pending_interaction,
            expected_interaction_types={InteractionType.CONFIRM.value},
            request_interaction_type=interaction_type,
            request_source_id=request_source_id,
        )
        trust_binding = _extract_trust_binding_data(binding)
        if trust_binding is not None:
            _validate_interaction_payload_keys(
                data,
                binding,
                allowed_protocol_keys={
                    "type",
                    "interaction_type",
                    "source_id",
                    "decision",
                    "scope",
                    "target_key",
                },
            )
            decision = str(data.get("decision") or "").strip().lower()
            scope = str(data.get("scope") or "").strip().lower()
            target_key = str(data.get("target_key") or "").strip().lower()
            if decision not in {"allow_once", "allow_always", "deny"}:
                raise HTTPException(400, "interaction_payload_invalid")
            if scope not in {"source", "global"}:
                raise HTTPException(400, "interaction_payload_invalid")
            if not target_key:
                raise HTTPException(400, "interaction_payload_invalid")

            capability = str(trust_binding.get("capability") or "http").strip().lower()
            target_type = str(trust_binding.get("target_type") or "host").strip().lower()
            target_value = str(trust_binding.get("target_value") or "").strip().lower()
            expected_key = str(trust_binding.get("target_key") or target_value).strip().lower()
            if not target_value or expected_key != target_key:
                raise HTTPException(400, "interaction_payload_invalid")

            if decision == "allow_once":
                if _network_trust_policy is None or not hasattr(_network_trust_policy, "grant_allow_once"):
                    raise HTTPException(503, "network_trust_policy_unavailable")
                _network_trust_policy.grant_allow_once(
                    capability=capability,
                    source_id=source_id,
                    target_type=target_type,
                    target_value=target_value,
                )
            else:
                if _trust_rule_repo is None or not hasattr(_trust_rule_repo, "upsert_rule"):
                    raise HTTPException(503, "network_trust_rule_store_unavailable")
                persisted_decision = "allow" if decision == "allow_always" else "deny"
                persisted_source_id = source_id if scope == "source" else None
                _trust_rule_repo.upsert_rule(
                    capability=capability,
                    scope_type=scope,
                    source_id=persisted_source_id,
                    target_type=target_type,
                    target_value=target_value,
                    decision=persisted_decision,
                    metadata={
                        "via": "interaction",
                        "decision": decision,
                    },
                )

            _executor._update_state(source_id, SourceStatus.REFRESHING, "Processing interaction results...")
            background_tasks.add_task(_executor.fetch_source, source)
            return {"message": "Trust decision recorded, retrying source.", "source_id": source_id}

    binding = _validate_interaction_source_binding(
        source_id,
        pending_interaction,
        expected_interaction_types={
            InteractionType.INPUT_TEXT.value,
            InteractionType.INPUT_FORM.value,
            InteractionType.COOKIES_REFRESH.value,
            InteractionType.CAPTCHA.value,
            InteractionType.CONFIRM.value,
            InteractionType.RETRY.value,
            InteractionType.WEBVIEW_SCRAPE.value,
        },
        request_interaction_type=interaction_type,
        request_source_id=request_source_id,
    )
    allowed_protocol_keys = {
        "type",
        "interaction_type",
        "source_id",
        "code",
        "state",
        "redirect_uri",
    }
    webview_secret_key = _resolve_webview_interaction_secret_key(binding)
    if webview_secret_key:
        allowed_protocol_keys.add(webview_secret_key)

    _validate_interaction_payload_keys(
        data,
        binding,
        allowed_protocol_keys=allowed_protocol_keys,
    )
    payload_data = {key: value for key, value in data.items() if key != "source_id"}

    if payload_data:
        # Save interaction data into Secrets keyed by source_id.
        # Assumes data is a flat dictionary.
        _secrets.set_secrets(source_id, payload_data)
        logger.info(
            "[%s] Received interaction payload for source_id=%s payload=%s",
            source_id,
            source_id,
            _redact_log_payload(payload_data),
        )
    
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
    try:
        return create_stored_source_record(
            source,
            _resource_manager,
            executor=_executor,
            config=_config,
            background_tasks=background_tasks,
        )
    except StorageContractError as error:
        return _storage_error_response(error)


@router.put("/sources/{source_id}")
async def update_stored_source(source_id: str, source: StoredSource) -> StoredSource:
    """Update an existing stored source."""
    if source.id != source_id:
        raise HTTPException(400, "ID mismatch")
    try:
        return _resource_manager.save_source(source)
    except StorageContractError as error:
        return _storage_error_response(error)


class RefreshIntervalUpdateRequest(BaseModel):
    interval_minutes: int | None = None


@router.put("/sources/{source_id}/refresh-interval")
async def update_source_refresh_interval(
    source_id: str,
    request: RefreshIntervalUpdateRequest,
) -> dict[str, Any]:
    """Update source-level refresh interval. None=unset, 0=disabled."""
    try:
        stored = _get_stored_source(source_id)
    except StorageContractError as error:
        return _storage_error_response(error)
    if stored is None:
        raise HTTPException(404, f"数据源 '{source_id}' 不存在")

    normalized_interval = normalize_refresh_interval_minutes(request.interval_minutes)
    if request.interval_minutes is not None and normalized_interval is None:
        raise HTTPException(
            400,
            "Invalid refresh interval. Supported values: null, 0 (disabled), or "
            f"{MIN_REFRESH_INTERVAL_MINUTES}-{MAX_REFRESH_INTERVAL_MINUTES} minutes",
        )

    config = dict(stored.config) if isinstance(stored.config, dict) else {}
    if normalized_interval is None:
        config.pop("refresh_interval_minutes", None)
    else:
        config["refresh_interval_minutes"] = normalized_interval

    updated = stored.model_copy(update={"config": config})
    try:
        _resource_manager.save_source(updated)
    except StorageContractError as error:
        return _storage_error_response(error)
    return {
        "source_id": source_id,
        "refresh_interval_minutes": normalized_interval,
    }


@router.delete("/sources/{source_id}")
async def delete_stored_source(source_id: str) -> dict:
    """Delete stored source."""
    try:
        deleted = _resource_manager.delete_source(source_id)
    except StorageContractError as error:
        return _storage_error_response(error)
    if not deleted:
        raise HTTPException(404, f"Source {source_id} not found")

    cleanup_warnings: list[str] = []
    affected_view_ids: list[str] = []

    try:
        if _data_controller and hasattr(_data_controller, "clear_source"):
            _data_controller.clear_source(source_id)
    except StorageContractError as error:
        return _storage_error_response(error)
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
    except StorageContractError as error:
        return _storage_error_response(error)
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
    try:
        views = _resource_manager.load_views()
    except StorageContractError as error:
        return _storage_error_response(error)
    if not views:
        return views

    try:
        source_by_id = {source.id: source for source in _resource_manager.load_sources()}
    except StorageContractError as error:
        return _storage_error_response(error)
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


@router.post("/views/reorder")
async def reorder_stored_views(payload: ViewReorderRequest) -> list[StoredView]:
    unique_ordered_view_ids = list(dict.fromkeys(payload.ordered_view_ids))
    if len(unique_ordered_view_ids) != len(payload.ordered_view_ids):
        raise HTTPException(400, "Duplicate view ids are not allowed")

    try:
        current_views = _resource_manager.load_views()
    except StorageContractError as error:
        return _storage_error_response(error)

    if not current_views:
        return []

    current_view_ids = {view.id for view in current_views}
    if (
        len(unique_ordered_view_ids) != len(current_views)
        or set(unique_ordered_view_ids) != current_view_ids
    ):
        raise HTTPException(400, "ordered_view_ids must include each existing view exactly once")

    reorder_views = getattr(_resource_manager, "reorder_views", None)
    try:
        if callable(reorder_views):
            reordered_views = reorder_views(unique_ordered_view_ids)
        else:
            view_by_id = {view.id: view for view in current_views}
            reordered_views = []
            for index, view_id in enumerate(unique_ordered_view_ids):
                next_view = view_by_id[view_id].model_copy(update={"sort_index": index})
                reordered_views.append(_resource_manager.save_view(next_view))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except StorageContractError as error:
        return _storage_error_response(error)

    if not reordered_views:
        return reordered_views

    try:
        source_by_id = {source.id: source for source in _resource_manager.load_sources()}
    except StorageContractError as error:
        return _storage_error_response(error)
    template_lookup_by_integration = build_template_lookup_from_config(_config)
    if not source_by_id or not template_lookup_by_integration:
        return reordered_views

    return [
        inject_view_item_props_from_templates(
            view,
            source_by_id=source_by_id,
            template_lookup_by_integration=template_lookup_by_integration,
        )
        for view in reordered_views
    ]


@router.post("/views")
async def create_stored_view(view: StoredView) -> StoredView:
    """Create new stored view."""
    prepared_view = view
    try:
        if "sort_index" not in view.model_fields_set:
            get_view = getattr(_resource_manager, "get_view", None)
            existing_view = get_view(view.id) if callable(get_view) else None
            resolved_sort_index = (
                existing_view.sort_index
                if existing_view is not None
                else _resolve_next_view_sort_index(_resource_manager)
            )
            prepared_view = view.model_copy(update={"sort_index": resolved_sort_index})
        return create_stored_view_record(prepared_view, _resource_manager, config=_config)
    except StorageContractError as error:
        return _storage_error_response(error)


@router.put("/views/{view_id}")
async def update_stored_view(view_id: str, view: StoredView) -> StoredView:
    """Update stored view."""
    if view.id != view_id:
        raise HTTPException(400, "ID mismatch")
    prepared_view = view
    try:
        if "sort_index" not in view.model_fields_set:
            get_view = getattr(_resource_manager, "get_view", None)
            existing_view = get_view(view_id) if callable(get_view) else None
            if existing_view is not None:
                prepared_view = view.model_copy(
                    update={"sort_index": existing_view.sort_index},
                )
        return create_stored_view_record(prepared_view, _resource_manager, config=_config)
    except StorageContractError as error:
        return _storage_error_response(error)


@router.delete("/views/{view_id}")
async def delete_stored_view(view_id: str) -> dict:
    """Delete stored view."""
    try:
        if _resource_manager.delete_view(view_id):
            return {"message": f"View {view_id} deleted"}
    except StorageContractError as error:
        return _storage_error_response(error)
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
    logical_file = _to_logical_integration_file(filename)
    return {
        **logical_file,
        "content": content,
        "integration_ids": [logical_file["integration_id"]],
        "display_name": _integration_manager.get_integration_display_name(filename),
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
    logical_file = _to_logical_integration_file(normalized_filename)
    return {
        "message": f"Integration {normalized_filename} created",
        **logical_file,
    }


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
    logical_file = _to_logical_integration_file(filename)
    return {"message": f"Integration {filename} saved", **logical_file}


@router.delete("/integrations/files/{filename}")
async def delete_integration_file(filename: str) -> dict:
    """Delete integration YAML file."""
    success = _integration_manager.delete_integration(filename)
    if not success:
        raise HTTPException(404, f"Integration file {filename} not found")
    logical_file = _to_logical_integration_file(filename)
    return {"message": f"Integration {filename} deleted", **logical_file}


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


class SystemSettingsResponse(SystemSettings):
    encryption_available: bool = False


def _resolve_encryption_available() -> bool:
    if _master_key_provider is None:
        return False
    checker = getattr(_master_key_provider, "is_encryption_available", None)
    if not callable(checker):
        return False
    try:
        return bool(checker())
    except Exception:
        return False


def _to_settings_response(settings: SystemSettings) -> SystemSettingsResponse:
    payload = settings.model_dump()
    payload["encryption_available"] = _resolve_encryption_available()
    return SystemSettingsResponse.model_validate(payload)


@router.get("/settings")
async def get_system_settings() -> SystemSettingsResponse:
    """Get all system settings."""
    if _settings_manager is None:
        return _to_settings_response(SystemSettings())
    return _to_settings_response(_settings_manager.load_settings())

@router.put("/settings")
async def update_system_settings(settings: SystemSettings) -> SystemSettingsResponse:
    """Update all system settings and trigger migration on encryption-toggle change."""
    if _settings_manager is None:
        _apply_runtime_log_level(settings.debug_logging_enabled)
        return _to_settings_response(settings)

    old = _settings_manager.load_settings()
    old_enc = old.encryption_enabled
    new_enc = settings.encryption_enabled

    if old_enc != new_enc and _secrets:
        if new_enc:
            # Enabling encryption requires a keyring-backed master key first.
            if _master_key_provider is None:
                raise HTTPException(500, "Master key provider not initialized")
            try:
                _master_key_provider.get_or_create_master_key()
                logger.info("Encryption toggled on. Starting full secrets encryption migration.")
                _secrets.migrate_encrypt_all()
            except MasterKeyUnavailableError as exc:
                raise HTTPException(400, str(exc)) from exc
        else:
            # Disabling encryption decrypts all existing ciphertext.
            try:
                logger.info("Encryption toggled off. Starting full secrets decryption migration.")
                _secrets.migrate_decrypt_all()
            except MasterKeyUnavailableError as exc:
                raise HTTPException(400, str(exc)) from exc

    _settings_manager.save_settings(settings)
    _apply_runtime_log_level(settings.debug_logging_enabled)

    return _to_settings_response(settings)
