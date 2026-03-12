"""
鉴权管理器：统一管理各种鉴权方式（API Key, OAuth, Browser Cookie）。
"""

import logging
from typing import Any

from core.config_loader import (
    AppConfig,
    AuthConfig,
    AuthType,
    OAuthFlowType,
    SourceConfig,
    StepType,
    TokenEndpointAuthMethod,
)
from core.secrets_controller import SecretsController
from core.auth.oauth_auth import OAuthAuth

logger = logging.getLogger(__name__)


class AuthManager:
    """
    管理所有数据源的鉴权处理。
    """

    def __init__(self, secrets_controller: SecretsController, app_config: AppConfig | None = None):
        self.secrets = secrets_controller
        self._app_config = app_config
        self._handlers: dict[str, Any] = {}
        self._source_errors: dict[str, str] = {}

    def _find_oauth_step(self, source: SourceConfig) -> tuple[Any, AuthConfig] | None:
        """从 source 或其引用的 integration 中查找 OAuth 步骤，并构建 AuthConfig。"""
        # 首先检查 source 自身的 flow
        flow = source.flow
        integration = None

        # 如果 source 没有 flow，检查引用的 integration
        if not flow and source.integration and self._app_config:
            integration = self._app_config.get_integration(source.integration)
            if integration:
                flow = integration.flow

        if not flow:
            return None

        # 在 flow 中查找 OAuth 步骤
        for step in flow:
            if step.use == StepType.OAUTH:
                # 从 step.args 构建 AuthConfig
                args = step.args

                # 处理 scope 参数（可能是字符串或列表）
                scope_arg = args.get("scope") or args.get("scopes")
                scopes = []
                if scope_arg:
                    if isinstance(scope_arg, list):
                        scopes = scope_arg
                    else:
                        scopes = [scope_arg]

                # 获取 redirect_uri，如果没有则使用默认值
                redirect_uri = args.get("redirect_uri") or "http://localhost:5173/oauth/callback"

                # OAuth flow type
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

                # 解析 token_endpoint_auth_method
                auth_method_str = args.get("token_endpoint_auth_method")
                token_endpoint_auth_method = TokenEndpointAuthMethod.NONE
                if auth_method_str:
                    try:
                        token_endpoint_auth_method = TokenEndpointAuthMethod(auth_method_str)
                    except ValueError:
                        logger.warning(f"[{source.id}] Invalid token_endpoint_auth_method: {auth_method_str}")

                auth_config = AuthConfig(
                    type=AuthType.OAUTH,
                    auth_url=args.get("auth_url"),
                    token_url=args.get("token_url"),
                    client_id=args.get("client_id"),
                    client_secret=args.get("client_secret"),
                    redirect_uri=redirect_uri,
                    scopes=scopes,
                    # OAuth 自定义字段
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
                    # PKCE 支持
                    supports_pkce=args.get("supports_pkce", True),
                    code_challenge_method=args.get("code_challenge_method", "S256"),
                    response_type=args.get("response_type", "code"),
                    oauth_flow=oauth_flow,
                    # Token Endpoint Auth Method
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
                    # Documentation URL
                    doc_url=args.get("doc_url"),
                )
                return (step, auth_config)

        return None

    def register_source(self, source: SourceConfig):
        """注册数据源的鉴权处理程序。"""
        source_id = source.id

        try:
            # source 或 integration 的 flow 中包含 OAuth 步骤
            oauth_step_result = self._find_oauth_step(source)
            if oauth_step_result:
                step, auth_config = oauth_step_result
                self._handlers[source_id] = OAuthAuth(
                    auth_config,
                    source_id,
                    self.secrets
                )
                logger.info(f"[{source_id}] OAuth 鉴权已注册 (from flow)")
                return

            logger.debug(f"[{source_id}] 未配置 OAuth 鉴权流程")

        except Exception as e:
            logger.error(f"[{source_id}] 鉴权注册失败: {e}")
            self._source_errors[source_id] = str(e)

    def get_oauth_handler(self, source_id: str) -> OAuthAuth | None:
        """获取 OAuth 鉴权处理程序。"""
        return self._handlers.get(source_id)

    def get_source_error(self, source_id: str) -> str | None:
        """获取数据源的鉴权错误信息。"""
        return self._source_errors.get(source_id)

    def clear_error(self, source_id: str):
        """清除数据源的鉴权错误。"""
        if source_id in self._source_errors:
            del self._source_errors[source_id]
