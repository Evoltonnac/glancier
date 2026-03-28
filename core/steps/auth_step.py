"""
Auth Step Module.

This module handles interactive/auth-like steps: API_KEY, FORM, CURL, and OAUTH.
It interacts with the secrets manager to retrieve persisted values and, if absent,
triggers a runtime InteractionRequest.

Args Schema:
    API_KEY:
        - label (str, optional): UI label for the key input.
        - description (str, optional): UI placeholder/help text.
        - message (str, optional): Contextual message for the request.
    FORM:
        - fields (list[dict], optional): list of form field definitions.
          each item supports: key, label, type, description, required, default.
        - key/label/type/description/required/default (optional): single-field shorthand.
        - defaults (dict, optional): fallback defaults by field key.
        - message (str, optional): prompt message.
        - warning_message (str, optional): warning text.
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


def _is_missing_required_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False


def _build_form_field_specs(step: "StepConfig", args: Dict[str, Any]) -> list[Dict[str, Any]]:
    defaults = args.get("defaults") if isinstance(args.get("defaults"), dict) else {}
    raw_fields = args.get("fields")

    if raw_fields is None:
        raw_fields = [
            {
                "key": args.get("key", "value"),
                "label": args.get("label"),
                "type": args.get("type"),
                "description": args.get("description"),
                "required": args.get("required"),
                "default": args.get("default"),
                "options": args.get("options"),
                "multiple": args.get("multiple"),
                "value_type": args.get("value_type"),
            }
        ]

    if not isinstance(raw_fields, list) or not raw_fields:
        raise ValueError(f"Form step '{step.id}' requires a non-empty 'fields' list")

    specs: list[Dict[str, Any]] = []
    for idx, raw_field in enumerate(raw_fields):
        if not isinstance(raw_field, dict):
            raise ValueError(f"Form step '{step.id}' field index {idx} must be an object")

        key = raw_field.get("key")
        if not isinstance(key, str) or not key.strip():
            raise ValueError(f"Form step '{step.id}' field index {idx} requires a non-empty 'key'")
        key = key.strip()
        label = raw_field.get("label")
        field_type = raw_field.get("type")
        description = raw_field.get("description")
        required = raw_field.get("required")
        has_default = "default" in raw_field
        default = raw_field.get("default") if has_default else defaults.get(key)
        raw_options = raw_field.get("options")
        options = raw_options if isinstance(raw_options, list) else []
        multiple = bool(raw_field.get("multiple"))
        value_type = raw_field.get("value_type")

        if isinstance(field_type, str):
            normalized_type = field_type.strip().lower()
        else:
            normalized_type = "text"

        if normalized_type in {"multiselect", "multi_select", "checkbox_group"}:
            multiple = True
        if normalized_type in {"switch", "toggle"}:
            normalized_value_type = "boolean"
        elif multiple:
            normalized_value_type = "string[]"
        elif isinstance(value_type, str) and value_type.strip():
            normalized_value_type = value_type.strip()
        else:
            normalized_value_type = "string"

        specs.append(
            {
                "source_key": key,
                "secret_key": _secret_name_for_source(step, key, key),
                "label": label if isinstance(label, str) and label.strip() else key,
                "type": normalized_type or "text",
                "description": description if isinstance(description, str) else None,
                "required": True if required is None else bool(required),
                "default": default,
                "options": options,
                "multiple": multiple,
                "value_type": normalized_value_type,
            }
        )

    return specs


async def execute_auth_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: Dict[str, Any],
    context: Dict[str, Any],
    outputs: Dict[str, Any],
    executor: "Executor",
) -> Dict[str, Any]:
    """
    Executes an interactive/auth step (API_KEY, FORM, CURL, or OAUTH).
    
    Returns:
        Dict[str, Any]: output dictionary with keys like api_key, oauth_secrets, etc.
    """
    from core.executor import RequiredSecretMissing
    from core.source_state import InteractionType, InteractionField

    if step.use == StepType.API_KEY:
        secret_key = _secret_name_for_source(step, "api_key", "api_key")
        api_key = executor._secrets.get_secret(source.id, secret_key)

        if _is_missing_required_value(api_key):
            raise RequiredSecretMissing(
                source_id=source.id,
                step_id=step.id,
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

    elif step.use == StepType.FORM:
        field_specs = _build_form_field_specs(step, args)
        resolved_values: Dict[str, Any] = {}
        interaction_fields = []

        for spec in field_specs:
            value = executor._secrets.get_secret(source.id, spec["secret_key"])

            if _is_missing_required_value(value):
                interaction_fields.append(
                    InteractionField(
                        key=spec["secret_key"],
                        label=spec["label"],
                        type=spec["type"],
                        description=spec["description"],
                        required=spec["required"],
                        default=spec["default"],
                        options=spec["options"],
                        multiple=spec["multiple"],
                        value_type=spec["value_type"],
                    )
                )
                continue

            resolved_values[spec["source_key"]] = value

        if interaction_fields:
            raise RequiredSecretMissing(
                source_id=source.id,
                step_id=step.id,
                interaction_type=InteractionType.INPUT_TEXT,
                fields=interaction_fields,
                message=args.get("message", f"Missing required form values for {source.name}"),
                warning_message=args.get("warning_message"),
            )

        return resolved_values

    elif step.use == StepType.CURL:
        secret_key = _secret_name_for_source(step, "curl_command", "curl_command")
        curl_command = executor._secrets.get_secret(source.id, secret_key)
        
        if not curl_command:
            raise RequiredSecretMissing(
                source_id=source.id,
                step_id=step.id,
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

        token_payload: Dict[str, Any] = {}
        if isinstance(default_payload, dict):
            token_payload.update(default_payload)
        if oauth_secret_key != "oauth_secrets" and isinstance(explicit_payload, dict):
            token_payload.update(explicit_payload)

        token = token_payload.get("access_token")

        oauth_args = args or {}
        flow_type = (
            oauth_args.get("oauth_flow")
            or oauth_args.get("flow_type")
            or oauth_args.get("grant_type")
            or "code"
        ).strip().lower()
        normalized_flow = flow_type
        if flow_type in {"device_code", "urn:ietf:params:oauth:grant-type:device_code"}:
            normalized_flow = "device"
        elif flow_type in {"client-credentials"}:
            normalized_flow = "client_credentials"

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
                description="OAuth Client Secret",
                required=False,
            ))

        if not token:
            interaction_type = (
                InteractionType.OAUTH_DEVICE_FLOW
                if normalized_flow == "device"
                else InteractionType.OAUTH_START
            )
            interaction_data = {
                "oauth_args": oauth_args,
                "doc_url": oauth_args.get("doc_url"),
                "oauth_flow": normalized_flow,
            }
            required_fields = [field for field in interaction_fields if field.required]
            guidance = (
                "Please provide required OAuth credentials."
                if required_fields
                else (
                    "Optional OAuth credentials can be provided before authorization."
                    if interaction_fields
                    else "Click to authorize."
                )
            )
            msg = f"Authorization required for step {step.id}. {guidance}"
            raise RequiredSecretMissing(
                source_id=source.id,
                step_id=step.id,
                interaction_type=interaction_type,
                fields=interaction_fields,
                message=msg,
                data=interaction_data
            )
            
        return {
            "oauth_secrets": dict(token_payload),
        }

    return {}
