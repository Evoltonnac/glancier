"""
OAuth 2.0 auth flow manager based on Authlib AsyncOAuth2Client.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional
from urllib.parse import parse_qs

import httpx
from authlib.common.security import generate_token
from authlib.integrations.base_client.errors import InvalidTokenError
from authlib.integrations.httpx_client import AsyncOAuth2Client

from core.config_loader import AuthConfig
from core.log_redaction import redact_sensitive_fields, sanitize_log_reason
from core.network_proxy import build_httpx_proxy_kwargs
from core.secrets_controller import SecretsController
from .oauth_types import CodeChallengeMethod, GrantType, OAuthParams, ResponseType
from .pkce import PKCEUtils

logger = logging.getLogger(__name__)

DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
JSON_STYLE_TOKEN_REQUEST_TYPES = {"json", "json_body", "json_request"}


class OAuthAuth:
    """Unified OAuth flow handler with token persistence."""

    def __init__(
        self,
        auth_config: AuthConfig,
        source_id: str,
        secrets_controller: SecretsController,
        settings_manager: Any | None = None,
    ):
        self.config = auth_config
        self.source_id = source_id
        self.secrets = secrets_controller
        self._settings_manager = settings_manager
        self._token_data: dict[str, Any] | None = None
        self._load_token()

    def _httpx_client_kwargs(self, *, timeout: float | None = None) -> dict[str, Any]:
        return build_httpx_proxy_kwargs(
            settings_manager=self._settings_manager,
            timeout=timeout,
        )

    def _first_non_none(self, *values: Any) -> Any:
        for value in values:
            if value is not None:
                return value
        return None

    def _token_value(self, payload: dict[str, Any], key: str, fallback_key: str) -> Any:
        return self._first_non_none(payload.get(key), payload.get(fallback_key))

    # -- Token persistence -------------------------------------------------

    def _load_token(self) -> None:
        secrets = self.secrets.get_secrets(self.source_id)
        raw_token = secrets.get(OAuthParams.OAUTH_SECRETS)
        if raw_token is None:
            # Backward-compat for legacy storage layout
            raw_token = secrets.get(OAuthParams.ACCESS_TOKEN)

        if isinstance(raw_token, str):
            raw_token = {OAuthParams.ACCESS_TOKEN: raw_token}

        if isinstance(raw_token, dict):
            self._token_data = self._normalize_token(raw_token)
            logger.debug(f"[{self.source_id}] Loaded OAuth token")
            return

        self._token_data = None

    def _normalize_token(self, token_data: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(token_data)
        token_field = self.config.token_field or OAuthParams.ACCESS_TOKEN
        token_type_field = self.config.token_type_field or "token_type"
        refresh_token_field = self.config.refresh_token_field or OAuthParams.REFRESH_TOKEN
        expires_in_field = self.config.expires_in_field or OAuthParams.EXPIRES_IN
        scope_field = self.config.scope_field or OAuthParams.SCOPE

        access_token = self._first_non_none(
            normalized.get(OAuthParams.ACCESS_TOKEN),
            normalized.get(token_field),
            normalized.get(self.config.implicit_access_token_field),
        )
        if access_token is not None:
            normalized[OAuthParams.ACCESS_TOKEN] = access_token

        token_type = self._token_value(normalized, token_type_field, "token_type")
        if token_type is not None:
            normalized["token_type"] = token_type

        refresh_token = self._token_value(normalized, refresh_token_field, OAuthParams.REFRESH_TOKEN)
        if refresh_token is not None:
            normalized[OAuthParams.REFRESH_TOKEN] = refresh_token

        expires_in = self._token_value(normalized, expires_in_field, OAuthParams.EXPIRES_IN)
        if expires_in is not None:
            normalized[OAuthParams.EXPIRES_IN] = expires_in

        scope_value = self._token_value(normalized, scope_field, OAuthParams.SCOPE)
        if scope_value is not None:
            normalized[OAuthParams.SCOPE] = scope_value

        # Normalize expires_at if provider only returns expires_in.
        if OAuthParams.EXPIRES_IN in normalized:
            try:
                normalized["expires_at"] = int(time.time()) + int(normalized[OAuthParams.EXPIRES_IN])
            except (TypeError, ValueError):
                pass

        normalized["saved_at"] = time.time()
        return normalized

    def _save_token(self, token_data: dict[str, Any]) -> None:
        normalized = self._normalize_token(token_data)
        self.secrets.set_secrets(self.source_id, {OAuthParams.OAUTH_SECRETS: normalized})
        legacy_access_token = self.secrets.get_secret(self.source_id, OAuthParams.ACCESS_TOKEN)
        if isinstance(legacy_access_token, dict):
            self.secrets.delete_secret(self.source_id, OAuthParams.ACCESS_TOKEN)
        self._token_data = normalized
        logger.info(f"[{self.source_id}] Saved OAuth token")

    def store_implicit_token(self, token_data: dict[str, Any]) -> None:
        """Persist fragment-based implicit flow token payload."""
        self._save_token(token_data)

    def build_implicit_token_payload(self, interaction_data: dict[str, Any]) -> dict[str, Any]:
        payload_data = interaction_data.get("oauth_payload")
        payload = dict(payload_data) if isinstance(payload_data, dict) else {}

        implicit_access_token_field = self.config.implicit_access_token_field or OAuthParams.ACCESS_TOKEN
        implicit_token_type_field = self.config.implicit_token_type_field or "token_type"
        implicit_expires_in_field = self.config.implicit_expires_in_field or OAuthParams.EXPIRES_IN
        implicit_scope_field = self.config.implicit_scope_field or OAuthParams.SCOPE
        implicit_state_field = self.config.implicit_state_field or OAuthParams.STATE

        access_token = self._first_non_none(
            interaction_data.get(OAuthParams.ACCESS_TOKEN),
            payload.get(implicit_access_token_field),
            payload.get(self.config.token_field),
            payload.get(OAuthParams.ACCESS_TOKEN),
        )
        if access_token is not None:
            payload[OAuthParams.ACCESS_TOKEN] = access_token

        token_type = self._first_non_none(
            interaction_data.get("token_type"),
            payload.get(implicit_token_type_field),
            payload.get("token_type"),
        )
        if token_type is not None:
            payload["token_type"] = token_type

        expires_in = self._first_non_none(
            interaction_data.get(OAuthParams.EXPIRES_IN),
            payload.get(implicit_expires_in_field),
            payload.get(OAuthParams.EXPIRES_IN),
        )
        if expires_in is not None:
            try:
                payload[OAuthParams.EXPIRES_IN] = int(expires_in)
            except (TypeError, ValueError):
                payload[OAuthParams.EXPIRES_IN] = expires_in

        scope_value = self._first_non_none(
            interaction_data.get(OAuthParams.SCOPE),
            payload.get(implicit_scope_field),
            payload.get(OAuthParams.SCOPE),
        )
        if scope_value is not None:
            payload[OAuthParams.SCOPE] = scope_value

        state_value = self._first_non_none(
            interaction_data.get(OAuthParams.STATE),
            payload.get(implicit_state_field),
            payload.get(OAuthParams.STATE),
        )
        if state_value is not None:
            payload[OAuthParams.STATE] = state_value

        return payload

    # -- PKCE/device states -----------------------------------------------

    def _save_pkce_state(self, verifier: str | None, state: str, redirect_uri: str) -> None:
        self.secrets.set_secrets(
            self.source_id,
            {
                "oauth_pkce": {
                    "verifier": verifier,
                    "state": state,
                    "source_id": self.source_id,
                    "redirect_uri": redirect_uri,
                    "created_at": time.time(),
                    "used_at": None,
                }
            },
        )

    def _validate_code_exchange_state(
        self,
        state: str | None,
        redirect_uri: str | None,
    ) -> str | None:
        secrets = self.secrets.get_secrets(self.source_id)
        pkce_data = secrets.get("oauth_pkce") if secrets else None

        if not isinstance(pkce_data, dict):
            raise ValueError(f"[{self.source_id}] oauth_state_invalid")
        if time.time() - pkce_data.get("created_at", 0) > 600:
            raise ValueError(f"[{self.source_id}] oauth_state_expired")
        if pkce_data.get("used_at") is not None:
            raise ValueError(f"[{self.source_id}] oauth_state_invalid")

        if state is None or state != pkce_data.get("state"):
            raise ValueError(f"[{self.source_id}] oauth_state_invalid")
        if pkce_data.get("source_id") != self.source_id:
            raise ValueError(f"[{self.source_id}] oauth_state_invalid")
        if pkce_data.get("redirect_uri") != redirect_uri:
            raise ValueError(f"[{self.source_id}] oauth_state_invalid")

        pkce_data["used_at"] = time.time()
        self.secrets.set_secrets(self.source_id, {"oauth_pkce": pkce_data})
        return pkce_data.get("verifier")

    def _save_device_state(self, payload: dict[str, Any]) -> None:
        self.secrets.set_secrets(self.source_id, {"oauth_device": payload})

    def _get_device_state(self) -> dict[str, Any] | None:
        secrets = self.secrets.get_secrets(self.source_id)
        return secrets.get("oauth_device") if secrets else None

    def _clear_device_state(self) -> None:
        self.secrets.delete_secret(self.source_id, "oauth_device")
        self.secrets.delete_secret(self.source_id, "oauth_device_status")

    def _save_device_flow_status(self, status: str, extra: dict[str, Any] | None = None) -> None:
        """Save device flow status to secrets for persistence across sessions."""
        data = {"status": status, "updated_at": time.time()}
        if extra:
            data.update(extra)
        self.secrets.set_secrets(self.source_id, {"oauth_device_status": data})

    async def get_device_flow_status(self) -> dict[str, Any]:
        """Get current device flow status from secrets without triggering polling."""
        secrets = self.secrets.get_secrets(self.source_id)
        status_data = secrets.get("oauth_device_status") if secrets else None
        device_state = self._get_device_state()

        # If we have a token, user is authorized
        if self.has_token:
            return {"status": "authorized"}

        # If no device state, no flow in progress
        if not device_state:
            return {"status": "idle"}

        # Check if device code expired
        if int(device_state.get("expires_at", 0)) <= int(time.time()):
            self._clear_device_state()
            return {"status": "expired"}

        # Return saved status if available
        if status_data:
            if status_data.get("status") == "pending" and "device" not in status_data:
                merged = dict(status_data)
                merged["device"] = device_state
                return merged
            return status_data

        # Default to pending if device state exists
        return {"status": "pending", "device": device_state}

    # -- Client bootstrap --------------------------------------------------

    def _get_client_credentials(self) -> tuple[str | None, str | None]:
        client_id = self.config.client_id
        client_secret = self.config.client_secret

        if not client_id or not client_secret:
            secrets = self.secrets.get_secrets(self.source_id)
            if secrets:
                client_id = client_id or secrets.get(OAuthParams.CLIENT_ID) or secrets.get("client_id")
                client_secret = client_secret or secrets.get(OAuthParams.CLIENT_SECRET) or secrets.get("client_secret")

        return client_id, client_secret

    def _flow_type(self) -> str:
        flow = (self.config.oauth_flow or "code").strip().lower()
        if flow in {"device", "device_code"}:
            return "device"
        if flow in {"client_credentials", "client-credentials"}:
            return "client_credentials"
        return "code"

    def _build_oauth_client(
        self,
        *,
        token: dict[str, Any] | None = None,
        grant_type: str | None = None,
        redirect_uri: Optional[str] = None,
    ) -> AsyncOAuth2Client:
        client_id, client_secret = self._get_client_credentials()
        scope = " ".join(self.config.scopes) if self.config.scopes else None

        async def update_token(token_payload: dict[str, Any], refresh_token=None, access_token=None) -> None:
            _ = refresh_token
            _ = access_token
            if self._token_data:
                merged = dict(self._token_data)
                merged.update(token_payload)
                self._save_token(merged)
            else:
                self._save_token(token_payload)

        token_endpoint_auth_method = self.config.token_endpoint_auth_method.value
        metadata: dict[str, Any] = {"token_endpoint": self.config.token_url}
        if grant_type:
            metadata["grant_type"] = grant_type

        return AsyncOAuth2Client(
            client_id=client_id,
            client_secret=client_secret,
            token_endpoint_auth_method=token_endpoint_auth_method,
            scope=scope,
            redirect_uri=redirect_uri or self.config.redirect_uri,
            token=token,
            update_token=update_token,
            leeway=60,
            **metadata,
            **self._httpx_client_kwargs(),
        )

    async def _fetch_token_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        client_id, client_secret = self._get_client_credentials()
        req_payload = dict(payload)
        if client_id and OAuthParams.CLIENT_ID not in req_payload:
            req_payload[OAuthParams.CLIENT_ID] = client_id
        if client_secret and OAuthParams.CLIENT_SECRET not in req_payload:
            req_payload[OAuthParams.CLIENT_SECRET] = client_secret

        request_type = (self.config.token_request_type or "form").strip().lower()
        request_kwargs: dict[str, Any]
        headers: dict[str, str] = {"Accept": "application/json"}
        if request_type in {"json_body", "json_request"}:
            request_kwargs = {"json": req_payload}
            headers["Content-Type"] = "application/json"
        else:
            # Backward-compatible path: "json" keeps form payload but asks JSON response.
            request_kwargs = {"data": req_payload}

        async with httpx.AsyncClient(**self._httpx_client_kwargs()) as client:
            response = await client.post(
                self.config.token_url,
                headers=headers,
                **request_kwargs,
            )
            response.raise_for_status()
            parsed = self._parse_oauth_payload(response)
            if isinstance(parsed, dict):
                return parsed
            raise ValueError(f"[{self.source_id}] OAuth token endpoint returned an invalid payload")

    # -- Authorization startup --------------------------------------------

    async def start_authorization(self, redirect_uri: Optional[str] = None) -> dict[str, Any]:
        flow = self._flow_type()

        if flow == "device":
            device_payload = await self.start_device_flow()
            return {"flow": "device", "device": device_payload}

        if flow == "client_credentials":
            token = await self.fetch_client_credentials_token()
            return {
                "flow": "client_credentials",
                "status": "authorized",
                "token_type": token.get("token_type"),
            }

        url = self.get_authorize_url(redirect_uri=redirect_uri)
        return {"flow": "code", "authorize_url": url}

    def get_authorize_url(self, redirect_uri: Optional[str] = None) -> str:
        final_redirect_uri = redirect_uri or self.config.redirect_uri
        if not final_redirect_uri:
            raise ValueError(f"[{self.source_id}] OAuth authorization requires redirect_uri")
        if not self.config.auth_url:
            raise ValueError(f"[{self.source_id}] OAuth authorization requires auth_url")

        state = generate_token(48)
        kwargs: dict[str, Any] = {"response_type": self.config.response_type or ResponseType.CODE.value}
        client = self._build_oauth_client(redirect_uri=final_redirect_uri)
        verifier: str | None = None

        if self.config.supports_pkce:
            verifier = generate_token(64)
            method = CodeChallengeMethod(self.config.code_challenge_method or "S256")
            kwargs["code_verifier"] = verifier
            kwargs["code_challenge_method"] = method.value
            kwargs["code_challenge"] = PKCEUtils.generate_challenge(verifier, method)

        self._save_pkce_state(verifier, state, final_redirect_uri)

        authorize_url, resolved_state = client.create_authorization_url(
            self.config.auth_url,
            state=state,
            **kwargs,
        )
        _ = resolved_state

        return authorize_url

    # -- Code flow exchange ------------------------------------------------

    async def exchange_code(
        self,
        code: str,
        redirect_uri: Optional[str] = None,
        state: str | None = None,
    ) -> None:
        if not self.config.token_url:
            raise ValueError(f"[{self.source_id}] OAuth token_url is required")

        final_redirect_uri = redirect_uri or self.config.redirect_uri
        code_field = self.config.authorization_code_field or OAuthParams.CODE
        payload = {
            code_field: code,
            OAuthParams.GRANT_TYPE: GrantType.AUTHORIZATION_CODE.value,
        }

        if final_redirect_uri:
            payload[self.config.redirect_param or OAuthParams.REDIRECT_URI] = final_redirect_uri
        verifier = self._validate_code_exchange_state(state, final_redirect_uri)
        if verifier:
            payload[OAuthParams.CODE_VERIFIER] = verifier

        requires_manual_token_exchange = (
            (self.config.token_request_type or "form").strip().lower() in JSON_STYLE_TOKEN_REQUEST_TYPES
            or code_field != OAuthParams.CODE
            or (self.config.redirect_param or OAuthParams.REDIRECT_URI) != OAuthParams.REDIRECT_URI
        )

        if requires_manual_token_exchange:
            token = await self._fetch_token_json(payload)
            self._save_token(token)
            return

        client = self._build_oauth_client(redirect_uri=final_redirect_uri)
        token = await client.fetch_token(
            url=self.config.token_url,
            grant_type=GrantType.AUTHORIZATION_CODE.value,
            code=code,
            redirect_uri=final_redirect_uri,
            code_verifier=verifier,
        )
        self._save_token(dict(token))

    # -- Device flow -------------------------------------------------------

    async def start_device_flow(self) -> dict[str, Any]:
        logger.info(f"[{self.source_id}] Starting device flow")
        try:
            device_url = self.config.device_authorization_url
            if not device_url:
                raise ValueError(f"[{self.source_id}] device_authorization_url is required for device flow")
            if not self.config.token_url:
                raise ValueError(f"[{self.source_id}] token_url is required for device flow")

            client_id, client_secret = self._get_client_credentials()
            # Sensitive fields are masked with [REDACTED] before logging.
            logger.info(
                "[%s] Device flow credentials present: client_id=%s client_secret=%s",
                self.source_id,
                bool(client_id),
                bool(client_secret),
            )
            if not client_id:
                raise ValueError(f"[{self.source_id}] client_id is required for device flow")

            scope = " ".join(self.config.scopes) if self.config.scopes else None
            payload: dict[str, Any] = {OAuthParams.CLIENT_ID: client_id}
            if scope:
                payload[OAuthParams.SCOPE] = scope
            if client_secret and self.config.token_endpoint_auth_method.value == "client_secret_post":
                payload[OAuthParams.CLIENT_SECRET] = client_secret

            async with httpx.AsyncClient(**self._httpx_client_kwargs()) as client:
                logger.info(
                    "[%s] Posting to device URL: %s payload=%s",
                    self.source_id,
                    device_url,
                    redact_sensitive_fields(payload),
                )
                response = await client.post(device_url, data=payload, headers={"Accept": "application/json"})
                logger.info("[%s] Device URL response status=%s", self.source_id, response.status_code)
                response.raise_for_status()
                parsed_payload = self._parse_oauth_payload(response)
                if not isinstance(parsed_payload, dict):
                    raise ValueError(f"[{self.source_id}] device authorization endpoint returned invalid payload")
                device_payload = parsed_payload
                logger.info(
                    "[%s] Device flow response payload=%s",
                    self.source_id,
                    redact_sensitive_fields(device_payload),
                )

            device_code = self._first_non_none(
                device_payload.get(self.config.device_code_field),
                device_payload.get("device_code"),
            )
            if not device_code:
                raise ValueError(f"[{self.source_id}] device authorization payload missing device_code")

            user_code = self._first_non_none(
                device_payload.get(self.config.device_user_code_field),
                device_payload.get("user_code"),
            )
            verification_uri = self._first_non_none(
                device_payload.get(self.config.device_verification_uri_field),
                device_payload.get("verification_uri"),
            )
            verification_uri_complete = self._first_non_none(
                device_payload.get(self.config.device_verification_uri_complete_field),
                device_payload.get("verification_uri_complete"),
            )
            interval_raw = self._first_non_none(
                device_payload.get(self.config.device_interval_field),
                device_payload.get("interval"),
            )
            expires_in_raw = self._first_non_none(
                device_payload.get(self.config.device_expires_in_field),
                device_payload.get("expires_in"),
            )
            interval = int(interval_raw or self.config.device_poll_interval or 5)
            expires_in = int(expires_in_raw or self.config.device_poll_timeout or 900)
            stored_payload = dict(device_payload)
            stored_payload["device_code"] = device_code
            if user_code is not None:
                stored_payload["user_code"] = user_code
            if verification_uri is not None:
                stored_payload["verification_uri"] = verification_uri
            if verification_uri_complete is not None:
                stored_payload["verification_uri_complete"] = verification_uri_complete
            stored_payload["interval"] = interval
            stored_payload["expires_in"] = expires_in
            stored_payload["expires_at"] = int(time.time()) + expires_in
            logger.info(
                "[%s] Saving device state payload=%s",
                self.source_id,
                redact_sensitive_fields(stored_payload),
            )
            self._save_device_state(stored_payload)
            # Save initial pending status
            self._save_device_flow_status("pending", {
                "device": stored_payload,
                "expires_at": stored_payload.get("expires_at"),
            })
            logger.info(f"[{self.source_id}] Device flow started successfully")
            return stored_payload
        except Exception as e:
            logger.exception(
                "[%s] Device flow failed: %s",
                self.source_id,
                sanitize_log_reason(e),
            )
            raise

    async def poll_device_token(self) -> dict[str, Any]:
        device_state = self._get_device_state()
        if not device_state:
            raise ValueError(f"[{self.source_id}] no pending device flow")
        if int(device_state.get("expires_at", 0)) <= int(time.time()):
            self._clear_device_state()
            self._save_device_flow_status("expired")
            return {"status": "expired"}

        if not self.config.token_url:
            raise ValueError(f"[{self.source_id}] OAuth token_url is required")

        client_id, client_secret = self._get_client_credentials()
        device_code = self._first_non_none(
            device_state.get(self.config.device_code_field),
            device_state.get("device_code"),
        )
        if not device_code:
            self._clear_device_state()
            self._save_device_flow_status("error", {
                "status": "error",
                "error": "invalid_device_state",
                "error_description": "Missing device_code in stored state",
            })
            return {
                "status": "error",
                "error": "invalid_device_state",
                "error_description": "Missing device_code in stored state",
            }
        payload = {
            OAuthParams.GRANT_TYPE: DEVICE_CODE_GRANT,
            (self.config.device_code_field or "device_code"): device_code,
        }
        if client_id:
            payload[OAuthParams.CLIENT_ID] = client_id
        if client_secret and self.config.token_endpoint_auth_method.value == "client_secret_post":
            payload[OAuthParams.CLIENT_SECRET] = client_secret

        async with httpx.AsyncClient(**self._httpx_client_kwargs()) as client:
            response = await client.post(self.config.token_url, data=payload, headers={"Accept": "application/json"})

        response_payload = self._parse_oauth_payload(response)
        if isinstance(response_payload, dict):
            logger.info(
                "[%s] Device poll parsed payload keys=%s status_code=%s",
                self.source_id,
                sorted(response_payload.keys()),
                response.status_code,
            )
        else:
            logger.warning(
                "[%s] Device poll payload parse failed status_code=%s content_type=%s",
                self.source_id,
                response.status_code,
                response.headers.get("content-type"),
            )

        is_error_response = response.status_code >= 400 or (
            isinstance(response_payload, dict) and bool(
                response_payload.get(self.config.oauth_error_field or "error")
                or response_payload.get("error")
            )
        )
        if is_error_response:
            error_payload: dict[str, Any]
            if isinstance(response_payload, dict):
                error_payload = response_payload
            else:
                error_payload = {"error": "oauth_error", "error_description": response.text}

            error_code = self._first_non_none(
                error_payload.get(self.config.oauth_error_field),
                error_payload.get("error"),
            )
            error_description = self._first_non_none(
                error_payload.get(self.config.oauth_error_description_field),
                error_payload.get("error_description"),
            )
            provider_interval = self._coerce_positive_int(
                self._first_non_none(
                    error_payload.get(self.config.device_interval_field),
                    error_payload.get("interval"),
                )
            )
            current_interval = (
                provider_interval
                or self._coerce_positive_int(
                    self._first_non_none(
                        device_state.get(self.config.device_interval_field),
                        device_state.get("interval"),
                    )
                )
                or self.config.device_poll_interval
                or 5
            )
            logger.info(
                "[%s] Device poll error code=%s interval=%s description=%s",
                self.source_id,
                error_code,
                current_interval,
                sanitize_log_reason(error_description),
            )
            if error_code == "authorization_pending":
                device_state["interval"] = current_interval
                self._save_device_state(device_state)
                self._save_device_flow_status("pending", {"retry_after": current_interval})
                return {"status": "pending", "retry_after": current_interval}
            if error_code == "slow_down":
                current_interval = provider_interval or (current_interval + 5)
                device_state["interval"] = current_interval
                self._save_device_state(device_state)
                self._save_device_flow_status("pending", {"retry_after": current_interval})
                return {"status": "pending", "retry_after": current_interval}
            if error_code in {"expired_token", "invalid_grant"}:
                self._clear_device_state()
                self._save_device_flow_status("expired")
                return {"status": "expired"}
            if error_code == "access_denied":
                self._clear_device_state()
                self._save_device_flow_status("denied")
                return {"status": "denied"}
            error_result = {
                "status": "error",
                "error": error_code or "oauth_error",
                "error_description": error_description,
            }
            self._save_device_flow_status("error", error_result)
            return error_result

        if not isinstance(response_payload, dict):
            error_result = {
                "status": "error",
                "error": "oauth_error",
                "error_description": "OAuth token endpoint returned non-JSON response",
            }
            self._save_device_flow_status("error", error_result)
            return error_result

        token_payload = dict(response_payload)
        access_token = token_payload.get(OAuthParams.ACCESS_TOKEN)
        token_field = self.config.token_field or OAuthParams.ACCESS_TOKEN
        if not access_token:
            access_token = self._first_non_none(
                token_payload.get(token_field),
                token_payload.get(self.config.implicit_access_token_field),
            )
            if access_token:
                token_payload[OAuthParams.ACCESS_TOKEN] = access_token

        if not access_token:
            error_result = {
                "status": "error",
                "error": "invalid_token_response",
                "error_description": "OAuth token response missing access_token",
            }
            self._save_device_flow_status("error", error_result)
            return error_result

        self._save_token(token_payload)
        self._clear_device_state()
        self._save_device_flow_status("authorized")
        return {"status": "authorized"}

    def _parse_oauth_payload(self, response: httpx.Response) -> dict[str, Any] | None:
        """
        Parse OAuth endpoint response payload.
        Supports both JSON and x-www-form-urlencoded formats.
        """
        try:
            payload = response.json()
            if isinstance(payload, dict):
                return payload
        except Exception:
            pass

        text = response.text or ""
        if not text:
            return None

        content_type = (response.headers.get("content-type") or "").lower()
        if (
            "application/x-www-form-urlencoded" not in content_type
            and "text/plain" not in content_type
            and "=" not in text
        ):
            return None

        parsed = parse_qs(text, keep_blank_values=True)
        if not parsed:
            return None

        flattened: dict[str, Any] = {}
        for key, values in parsed.items():
            if not values:
                continue
            flattened[key] = values[0] if len(values) == 1 else values
        return flattened

    def _coerce_positive_int(self, value: Any) -> int | None:
        try:
            parsed = int(value)
            return parsed if parsed > 0 else None
        except (TypeError, ValueError):
            return None

    # -- Refresh/client credentials ---------------------------------------

    async def fetch_client_credentials_token(self) -> dict[str, Any]:
        if not self.config.token_url:
            raise ValueError(f"[{self.source_id}] OAuth token_url is required")

        payload = {OAuthParams.GRANT_TYPE: GrantType.CLIENT_CREDENTIALS.value}
        if self.config.scopes:
            payload[OAuthParams.SCOPE] = " ".join(self.config.scopes)

        if (self.config.token_request_type or "form").strip().lower() in JSON_STYLE_TOKEN_REQUEST_TYPES:
            token = await self._fetch_token_json(payload)
            self._save_token(token)
            return token

        client = self._build_oauth_client(grant_type=GrantType.CLIENT_CREDENTIALS.value)
        token = await client.fetch_token(
            url=self.config.token_url,
            grant_type=GrantType.CLIENT_CREDENTIALS.value,
        )
        token_dict = dict(token)
        self._save_token(token_dict)
        return token_dict

    async def _refresh_token(self) -> None:
        if not self._token_data:
            return

        refresh_token = self._token_data.get(OAuthParams.REFRESH_TOKEN)
        if not refresh_token:
            logger.warning(f"[{self.source_id}] token expired and refresh_token missing")
            return

        if (self.config.token_request_type or "form").strip().lower() in JSON_STYLE_TOKEN_REQUEST_TYPES:
            payload = {
                OAuthParams.GRANT_TYPE: GrantType.REFRESH_TOKEN.value,
                OAuthParams.REFRESH_TOKEN: refresh_token,
            }
            refreshed = await self._fetch_token_json(payload)
            merged = dict(self._token_data)
            merged.update(refreshed)
            self._save_token(merged)
            return

        client = self._build_oauth_client(token=self._token_data)
        token = await client.refresh_token(self.config.token_url, refresh_token=refresh_token)
        merged = dict(self._token_data)
        merged.update(dict(token))
        self._save_token(merged)

    async def try_refresh_token(self, force: bool = False) -> bool:
        """Try to refresh OAuth token in-place. Returns True only when refresh updated token data."""
        self._load_token()
        if not self._token_data:
            return False

        refresh_token = self._token_data.get(OAuthParams.REFRESH_TOKEN)
        if not refresh_token:
            return False

        before_access = self._token_data.get(OAuthParams.ACCESS_TOKEN)
        before_saved_at = self._token_data.get("saved_at")
        before_refresh = refresh_token

        try:
            if force:
                await self._refresh_token()
            else:
                await self.ensure_fresh_token()
        except Exception as exc:
            logger.warning("[%s] OAuth refresh failed: %s", self.source_id, sanitize_log_reason(exc))
            return False

        self._load_token()
        if not self._token_data:
            return False

        after_access = self._token_data.get(OAuthParams.ACCESS_TOKEN)
        after_saved_at = self._token_data.get("saved_at")
        after_refresh = self._token_data.get(OAuthParams.REFRESH_TOKEN)

        return bool(
            after_access
            and (
                after_access != before_access
                or after_saved_at != before_saved_at
                or after_refresh != before_refresh
            )
        )

    async def ensure_fresh_token(self) -> None:
        if not self._token_data:
            return

        flow = self._flow_type()
        expires_at = self._token_data.get("expires_at")
        if expires_at is not None:
            try:
                expired = time.time() >= float(expires_at) - 60
            except (TypeError, ValueError):
                expired = False
            if expired:
                if flow == "client_credentials":
                    await self.fetch_client_credentials_token()
                    return
                if self._token_data.get(OAuthParams.REFRESH_TOKEN):
                    await self._refresh_token()
                    return

        grant_type = GrantType.CLIENT_CREDENTIALS.value if flow == "client_credentials" else None
        client = self._build_oauth_client(token=self._token_data, grant_type=grant_type)
        previous_access_token = self._token_data.get(OAuthParams.ACCESS_TOKEN)

        try:
            await client.ensure_active_token(self._token_data)
            if client.token and client.token.get(OAuthParams.ACCESS_TOKEN) != previous_access_token:
                self._save_token(dict(client.token))
        except InvalidTokenError:
            if flow == "client_credentials":
                await self.fetch_client_credentials_token()
            elif self._token_data.get(OAuthParams.REFRESH_TOKEN):
                await self._refresh_token()

    async def ensure_valid_token(self) -> None:
        flow = self._flow_type()

        if flow == "client_credentials" and not self.has_token:
            await self.fetch_client_credentials_token()
            return

        if self._token_data:
            await self.ensure_fresh_token()

    # -- HTTP integration --------------------------------------------------

    def apply(self, client: httpx.AsyncClient) -> httpx.AsyncClient:
        if self._token_data and OAuthParams.ACCESS_TOKEN in self._token_data:
            client.headers["Authorization"] = f"Bearer {self._token_data[OAuthParams.ACCESS_TOKEN]}"
        return client

    @property
    def has_token(self) -> bool:
        # Keep in-memory cache consistent with persisted secrets.
        self._load_token()
        return bool(self._token_data and OAuthParams.ACCESS_TOKEN in self._token_data)
