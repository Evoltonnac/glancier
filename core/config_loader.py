"""
Config loader: parse YAML config files into Pydantic models.
"""

import logging
import os
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

import copy
import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

logger = logging.getLogger(__name__)


# ── Enums ─────────────────────────────────────────────

class AuthType(str, Enum):
    API_KEY = "api_key"
    BROWSER = "browser"
    OAUTH = "oauth"
    NONE = "none"


class ParserType(str, Enum):
    JSONPATH = "jsonpath"
    CSS = "css"
    REGEX = "regex"
    SCRIPT = "script"  # Custom Python script


class HttpMethod(str, Enum):
    GET = "GET"
    POST = "POST"


class ViewComponentType(str, Enum):
    METRIC = "metric"
    LINE_CHART = "line_chart"
    BAR_CHART = "bar_chart"
    TABLE = "table"
    JSON = "json"
    BADGE = "badge"
    STAT_GRID = "stat_grid"
    SOURCE_CARD = "source_card"





# ── Auth config ───────────────────────────────────────

class TokenEndpointAuthMethod(str, Enum):
    CLIENT_SECRET_BASIC = "client_secret_basic"
    CLIENT_SECRET_POST = "client_secret_post"
    NONE = "none"

class OAuthFlowType(str, Enum):
    CODE = "code"
    DEVICE = "device"
    CLIENT_CREDENTIALS = "client_credentials"


class AuthConfig(BaseModel):
    type: AuthType = AuthType.NONE
    # API key mode
    api_key: Optional[str] = None
    header_name: str = "Authorization"
    header_prefix: str = "Bearer"
    # Browser cookie mode
    browser: str = "chrome"  # chrome / edge / firefox
    domain: Optional[str] = None
    # OAuth mode
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    auth_url: Optional[str] = None
    token_url: Optional[str] = None
    scopes: List[str] = Field(default_factory=list)
    redirect_uri: str = "http://localhost:5173/oauth/callback"

    # OAuth PKCE Support
    supports_pkce: bool = True
    code_challenge_method: str = "S256"
    response_type: str = "code"
    oauth_flow: OAuthFlowType = OAuthFlowType.CODE

    # OAuth Token Endpoint Auth Method
    token_endpoint_auth_method: TokenEndpointAuthMethod = TokenEndpointAuthMethod.NONE

    # OAuth Customization (for non-standard providers like OpenRouter)
    token_request_type: str = "form"  # form / json(response) / json_body(request body)
    token_field: str = "access_token"  # The field in response to use as token
    token_type_field: str = "token_type"
    expires_in_field: str = "expires_in"
    refresh_token_field: str = "refresh_token"
    scope_field: str = "scope"
    redirect_param: str = "redirect_uri"  # The query param for redirect url
    authorization_code_field: str = "code"
    authorization_state_field: str = "state"
    implicit_access_token_field: str = "access_token"
    implicit_token_type_field: str = "token_type"
    implicit_expires_in_field: str = "expires_in"
    implicit_scope_field: str = "scope"
    implicit_state_field: str = "state"
    device_authorization_url: Optional[str] = None
    device_code_field: str = "device_code"
    device_user_code_field: str = "user_code"
    device_verification_uri_field: str = "verification_uri"
    device_verification_uri_complete_field: str = "verification_uri_complete"
    device_interval_field: str = "interval"
    device_expires_in_field: str = "expires_in"
    oauth_error_field: str = "error"
    oauth_error_description_field: str = "error_description"
    device_poll_interval: int = 5
    device_poll_timeout: int = 900

    # Documentation URL for user to create OAuth client
    doc_url: Optional[str] = None

    # User Info Field Mapping
    user_info_field_map: Dict[str, str] = Field(default_factory=dict)  # e.g. {"email": "user_email", "id": "user_id"}
    
# ── Request config ────────────────────────────────────

class RequestConfig(BaseModel):
    url: str
    method: HttpMethod = HttpMethod.GET
    headers: Dict[str, str] = Field(default_factory=dict)
    params: Dict[str, str] = Field(default_factory=dict)
    body: Optional[Dict[str, Any]] = None
    timeout: float = 30.0


# ── Parser config ─────────────────────────────────────

class FieldMapping(BaseModel):
    name: str
    expr: str  # JSONPath / CSS Selector / Regex pattern
    type: str = "str"  # str / int / float / bool


class ParserConfig(BaseModel):
    type: ParserType = ParserType.JSONPATH
    fields: List[FieldMapping] = Field(default_factory=list)
    script: Optional[str] = None  # Script mode: Python script path


# ── Schedule config ───────────────────────────────────

class ScheduleConfig(BaseModel):
    cron: Optional[str] = None  # Cron expression (for example "*/30 * * * *")
    interval_minutes: int = 60  # Default: 60 minutes


# ── Source config ─────────────────────────────────────

# ── Flow Configuration ────────────────────────────────────────

class StepType(str, Enum):
    HTTP = "http"
    OAUTH = "oauth"
    API_KEY = "api_key"
    FORM = "form"
    CURL = "curl"
    EXTRACT = "extract"
    SCRIPT = "script"
    LOG = "log"
    SQL = "sql"
    MONGODB = "mongodb"
    REDIS = "redis"
    WEBVIEW = "webview"


def _schema_optional_type(type_name: str) -> Dict[str, Any]:
    return {
        "anyOf": [
            {"type": type_name},
            {"type": "null"},
        ],
        "default": None,
    }


# Step args schemas are declared next to StepType so adding/modifying a step
# updates runtime step definition and schema contract in one place.
STEP_ARGS_SCHEMAS_BY_USE: Dict[str, Dict[str, Any]] = {
    StepType.HTTP.value: {
        "type": "object",
        "properties": {
            "url": {"type": "string", "minLength": 1},
            "method": {"type": "string"},
            "headers": {"type": "object", "additionalProperties": True},
            "timeout": {"type": "number"},
            "retries": {"type": "integer", "minimum": 0},
            "retry_backoff_seconds": {"type": "number", "minimum": 0},
        },
        "required": ["url"],
        "additionalProperties": True,
    },
    StepType.OAUTH.value: {
        "type": "object",
        "properties": {
            "auth_url": {"type": "string"},
            "token_url": {"type": "string"},
            "client_id": {"type": "string"},
            "client_secret": {"type": "string"},
            "doc_url": {"type": "string"},
            "title": _schema_optional_type("string"),
            "description": _schema_optional_type("string"),
            "message": _schema_optional_type("string"),
            "warning_message": _schema_optional_type("string"),
            "scope": {
                "anyOf": [
                    {"type": "string"},
                    {"type": "array", "items": {"type": "string"}},
                ]
            },
            "scopes": {"type": "array", "items": {"type": "string"}},
            "oauth_flow": {"type": "string"},
            "flow_type": {"type": "string"},
            "grant_type": {"type": "string"},
            "redirect_uri": {"type": "string"},
            "device_authorization_url": {"type": "string"},
            "device_authorization_endpoint": {"type": "string"},
            "token_endpoint_auth_method": {"type": "string"},
            "supports_pkce": {"type": "boolean"},
            "code_challenge_method": {"type": "string"},
            "response_type": {"type": "string"},
            "token_request_type": {"type": "string"},
            "token_field": {"type": "string"},
            "token_type_field": {"type": "string"},
            "expires_in_field": {"type": "string"},
            "refresh_token_field": {"type": "string"},
            "scope_field": {"type": "string"},
            "redirect_param": {"type": "string"},
            "authorization_code_field": {"type": "string"},
            "authorization_state_field": {"type": "string"},
            "implicit_access_token_field": {"type": "string"},
            "implicit_token_type_field": {"type": "string"},
            "implicit_expires_in_field": {"type": "string"},
            "implicit_scope_field": {"type": "string"},
            "implicit_state_field": {"type": "string"},
            "device_code_field": {"type": "string"},
            "device_user_code_field": {"type": "string"},
            "device_verification_uri_field": {"type": "string"},
            "device_verification_uri_complete_field": {"type": "string"},
            "device_interval_field": {"type": "string"},
            "device_expires_in_field": {"type": "string"},
            "oauth_error_field": {"type": "string"},
            "oauth_error_description_field": {"type": "string"},
            "device_poll_interval": {"type": "integer", "minimum": 1},
            "device_poll_timeout": {"type": "integer", "minimum": 1},
        },
        "additionalProperties": True,
    },
    StepType.API_KEY.value: {
        "type": "object",
        "properties": {
            "title": _schema_optional_type("string"),
            "label": _schema_optional_type("string"),
            "description": _schema_optional_type("string"),
            "message": _schema_optional_type("string"),
            "warning_message": _schema_optional_type("string"),
        },
        "additionalProperties": True,
    },
    StepType.FORM.value: {
        "type": "object",
        "properties": {
            "title": _schema_optional_type("string"),
            "description": _schema_optional_type("string"),
            "fields": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": _schema_optional_type("string"),
                        "key": {"type": "string", "minLength": 1},
                        "label": _schema_optional_type("string"),
                        "type": _schema_optional_type("string"),
                        "description": _schema_optional_type("string"),
                        "placeholder": _schema_optional_type("string"),
                        "required": {"type": "boolean"},
                        "default": {},
                        "options": {
                            "type": "array",
                            "items": {"type": "object", "additionalProperties": True},
                        },
                        "multiple": {"type": "boolean"},
                        "value_type": {"type": "string"},
                    },
                    "required": ["key"],
                    "additionalProperties": True,
                },
            },
            "key": {"type": "string", "minLength": 1},
            "label": _schema_optional_type("string"),
            "type": _schema_optional_type("string"),
            "required": {"type": "boolean"},
            "default": {},
            "options": {
                "type": "array",
                "items": {"type": "object", "additionalProperties": True},
            },
            "multiple": {"type": "boolean"},
            "value_type": _schema_optional_type("string"),
            "defaults": {"type": "object", "additionalProperties": True},
            "message": _schema_optional_type("string"),
            "warning_message": _schema_optional_type("string"),
        },
        "additionalProperties": True,
    },
    StepType.CURL.value: {
        "type": "object",
        "properties": {
            "title": _schema_optional_type("string"),
            "label": _schema_optional_type("string"),
            "description": _schema_optional_type("string"),
            "message": _schema_optional_type("string"),
            "warning_message": _schema_optional_type("string"),
        },
        "additionalProperties": True,
    },
    StepType.EXTRACT.value: {
        "type": "object",
        "properties": {
            "source": {},
            "type": {"type": "string", "enum": ["jsonpath", "key"]},
        },
        "required": ["source"],
        "additionalProperties": True,
    },
    StepType.SCRIPT.value: {
        "type": "object",
        "properties": {
            "code": {"type": "string", "minLength": 1},
        },
        "required": ["code"],
        "additionalProperties": True,
    },
    StepType.LOG.value: {
        "type": "object",
        "properties": {
            "message": _schema_optional_type("string"),
        },
        "additionalProperties": True,
    },
    StepType.SQL.value: {
        "type": "object",
        "properties": {
            "connector": {
                "type": "object",
                "properties": {
                    "profile": {"type": "string", "minLength": 1},
                    "options": {"type": "object", "additionalProperties": True},
                },
                "required": ["profile"],
                "additionalProperties": True,
            },
            "dsn": {"type": "string", "minLength": 1},
            "uri": {"type": "string", "minLength": 1},
            "query": {"type": "string", "minLength": 1},
            "timeout": {
                "anyOf": [
                    {"type": "number", "minimum": 1},
                    {"type": "string", "minLength": 1},
                ]
            },
            "max_rows": {
                "anyOf": [
                    {"type": "integer", "minimum": 1},
                    {"type": "string", "minLength": 1},
                ]
            },
        },
        "required": ["connector", "query"],
        "anyOf": [
            {"required": ["dsn"]},
            {"required": ["uri"]},
        ],
        "additionalProperties": True,
    },
    StepType.MONGODB.value: {
        "type": "object",
        "properties": {
            "connector": {
                "type": "object",
                "properties": {
                    "profile": {"type": "string", "minLength": 1},
                },
                "required": ["profile"],
                "additionalProperties": True,
            },
            "dsn": {"type": "string", "minLength": 1},
            "uri": {"type": "string", "minLength": 1},
            "database": {"type": "string", "minLength": 1},
            "collection": {"type": "string", "minLength": 1},
            "operation": {"type": "string", "enum": ["find", "aggregate"]},
            "filter": {"type": "object", "additionalProperties": True},
            "projection": {
                "anyOf": [
                    {"type": "object", "additionalProperties": True},
                    {
                        "type": "array",
                        "items": {"type": "string", "minLength": 1},
                    },
                ]
            },
            "sort": {"type": "object", "additionalProperties": True},
            "pipeline": {
                "type": "array",
                "items": {"type": "object", "additionalProperties": True},
            },
            "timeout": {
                "anyOf": [
                    {"type": "number", "minimum": 1},
                    {"type": "string", "minLength": 1},
                ]
            },
            "max_rows": {
                "anyOf": [
                    {"type": "integer", "minimum": 1},
                    {"type": "string", "minLength": 1},
                ]
            },
        },
        "required": ["database", "collection", "operation"],
        "anyOf": [
            {"required": ["dsn"]},
            {"required": ["uri"]},
        ],
        "additionalProperties": True,
    },
    StepType.REDIS.value: {
        "type": "object",
        "properties": {
            "connector": {
                "type": "object",
                "properties": {
                    "profile": {"type": "string", "minLength": 1},
                },
                "required": ["profile"],
                "additionalProperties": True,
            },
            "dsn": {"type": "string", "minLength": 1},
            "uri": {"type": "string", "minLength": 1},
            "command": {"type": "string", "minLength": 1},
            "key": {"type": "string", "minLength": 1},
            "keys": {
                "type": "array",
                "minItems": 1,
                "items": {"type": "string", "minLength": 1},
            },
            "start": {
                "anyOf": [
                    {"type": "integer"},
                    {"type": "string", "minLength": 1},
                ]
            },
            "stop": {
                "anyOf": [
                    {"type": "integer"},
                    {"type": "string", "minLength": 1},
                ]
            },
            "withscores": {"type": "boolean"},
            "timeout": {
                "anyOf": [
                    {"type": "number", "minimum": 1},
                    {"type": "string", "minLength": 1},
                ]
            },
            "max_rows": {
                "anyOf": [
                    {"type": "integer", "minimum": 1},
                    {"type": "string", "minLength": 1},
                ]
            },
        },
        "required": ["command"],
        "anyOf": [
            {"required": ["dsn"]},
            {"required": ["uri"]},
        ],
        "additionalProperties": True,
    },
    StepType.WEBVIEW.value: {
        "type": "object",
        "properties": {
            "url": {"type": "string", "minLength": 1},
            "script": _schema_optional_type("string"),
            "intercept_api": _schema_optional_type("string"),
            "title": _schema_optional_type("string"),
            "description": _schema_optional_type("string"),
            "message": _schema_optional_type("string"),
            "warning_message": _schema_optional_type("string"),
        },
        "required": ["url"],
        "additionalProperties": True,
    },
}


class StepConfig(BaseModel):
    id: str
    run: Optional[str] = None
    use: StepType
    args: Dict[str, Any] = Field(default_factory=dict)
    outputs: Dict[str, str] = Field(default_factory=dict)
    context: Dict[str, str] = Field(default_factory=dict)
    # Explicit map of internal outputs keys to store as secret names in SecretsController
    secrets: Dict[str, str] = Field(default_factory=dict)


# ── View component config ─────────────────────────────

class ViewComponent(BaseModel):
    id: str
    type: ViewComponentType = ViewComponentType.METRIC
    source_id: Optional[str] = None  # Make optional for templates/groups
    field: Optional[str] = None
    icon: Optional[str] = None
    label: Optional[str] = None
    format: Optional[str] = None
    delta_field: Optional[str] = None

    # Source Card Extension
    ui: Optional[Dict[str, Any]] = None
    widgets: Optional[List[Dict[str, Any]]] = None

    # Reference to a group
    use_group: Optional[str] = None # If set, this component expands to a group of components
    group_vars: Dict[str, Any] = Field(default_factory=dict) # Vars to inject into the group


# ── Integration Configuration ────────────────────────────────────────

class IntegrationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: Optional[str] = None
    description: Optional[str] = None
    # Integration-level default auto-refresh interval in minutes.
    # None means unset, 0 means disabled.
    default_refresh_interval_minutes: Optional[int] = Field(default=None, ge=0)
    flow: Optional[List[StepConfig]] = None
    # View Templates - defined in Integration YAML
    templates: List[ViewComponent] = Field(default_factory=list)


# ── Source Configuration ────────────────────────────────────────

class SourceConfig(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = None
    enabled: bool = True

    # Integration Reference
    integration: Optional[str] = None  # Reference to an integration ID
    vars: Dict[str, Any] = Field(default_factory=dict) # Variables for template substitution

    schedule: ScheduleConfig = Field(default_factory=ScheduleConfig)

    # Flow Configuration (New)
    flow: Optional[List[StepConfig]] = None

    @model_validator(mode='after')
    def check_config_completeness(self) -> "SourceConfig":
        # Note: This runs AFTER resolution, so flow should be populated
        if not self.flow and not self.integration:
             # It's possible flow is optional for some very basic integrations?
             # But usually it should be required now.
             pass 
        return self





# ── Top-level config ──────────────────────────────────

class AppConfig(BaseModel):
    sources: List[SourceConfig] = Field(default_factory=list)
    # Hidden fields for internal storage of templates
    integrations: List[IntegrationConfig] = Field(default_factory=list, exclude=True)

    @model_validator(mode="after")
    def ensure_unique_integration_ids(self) -> "AppConfig":
        seen: set[str] = set()
        duplicates: set[str] = set()
        for integration in self.integrations:
            if integration.id in seen:
                duplicates.add(integration.id)
            seen.add(integration.id)
        if duplicates:
            duplicate_list = ", ".join(sorted(duplicates))
            raise ValueError(f"Duplicate integration ids detected: {duplicate_list}")
        return self

    def get_source(self, source_id: str) -> Optional[SourceConfig]:
        for s in self.sources:
            if s.id == source_id:
                return s
        return None

    def get_integration(self, integration_id: str) -> Optional[IntegrationConfig]:
        """Get integration config by ID."""
        for i in self.integrations:
            if i.id == integration_id:
                return i
        return None

    def enabled_sources(self) -> List[SourceConfig]:
        return [s for s in self.sources if s.enabled]


# ── Loading & Resolution ──────────────────────────────────────────

_CONFIG_SEARCH_PATHS = [
    "config/config.yaml",
    "config.yaml",
]

def find_config_root() -> Path:
    """Find the root config file or directory."""
    base = Path(os.getenv("GLANCEUS_DATA_DIR", "."))
    # Check for config directory
    config_dir = base / "config"
    if config_dir.is_dir():
        return config_dir
    
    # Fallback to single file
    for p in _CONFIG_SEARCH_PATHS:
        path = base / p
        if path.exists():
            return path
            
    # Default to current dir if nothing found (will try to load empty)
    return base

def deep_merge_dict(base: dict, update: dict) -> dict:
    """Deep merge two dictionaries. Appends lists if key is 'sections' in 'views' context."""
    for k, v in update.items():
        if isinstance(v, dict) and k in base and isinstance(base[k], dict):
            base[k] = deep_merge_dict(base[k], v)
        elif isinstance(v, list) and k in base and isinstance(base[k], list):
             # Specifically for views.sections, we might want to append.
             # But for other lists (like request.headers if it were a list, or exclusions), 
             # usually overwrite is safer unless we know it's a collection.
             # 'sections' is definitely a collection.
             if k == "sections":
                 base[k].extend(v)
             else:
                 base[k] = v
        else:
            base[k] = v
    return base

def substitute_vars(obj: Any, variables: Dict[str, Any]) -> Any:
    """Recursively substitute strings in obj with variables."""
    if isinstance(obj, str):
        try:
            return obj.format(**variables)
        except (KeyError, IndexError):
            # If a var is missing, leave it as is or log warning? 
            # For now, return as is if format fails, but keys might be partially replaced?
            # 'format' is strict. Let's try to be safe.
            # If we want partially replacement we need regex.
            # But standard .format() is powerful.
            # Let's assume user provides all vars.
            return obj
    elif isinstance(obj, dict):
        return {k: substitute_vars(v, variables) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [substitute_vars(v, variables) for v in obj]
    return obj

def load_all_yamls(root: Path) -> dict:
    """Load and merge all YAML files."""
    combined = {
        "sources": [],
        "integrations": []
    }
    
    files = []

    def _is_visible_yaml(path: Path) -> bool:
        return path.is_file() and not path.name.startswith(".")

    if root.is_file():
        if _is_visible_yaml(root):
            files.append(root)
    elif root.is_dir():
        # Only load direct children and specific config directories
        files.extend(path for path in root.glob("*.yaml") if _is_visible_yaml(path))
        files.extend(path for path in root.glob("*.yml") if _is_visible_yaml(path))
        
        integrations_dir = root / "integrations"
        if integrations_dir.is_dir():
            files.extend(path for path in integrations_dir.glob("*.yaml") if _is_visible_yaml(path))
            files.extend(path for path in integrations_dir.glob("*.yml") if _is_visible_yaml(path))
            
        # Sort to ensure deterministic order (e.g. config.yaml first?)
        # Let's just sort by name
        files.sort()

    for f in files:
        try:
            with open(f, "r", encoding="utf-8") as fp:
                content = yaml.safe_load(fp)
                if not content:
                    continue

                if f.parent.name == "integrations":
                    if not isinstance(content, dict):
                        logger.warning("Skipping invalid integration file %s: top-level object required", f)
                        continue

                    integration_payload = copy.deepcopy(content)

                    file_based_id = f.stem
                    declared_id = integration_payload.pop("id", None)
                    if declared_id and declared_id != file_based_id:
                        logger.warning(
                            "Integration id '%s' in %s is ignored; using filename id '%s'",
                            declared_id,
                            f,
                            file_based_id,
                        )
                    integration_payload["id"] = file_based_id
                    combined["integrations"].append(integration_payload)
                    continue

                # Merge lists
                if "sources" in content:
                    combined["sources"].extend(content["sources"])
                if "integrations" in content:
                    combined["integrations"].extend(content["integrations"])

                    
        except Exception as e:
            print(f"Error loading {f}: {e}")
            
    return combined

def resolve_config(raw: dict) -> dict:
    """Resolve integrations and component groups."""
    integrations = {i["id"]: i for i in raw.get("integrations", [])}
    
    # 1. Resolve Sources
    resolved_sources = []
    for s in raw.get("sources", []):
        final_source = copy.deepcopy(s)
        
        # Integration inheritance
        if "integration" in s:
            int_id = s["integration"]
            if int_id in integrations:
                base = copy.deepcopy(integrations[int_id])
                # Remove integration id so it doesn't overwrite source id
                base.pop("id", None)
                
                # Variable substitution in base
                variables = s.get("vars", {})
                # Also provide self props as vars? e.g. {id}, {name}
                # variables.update(s) # Be careful with recursion
                
                base = substitute_vars(base, variables)
                
                # Merge: Source config overrides Integration config
                # We want base keys to be defaults.
                # So we update base with source (s), then result is final.
                # However, deep merging might be needed for nested dicts?
                # Usually s defines 'request' params which might overlap.
                # Let's do a simple top-level update for now, 
                # but 'request' object might need merge if partial override?
                # Simplify: Source overrides whole sections if present.
                
                # Apply base as defaults
                for k, v in base.items():
                    if k not in final_source or final_source[k] is None:
                         final_source[k] = v
                    elif isinstance(v, dict) and isinstance(final_source[k], dict):
                         # Merge dicts (like params in request)
                         final_source[k] = {**v, **final_source[k]}
            else:
                 print(f"Warning: Integration {int_id} not found for source {s.get('id')}")

        resolved_sources.append(final_source)
    
    raw["sources"] = resolved_sources



    return raw

def load_config(path: Optional[str | Path] = None) -> AppConfig:
    """
    Load, merge, and resolve configuration from YAML files.
    """
    if path is None:
        path = find_config_root()
    path = Path(path)

    raw = load_all_yamls(path)

    resolved = resolve_config(raw)

    # Isolate malformed entries so one broken integration/source does not crash whole app.
    def _validate_entries(entries: list[Any], model: type[BaseModel], entry_kind: str) -> list[dict[str, Any]]:
        validated: list[dict[str, Any]] = []
        for idx, entry in enumerate(entries):
            entry_id = f"#{idx}"
            if isinstance(entry, dict):
                entry_id = str(entry.get("id", entry_id))
            try:
                model_obj = model.model_validate(entry)
                validated.append(model_obj.model_dump(mode="python"))
            except ValidationError as exc:
                logger.error("Skipping invalid %s '%s': %s", entry_kind, entry_id, exc)
        return validated

    resolved["integrations"] = _validate_entries(
        resolved.get("integrations", []),
        IntegrationConfig,
        "integration",
    )
    resolved["sources"] = _validate_entries(
        resolved.get("sources", []),
        SourceConfig,
        "source",
    )
    
    # Validation
    return AppConfig.model_validate(resolved)
