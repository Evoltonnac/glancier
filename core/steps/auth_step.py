"""
Auth Step Module.

This module handles the execution of authentication-related steps: API_KEY, CURL, and OAUTH.
It interacts with the secrets manager to retrieve credentials and, if absent, triggers
an InteractionRequest for user input or OAuth flow authorization.

Args Schema:
    API_KEY:
        - label (str, optional): UI label for the key input.
        - description (str, optional): UI placeholder/help text.
        - message (str, optional): Contextual message for the request.
    CURL:
        - label (str, optional): UI label.
        - description (str, optional): UI description.
        - message (str, optional): Context message.
        - warning_message (str, optional): Highlighted warning string for security or caveats.
    OAUTH:
        - client_id (str, optional): OAuth client ID.
        - client_secret (str, optional): OAuth client secret.
        - doc_url (str, optional): Integration doc URL to show to the user.

Return Structure:
    dict: Extracted tokens, keys, or parsed headers, matching step outputs.
"""

import shlex
import logging
from typing import Dict, Any, TYPE_CHECKING
from core.config_loader import StepType

if TYPE_CHECKING:
    from core.config_loader import StepConfig, SourceConfig
    from core.executor import Executor

logger = logging.getLogger(__name__)


def _secret_name_for_source(step: "StepConfig", source_path: str, default: str) -> str:
    if not step.secrets:
        return default
    for secret_name, mapped_path in step.secrets.items():
        if mapped_path == source_path:
            return secret_name
    return default


async def execute_auth_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: Dict[str, Any],
    context: Dict[str, Any],
    outputs: Dict[str, Any],
    executor: "Executor",
) -> Dict[str, Any]:
    """
    Executes an authentication step (API_KEY, CURL, or OAUTH).
    
    Returns:
        Dict[str, Any]: output dictionary with keys like api_key, access_token, etc.
    """
    from core.executor import RequiredSecretMissing
    from core.source_state import InteractionType, InteractionField

    if step.use == StepType.API_KEY:
        secret_key = _secret_name_for_source(step, "api_key", "api_key")
        api_key = executor._secrets.get_secret(source.id, secret_key)

        if not api_key:
            raise RequiredSecretMissing(
                source_id=source.id,
                interaction_type=InteractionType.INPUT_TEXT,
                fields=[
                    InteractionField(
                        key=secret_key,
                        label=args.get("label", "API Key"),
                        type="password",
                        description=args.get("description", "Please enter the API Key")
                    )
                ],
                message=args.get("message", f"Missing API Key for {source.name}")
            )

        return {"api_key": api_key}

    elif step.use == StepType.CURL:
        secret_key = _secret_name_for_source(step, "curl_command", "curl_command")
        curl_command = executor._secrets.get_secret(source.id, secret_key)
        
        if not curl_command:
            raise RequiredSecretMissing(
                source_id=source.id,
                interaction_type=InteractionType.INPUT_TEXT,
                fields=[
                    InteractionField(
                        key=secret_key,
                        label=args.get("label", "cURL Request"),
                        type="text",
                        description=args.get("description", "Paste your cURL command here")
                    )
                ],
                message=args.get("message", f"Provide cURL request for {source.name}"),
                warning_message=args.get("warning_message")
            )
            
        extracted_headers = {}
        try:
            tokens = shlex.split(curl_command)
            for i, token in enumerate(tokens):
                if token in ("-H", "--header") and i + 1 < len(tokens):
                    header_str = tokens[i + 1]
                    if ":" in header_str:
                        k, v = header_str.split(":", 1)
                        extracted_headers[k.strip()] = v.strip()
        except Exception as e:
            logger.error(f"Failed to parse cURL command for step {step.id}: {e}")
            
        # Flatten extracted headers to top-level keys so `outputs` can map
        # using either direct header names (e.g. "Authorization") or dotted paths ("headers.Authorization").
        output = {"curl_command": curl_command, "headers": extracted_headers}
        output.update(extracted_headers)
        return output

    elif step.use == StepType.OAUTH:
        token_data = executor._secrets.get_secrets(source.id)
        oauth_secret_key = _secret_name_for_source(step, "oauth_secrets", "oauth_secrets")
        explicit_payload = token_data.get(oauth_secret_key) if oauth_secret_key else None
        default_payload = token_data.get("oauth_secrets")
        legacy_payload = token_data.get("access_token")

        normalized_explicit = explicit_payload if isinstance(explicit_payload, dict) else {}
        if isinstance(explicit_payload, str):
            normalized_explicit = {"access_token": explicit_payload}

        normalized_default = default_payload if isinstance(default_payload, dict) else {}
        if isinstance(default_payload, str):
            normalized_default = {"access_token": default_payload}

        normalized_legacy = legacy_payload if isinstance(legacy_payload, dict) else {}
        if isinstance(legacy_payload, str):
            normalized_legacy = {"access_token": legacy_payload}

        token_payload = dict(normalized_legacy)
        token_payload.update(normalized_default)
        token_payload.update(normalized_explicit)

        token = token_payload.get("access_token") or token_payload.get("key")

        oauth_args = args or {}
        client_id = oauth_args.get("client_id") or token_data.get("client_id")
        client_secret = oauth_args.get("client_secret") or token_data.get("client_secret")

        interaction_fields = []
        if not client_id:
            interaction_fields.append(InteractionField(
                key="client_id",
                label="Client ID",
                type="text",
                description="OAuth Client ID"
            ))
        if not client_secret:
            interaction_fields.append(InteractionField(
                key="client_secret",
                label="Client Secret",
                type="password",
                description="OAuth Client Secret"
            ))

        if not token:
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
            interaction_data = {
                "oauth_args": oauth_args,
                "doc_url": oauth_args.get("doc_url"),
                "oauth_flow": flow_type,
            }
            msg = f"Authorization required for step {step.id}. " + ("Please provide client credentials." if interaction_fields else "Click to authorize.")
            raise RequiredSecretMissing(
                source_id=source.id,
                interaction_type=interaction_type,
                fields=interaction_fields,
                message=msg,
                data=interaction_data
            )
            
        normalized_payload = dict(token_payload) if token_payload else {"access_token": token}
        if token and "access_token" not in normalized_payload:
            normalized_payload["access_token"] = token
        output: Dict[str, Any] = {
            "access_token": token,
            "oauth_secrets": normalized_payload,
        }
        for key in (
            "refresh_token",
            "expires_in",
            "expires_at",
            "scope",
            "token_type",
            "created_at",
            "saved_at",
        ):
            if normalized_payload.get(key) is not None:
                output[key] = normalized_payload[key]
        return output

    return {}
