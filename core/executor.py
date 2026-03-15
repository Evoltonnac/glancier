"""
Executor: schedules and runs source fetch tasks.
Captures exceptions and updates SourceState.
"""

import logging
import time
import asyncio
import httpx
import os
import shlex
import re
import traceback
from contextlib import redirect_stderr, redirect_stdout
from typing import Any, Dict

from core.source_state import (
    SourceState,
    SourceStatus,
    InteractionRequest,
    InteractionType,
    InteractionField
)
from core.config_loader import (
    SourceConfig,
    StepConfig,
    StepType,
    AuthType,
    AuthConfig,
    OAuthFlowType,
    TokenEndpointAuthMethod,
)
from core.auth.oauth_auth import OAuthAuth
from jsonpath_ng import parse

logger = logging.getLogger(__name__)
_RUNTIME_LOG_LINE_LIMIT = 120
_RUNTIME_LOG_CHAR_LIMIT = 6000
_PLACEHOLDER_PATTERN = re.compile(r"\{([^{}]+)\}")
_ESCAPED_TEMPLATE_CHAR_PATTERN = re.compile(r"\\([{}\\])")
_ESCAPE_TOKEN_PATTERN = re.compile("\u0000(\\d+)\u0000")
_MISSING = object()
_DEFAULT_MAX_CONCURRENT_FETCHES = 4


class Executor:
    """
    Execute SourceConfig-defined fetch flows.
    Maintain in-memory SourceState snapshots.
    """

    def __init__(
        self,
        data_controller,
        secrets_controller,
        settings_manager=None,
        max_concurrent_fetches: int | None = None,
    ):
        self._data_controller = data_controller
        self._secrets = secrets_controller
        self._settings_manager = settings_manager
        # source_id -> SourceState
        self._states: Dict[str, SourceState] = {}
        resolved_max_concurrency = self._resolve_max_concurrent_fetches(max_concurrent_fetches)
        self._fetch_semaphore = asyncio.Semaphore(resolved_max_concurrency)
        self._inflight_source_ids: set[str] = set()
        self._inflight_lock = asyncio.Lock()

    def _resolve_max_concurrent_fetches(self, configured: int | None) -> int:
        if isinstance(configured, int) and configured > 0:
            return configured

        env_raw = os.getenv("GLANCIER_MAX_CONCURRENT_FETCHES")
        if env_raw:
            try:
                parsed = int(env_raw)
                if parsed > 0:
                    return parsed
            except ValueError:
                logger.warning("Invalid GLANCIER_MAX_CONCURRENT_FETCHES=%s; fallback to default", env_raw)

        return _DEFAULT_MAX_CONCURRENT_FETCHES

    async def _try_mark_source_inflight(self, source_id: str) -> bool:
        async with self._inflight_lock:
            if source_id in self._inflight_source_ids:
                return False
            self._inflight_source_ids.add(source_id)
            return True

    async def _clear_source_inflight(self, source_id: str) -> None:
        async with self._inflight_lock:
            self._inflight_source_ids.discard(source_id)

    def _get_proxy_url(self) -> str | None:
        """Read proxy URL from system settings; return None if unset."""
        if self._settings_manager is None:
            return None
        try:
            proxy = self._settings_manager.load_settings().proxy
            return proxy if proxy else None
        except Exception:
            return None

    def get_source_state(self, source_id: str) -> SourceState:
        """Get runtime state for source."""
        if source_id not in self._states:
            # Initialize default state.
            self._states[source_id] = SourceState(source_id=source_id)
        return self._states[source_id]

    def update_source_state(self, source_id: str, state: SourceState):
        """Update runtime state for source."""
        if source_id not in self._states:
            self._states[source_id] = SourceState(source_id=source_id)
        self._states[source_id].status = state.status
        self._states[source_id].message = state.message
        self._states[source_id].interaction = state.interaction
        self._states[source_id].last_updated = time.time()

        # Persist to DB
        try:
            interaction_dict = state.interaction.model_dump() if state.interaction else None
            self._data_controller.set_state(
                source_id=source_id,
                status=state.status.value,
                message=state.message,
                interaction=interaction_dict,
            )
        except Exception as e:
            logger.error(f"[{source_id}] Failed to persist state: {e}")

    def _update_state(
        self,
        source_id: str,
        status: SourceStatus,
        message: str | None = None,
        interaction: InteractionRequest | None = None,
        error: str | None = None,
    ):
        """Update state, log it, and persist to data.json."""
        state = self.get_source_state(source_id)
        state.status = status
        state.message = message
        state.interaction = interaction
        state.last_updated = time.time()
        logger.info(f"[{source_id}] State -> {status.value}: {message}")

        # Persist state so frontend can render actions (for example auth prompts).
        try:
            interaction_dict = interaction.model_dump() if interaction else None
            self._data_controller.set_state(
                source_id=source_id,
                status=status.value,
                message=message,
                interaction=interaction_dict,
                error=error,
            )
        except Exception as e:
            logger.error(f"[{source_id}] Failed to persist state: {e}")

    async def fetch_source(self, source: SourceConfig):
        """
        Execute source fetch flow.
        On failure, map exception type to InteractionRequest when possible.
        """
        marked = await self._try_mark_source_inflight(source.id)
        if not marked:
            logger.info("[%s] Fetch already in progress; skipping duplicate trigger", source.id)
            return

        try:
            async with self._fetch_semaphore:
                await self._fetch_source_once(source)
        finally:
            await self._clear_source_inflight(source.id)

    async def _fetch_source_once(self, source: SourceConfig):
        try:
            self._update_state(source.id, SourceStatus.ACTIVE, "Starting fetch...")

            # If flow is defined, execute flow steps
            if source.flow:
                data = await self._run_flow(source)
                self._data_controller.upsert(source.id, data)
                self._update_state(source.id, SourceStatus.ACTIVE, "Flow execution completed")
            else:
                self._update_state(source.id, SourceStatus.ERROR, "No flow defined for source")

        except Exception as e:
            logger.error(f"[{source.id}] Fetch failed: {e}", exc_info=True)
            normalized_error = self._normalize_interaction_error(source, e)

            # For OAuth invalid-credential errors, first attempt token refresh and retry once.
            if isinstance(normalized_error, InvalidCredentialsError):
                refreshed = await self._try_refresh_oauth_recovery(source, normalized_error)
                if refreshed:
                    logger.info(f"[{source.id}] OAuth refresh succeeded; retrying fetch once")
                    self._update_state(source.id, SourceStatus.REFRESHING, "OAuth token refreshed, retrying...")
                    try:
                        data = await self._run_flow(source)
                        self._data_controller.upsert(source.id, data)
                        self._update_state(source.id, SourceStatus.ACTIVE, "Flow execution completed")
                        return
                    except Exception as retry_error:
                        logger.warning(f"[{source.id}] Retry after OAuth refresh failed: {retry_error}")
                        normalized_error = self._normalize_interaction_error(source, retry_error)

            # Convert exception into interaction request when possible.
            interaction = self._exception_to_interaction(source, normalized_error)
            if interaction:
                status = self._interaction_status_for_error(normalized_error)
                self._update_state(
                    source.id,
                    status,
                    str(normalized_error),
                    interaction,
                )
                return

            error_summary, error_details = self._format_fetch_error(normalized_error)
            self._update_state(
                source.id,
                SourceStatus.ERROR,
                error_details,
                error=error_summary,
            )

    async def _run_flow(self, source: SourceConfig) -> Dict[str, Any]:
        """Execute a predefined flow of steps with explicit variable scoping.

        Variable Resolution Priority:
        1. outputs - from previous step (single step variables, only for next step)
        2. context - global flow environment (persists across entire flow)
        3. secrets - from SecretsController
        """
        context = {}
        # Initial context with source vars
        context.update(source.vars)
        execution_logs: list[str] = []

        final_data = {}
        previous_outputs: Dict[str, Any] = {}

        for step in source.flow:
            logger.info(f"[{source.id}] Running step {step.id} ({step.use})")
            self._update_state(
                source.id,
                SourceStatus.ACTIVE,
                self._build_runtime_message(step.id, execution_logs),
            )

            # Previous step outputs are a short-lived scope for argument resolution.
            step_inputs = previous_outputs

            try:
                # Resolve args with priority: outputs > context > secrets
                args = self._resolve_args(step.args, step_inputs, context, source.id)

                output = None

                from core.steps import (
                    execute_http_step,
                    execute_browser_step,
                    execute_auth_step,
                    execute_extract_step,
                    execute_script_step
                )

                if step.use in (StepType.API_KEY, StepType.CURL, StepType.OAUTH):
                    output = await execute_auth_step(step, source, args, context, step_inputs, self)
                elif step.use == StepType.HTTP:
                    output = await execute_http_step(step, source, args, context, step_inputs, self)
                elif step.use == StepType.EXTRACT:
                    output = await execute_extract_step(step, source, args, context, step_inputs, self)
                elif step.use == StepType.SCRIPT:
                    output = await execute_script_step(step, source, args, context, step_inputs, self)
                elif step.use == StepType.WEBVIEW:
                    output = await execute_browser_step(step, source, args, context, step_inputs, self)

                current_outputs: Dict[str, Any] = {}

                # Process outputs
                if output and step.outputs:
                    for target_var, source_path in step.outputs.items():
                        resolved = self._resolve_output_path(output, source_path)
                        if resolved is not _MISSING:
                            current_outputs[target_var] = resolved
                            final_data[target_var] = resolved

                # Process context
                if output and getattr(step, 'context', None):
                    for target_var, source_path in step.context.items():
                        resolved = self._resolve_output_path(output, source_path)
                        if resolved is not _MISSING:
                            current_outputs[target_var] = resolved

                # Explicitly store secrets if specified in step config
                if step.secrets and output:
                    for secret_name, source_path in step.secrets.items():
                        resolved = self._resolve_output_path(output, source_path)
                        if resolved is not _MISSING:
                            if (
                                step.use == StepType.OAUTH
                                and secret_name == "access_token"
                            ):
                                existing_token_secret = self._secrets.get_secret(source.id, "access_token")
                                if isinstance(existing_token_secret, dict):
                                    logger.debug(
                                        "[%s] Skip overwriting structured OAuth token payload with scalar value",
                                        source.id,
                                    )
                                    continue
                            self._secrets.set_secret(source.id, secret_name, resolved)
                            logger.info(f"[{source.id}] Stored secret '{secret_name}' from step {step.id}")

                # Update context with outputs (promote to global context)
                if current_outputs:
                    context.update(current_outputs)

                # Only the current step's mapped outputs participate in next-step priority 1.
                previous_outputs = current_outputs

            except Exception as step_error:
                if isinstance(
                    step_error,
                    (
                        RequiredSecretMissing,
                        InvalidCredentialsError,
                        WebScraperBlockedError,
                    ),
                ):
                    raise
                logger.error(f"Step {step.id} failed: {step_error}")
                flow_error = self._build_flow_step_error(
                    step_id=step.id,
                    error=step_error,
                    execution_logs=execution_logs,
                )
                raise flow_error from step_error

        # Return final data mapping
        return final_data

    def _resolve_dotted_value(self, scope: Dict[str, Any], key: str) -> Any:
        if key in scope:
            return scope[key]

        if "." not in key:
            return _MISSING

        current: Any = scope
        for segment in key.split("."):
            if isinstance(current, dict) and segment in current:
                current = current[segment]
                continue
            return _MISSING
        return current

    def _resolve_reference(
        self,
        key: str,
        outputs: Dict[str, Any],
        context: Dict[str, Any],
        secrets_data: Dict[str, Any],
    ) -> Any:
        for scope in (outputs, context, secrets_data):
            value = self._resolve_dotted_value(scope, key)
            if value is not _MISSING:
                return value
        return _MISSING

    def _resolve_output_path(self, output: Dict[str, Any], source_path: str) -> Any:
        if not isinstance(source_path, str) or not source_path:
            return _MISSING

        value = self._resolve_dotted_value(output, source_path)
        if value is not _MISSING:
            return value

        if source_path.startswith("$"):
            try:
                matches = parse(source_path).find(output)
                if matches:
                    return matches[0].value
            except Exception:
                return _MISSING

        return _MISSING

    def _mask_escaped_template_chars(self, template: str) -> tuple[str, list[str]]:
        escaped_chars: list[str] = []

        def replace(match: re.Match[str]) -> str:
            token = f"\u0000{len(escaped_chars)}\u0000"
            escaped_chars.append(match.group(1))
            return token

        return _ESCAPED_TEMPLATE_CHAR_PATTERN.sub(replace, template), escaped_chars

    def _restore_escaped_template_chars(self, text: str, escaped_chars: list[str]) -> str:
        def replace(match: re.Match[str]) -> str:
            index = int(match.group(1))
            if 0 <= index < len(escaped_chars):
                return escaped_chars[index]
            return ""

        return _ESCAPE_TOKEN_PATTERN.sub(replace, text)

    def _resolve_args(self, args: Dict[str, Any], outputs: Dict[str, Any], context: Dict[str, Any], source_id: str) -> Dict[str, Any]:
        """Recursive string substitution with priority: outputs > context > secrets.

        Priority 1: outputs (from previous step)
        Priority 2: context (global flow environment)
        Priority 3: secrets (from SecretsController)
        """
        if isinstance(args, str):
            try:
                secrets_data = self._secrets.get_secrets(source_id) or {}
                masked_args, escaped_chars = self._mask_escaped_template_chars(args)

                # Optimized: if args is exactly "{key}", return the object directly
                # This preserves types (dict, list, etc) instead of stringifying
                exact_match = _PLACEHOLDER_PATTERN.fullmatch(masked_args)
                if exact_match:
                     key = exact_match.group(1).strip()
                     resolved = self._resolve_reference(key, outputs, context, secrets_data)
                     if resolved is not _MISSING:
                         if isinstance(resolved, str):
                             return self._restore_escaped_template_chars(resolved, escaped_chars)
                         return resolved
                     return self._restore_escaped_template_chars(masked_args, escaped_chars)

                def replace(match: re.Match[str]) -> str:
                    key = match.group(1).strip()
                    resolved = self._resolve_reference(key, outputs, context, secrets_data)
                    if resolved is _MISSING:
                        return match.group(0)
                    return str(resolved)

                replaced = _PLACEHOLDER_PATTERN.sub(replace, masked_args)
                return self._restore_escaped_template_chars(replaced, escaped_chars)
            except:
                return args
        elif isinstance(args, dict):
            return {k: self._resolve_args(v, outputs, context, source_id) for k, v in args.items()}
        elif isinstance(args, list):
            return [self._resolve_args(v, outputs, context, source_id) for v in args]
        return args

    def _append_runtime_logs(
        self,
        logs: list[str],
        step_id: str,
        stream: str,
        chunk: str,
    ):
        for line in chunk.splitlines():
            if not line.strip():
                continue
            logs.append(f"[{step_id}][{stream}] {line}")

        if len(logs) > _RUNTIME_LOG_LINE_LIMIT:
            del logs[: len(logs) - _RUNTIME_LOG_LINE_LIMIT]

    def _build_runtime_message(self, step_id: str, logs: list[str]) -> str:
        if not logs:
            return f"Running step {step_id}..."

        tail = "\n".join(logs[-20:])
        message = f"Running step {step_id}...\n{tail}"
        if len(message) > _RUNTIME_LOG_CHAR_LIMIT:
            return message[-_RUNTIME_LOG_CHAR_LIMIT:]
        return message

    def _build_flow_step_error(
        self,
        step_id: str,
        error: Exception,
        execution_logs: list[str],
    ) -> "FlowExecutionError":
        summary = f"Flow halted at step '{step_id}': {error}"
        parts = [summary]

        if execution_logs:
            parts.append("Script streams:\n" + "\n".join(execution_logs[-60:]))

        trace_text = traceback.format_exc().strip()
        if trace_text:
            parts.append("Raw traceback:\n" + trace_text)

        return FlowExecutionError(summary=summary, details="\n\n".join(parts))

    def _format_fetch_error(self, error: Exception) -> tuple[str, str]:
        if isinstance(error, FlowExecutionError):
            return error.summary, error.details

        summary = str(error) or "Fetch failed"
        parts = [summary]
        trace_text = traceback.format_exc().strip()
        if trace_text:
            parts.append("Raw traceback:\n" + trace_text)
        return summary, "\n\n".join(parts)

    def _normalize_interaction_error(
        self,
        source: SourceConfig,
        error: Exception,
    ) -> Exception:
        if isinstance(error, (RequiredSecretMissing, InvalidCredentialsError, WebScraperBlockedError)):
            return error

        if isinstance(error, httpx.HTTPStatusError):
            return self._classify_http_status_error(source=source, step=None, error=error)

        message = str(error).lower()
        has_webview_step = bool(source.flow and any(step.use == StepType.WEBVIEW for step in source.flow))
        block_keywords = ("captcha", "forbidden", "403", "login", "auth required", "timed out", "timeout")
        if has_webview_step and any(keyword in message for keyword in block_keywords):
            return WebScraperBlockedError(
                source_id=source.id,
                step_id=None,
                message=str(error) or "Web scraper was blocked by auth wall",
                data={"force_foreground": True, "manual_only": True},
            )

        return error

    def _classify_http_status_error(
        self,
        source: SourceConfig,
        step: StepConfig | None,
        error: httpx.HTTPStatusError,
    ) -> Exception:
        response = error.response
        status_code = response.status_code if response else None
        has_webview_step = bool(source.flow and any(flow_step.use == StepType.WEBVIEW for flow_step in source.flow))
        if status_code == 403 and has_webview_step:
            return WebScraperBlockedError(
                source_id=source.id,
                step_id=step.id if step else None,
                message=str(error),
                status_code=status_code,
                data={"force_foreground": True, "manual_only": True},
            )

        if status_code in {401, 403}:
            return InvalidCredentialsError(
                source_id=source.id,
                step_id=step.id if step else None,
                message=str(error),
                status_code=status_code,
            )

        return error

    def _interaction_status_for_error(self, error: Exception) -> SourceStatus:
        if isinstance(error, InvalidCredentialsError):
            return SourceStatus.ERROR
        return SourceStatus.SUSPENDED

    def _resolve_recovery_step(
        self,
        source: SourceConfig,
        failed_step_id: str | None,
    ) -> StepConfig | None:
        if not source.flow:
            return None

        recovery_types = {
            StepType.OAUTH,
            StepType.API_KEY,
            StepType.CURL,
            StepType.WEBVIEW,
        }
        flow = source.flow
        auth_indices = [idx for idx, step in enumerate(flow) if step.use in recovery_types]
        if not auth_indices:
            return None

        failed_index = next(
            (idx for idx, step in enumerate(flow) if step.id == failed_step_id),
            None,
        )
        if failed_index is None:
            failed_index = len(flow) - 1

        for idx in range(failed_index, -1, -1):
            if flow[idx].use in recovery_types:
                return flow[idx]

        return flow[auth_indices[0]]

    def _build_oauth_auth_config(self, step: StepConfig) -> AuthConfig:
        args = step.args or {}
        scope_arg = args.get("scope") or args.get("scopes")
        scopes: list[str] = []
        if scope_arg:
            if isinstance(scope_arg, list):
                scopes = scope_arg
            else:
                scopes = [scope_arg]

        flow_arg = (
            args.get("oauth_flow")
            or args.get("flow_type")
            or args.get("grant_type")
            or "code"
        ).strip().lower()
        oauth_flow = OAuthFlowType.CODE
        if flow_arg in {"device", "device_code", "urn:ietf:params:oauth:grant-type:device_code"}:
            oauth_flow = OAuthFlowType.DEVICE
        elif flow_arg in {"client_credentials", "client-credentials"}:
            oauth_flow = OAuthFlowType.CLIENT_CREDENTIALS

        auth_method_str = args.get("token_endpoint_auth_method")
        token_endpoint_auth_method = TokenEndpointAuthMethod.NONE
        if auth_method_str:
            try:
                token_endpoint_auth_method = TokenEndpointAuthMethod(auth_method_str)
            except ValueError:
                logger.warning("[%s] Invalid token_endpoint_auth_method: %s", step.id, auth_method_str)

        return AuthConfig(
            type=AuthType.OAUTH,
            auth_url=args.get("auth_url"),
            token_url=args.get("token_url"),
            client_id=args.get("client_id"),
            client_secret=args.get("client_secret"),
            redirect_uri=args.get("redirect_uri") or "http://localhost:5173/oauth/callback",
            scopes=scopes,
            token_request_type=args.get("token_request_type") or "form",
            token_field=args.get("token_field") or "access_token",
            token_type_field=args.get("token_type_field") or "token_type",
            expires_in_field=args.get("expires_in_field") or "expires_in",
            refresh_token_field=args.get("refresh_token_field") or "refresh_token",
            scope_field=args.get("scope_field") or "scope",
            redirect_param=args.get("redirect_param") or "redirect_uri",
            authorization_code_field=args.get("authorization_code_field") or "code",
            authorization_state_field=args.get("authorization_state_field") or "state",
            implicit_access_token_field=args.get("implicit_access_token_field") or "access_token",
            implicit_token_type_field=args.get("implicit_token_type_field") or "token_type",
            implicit_expires_in_field=args.get("implicit_expires_in_field") or "expires_in",
            implicit_scope_field=args.get("implicit_scope_field") or "scope",
            implicit_state_field=args.get("implicit_state_field") or "state",
            supports_pkce=args.get("supports_pkce", True),
            code_challenge_method=args.get("code_challenge_method", "S256"),
            response_type=args.get("response_type", "code"),
            oauth_flow=oauth_flow,
            token_endpoint_auth_method=token_endpoint_auth_method,
            device_authorization_url=args.get("device_authorization_url") or args.get("device_authorization_endpoint"),
            device_code_field=args.get("device_code_field") or "device_code",
            device_user_code_field=args.get("device_user_code_field") or "user_code",
            device_verification_uri_field=args.get("device_verification_uri_field") or "verification_uri",
            device_verification_uri_complete_field=args.get("device_verification_uri_complete_field") or "verification_uri_complete",
            device_interval_field=args.get("device_interval_field") or "interval",
            device_expires_in_field=args.get("device_expires_in_field") or "expires_in",
            oauth_error_field=args.get("oauth_error_field") or "error",
            oauth_error_description_field=args.get("oauth_error_description_field") or "error_description",
            device_poll_interval=args.get("device_poll_interval", 5),
            device_poll_timeout=args.get("device_poll_timeout", 900),
            doc_url=args.get("doc_url"),
        )

    async def _try_refresh_oauth_recovery(
        self,
        source: SourceConfig,
        error: "InvalidCredentialsError",
    ) -> bool:
        recovery_step = self._resolve_recovery_step(source, error.step_id)
        if recovery_step is None or recovery_step.use != StepType.OAUTH:
            return False

        auth_config = self._build_oauth_auth_config(recovery_step)
        handler = OAuthAuth(auth_config, source.id, self._secrets)
        try:
            refreshed = await handler.try_refresh_token(force=True)
        except Exception as exc:
            logger.warning(f"[{source.id}] OAuth refresh attempt failed: {exc}")
            return False

        return refreshed

    def _build_invalid_credentials_interaction(
        self,
        source: SourceConfig,
        error: "InvalidCredentialsError",
        recovery_step: StepConfig | None,
    ) -> InteractionRequest:
        if recovery_step:
            step = recovery_step
            if step.use == StepType.OAUTH:
                oauth_args = step.args or {}
                flow_type = (
                    oauth_args.get("oauth_flow")
                    or oauth_args.get("flow_type")
                    or oauth_args.get("grant_type")
                    or "code"
                ).strip().lower()
                interaction_type = (
                    InteractionType.OAUTH_DEVICE_FLOW
                    if flow_type in {"device", "device_code"}
                    else InteractionType.OAUTH_START
                )
                return InteractionRequest(
                    type=interaction_type,
                    step_id=step.id,
                    source_id=source.id,
                    title="Authorization Invalid",
                    message="Current OAuth authorization is invalid. Please reconnect.",
                    fields=[],
                    data={
                        "oauth_args": oauth_args,
                        "doc_url": oauth_args.get("doc_url"),
                        "oauth_flow": flow_type,
                        "failed_step_id": error.step_id,
                        "recovery_step_id": step.id,
                    },
                )
            if step.use == StepType.API_KEY:
                api_key = step.secrets.get("api_key", "api_key") if step.secrets else "api_key"
                return InteractionRequest(
                    type=InteractionType.INPUT_TEXT,
                    step_id=step.id,
                    source_id=source.id,
                    title="Credentials Invalid",
                    message="The API key appears invalid. Please update it and retry.",
                    fields=[
                        InteractionField(
                            key=api_key,
                            label=(step.args or {}).get("label", "API Key"),
                            type="password",
                            description=(step.args or {}).get("description", "Enter a valid API key"),
                        )
                    ],
                    data={
                        "failed_step_id": error.step_id,
                        "recovery_step_id": step.id,
                    },
                )
            if step.use == StepType.CURL:
                curl_key = step.secrets.get("curl_command", "curl_command") if step.secrets else "curl_command"
                return InteractionRequest(
                    type=InteractionType.INPUT_TEXT,
                    step_id=step.id,
                    source_id=source.id,
                    title="Credentials Invalid",
                    message="Session credentials expired or invalid. Please paste a fresh cURL command.",
                    fields=[
                        InteractionField(
                            key=curl_key,
                            label=(step.args or {}).get("label", "cURL Request"),
                            type="text",
                            description=(step.args or {}).get(
                                "description",
                                "Paste a new authenticated cURL command",
                            ),
                        )
                    ],
                    warning_message=(step.args or {}).get("warning_message"),
                    data={
                        "failed_step_id": error.step_id,
                        "recovery_step_id": step.id,
                    },
                )
            if step.use == StepType.WEBVIEW:
                return InteractionRequest(
                    type=InteractionType.WEBVIEW_SCRAPE,
                    step_id=step.id,
                    source_id=source.id,
                    title="Web Scraper Blocked",
                    message="Web scraper was blocked. Please resume in foreground mode.",
                    fields=[],
                    data={
                        "url": (step.args or {}).get("url"),
                        "script": (step.args or {}).get("script"),
                        "intercept_api": (step.args or {}).get("intercept_api"),
                        "secret_key": step.secrets.get("webview_data", "webview_data") if step.secrets else "webview_data",
                        "force_foreground": True,
                        "manual_only": True,
                        "failed_step_id": error.step_id,
                        "recovery_step_id": step.id,
                    },
                )

        return InteractionRequest(
            type=InteractionType.RETRY,
            step_id="flow_retry",
            source_id=source.id,
            title="Retry Required",
            message="Credentials are invalid. Please update credentials and retry.",
            fields=[],
            data={"failed_step_id": error.step_id},
        )

    def _exception_to_interaction(self, source: SourceConfig, error: Exception) -> InteractionRequest | None:
        """Build interaction request from exception type."""
        
        if isinstance(error, RequiredSecretMissing):
            return InteractionRequest(
                type=error.interaction_type,
                step_id="auth_check", # TODO: dynamic step id
                source_id=error.source_id,
                title="Authentication Required",
                message=error.message,
                warning_message=error.warning_message,
                fields=error.fields,
                data=error.data
            )

        if isinstance(error, InvalidCredentialsError):
            recovery_step = self._resolve_recovery_step(source, error.step_id)
            return self._build_invalid_credentials_interaction(
                source,
                error,
                recovery_step,
            )

        if isinstance(error, WebScraperBlockedError):
            webview_step = None
            if source.flow:
                webview_step = next((step for step in source.flow if step.use == StepType.WEBVIEW), None)
            interaction_data = {
                "force_foreground": True,
                "manual_only": True,
            }
            if webview_step:
                interaction_data.update(
                    {
                        "url": (webview_step.args or {}).get("url"),
                        "script": (webview_step.args or {}).get("script"),
                        "intercept_api": (webview_step.args or {}).get("intercept_api"),
                        "secret_key": webview_step.secrets.get("webview_data", "webview_data")
                        if webview_step.secrets
                        else "webview_data",
                    }
                )
            if error.data:
                interaction_data.update(error.data)

            return InteractionRequest(
                type=InteractionType.WEBVIEW_SCRAPE,
                step_id=error.step_id or (webview_step.id if webview_step else "webview"),
                source_id=source.id,
                title="Manual Action Required",
                message=error.message,
                fields=[],
                data=interaction_data,
            )
            
        # Generic network errors -> retry.
        # if isinstance(error, (httpx.ConnectError, TimeoutError)):
        #     return InteractionRequest(
        #         type=InteractionType.RETRY,
        #         message="Network error, please retry."
        #     )

        return None

class RequiredSecretMissing(Exception):
    """Custom exception: required credential is missing."""
    def __init__(self, source_id: str, interaction_type: InteractionType, fields: list[InteractionField], message: str, data: dict = None, warning_message: str = None):
        self.source_id = source_id
        self.interaction_type = interaction_type
        self.fields = fields
        self.message = message
        self.data = data
        self.warning_message = warning_message
        super().__init__(message)


class InvalidCredentialsError(Exception):
    """Custom exception: credentials were provided but are invalid."""

    def __init__(
        self,
        source_id: str,
        step_id: str | None,
        message: str,
        status_code: int | None = None,
    ):
        self.source_id = source_id
        self.step_id = step_id
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class WebScraperBlockedError(Exception):
    """Custom exception: WebScraper was blocked (login wall/captcha/etc.)."""

    def __init__(
        self,
        source_id: str,
        step_id: str | None,
        message: str,
        status_code: int | None = None,
        data: dict | None = None,
    ):
        self.source_id = source_id
        self.step_id = step_id
        self.message = message
        self.status_code = status_code
        self.data = data or {}
        super().__init__(message)


class FlowExecutionError(Exception):
    """Structured exception for flow execution failure."""

    def __init__(self, summary: str, details: str):
        self.summary = summary
        self.details = details
        super().__init__(summary)


class _RuntimeStreamRelay:
    """Forward stdout/stderr chunks into runtime status messages."""

    def __init__(self, on_chunk):
        self._on_chunk = on_chunk

    def write(self, text: str) -> int:
        if text:
            self._on_chunk(text)
        return len(text)

    def flush(self):
        return None
