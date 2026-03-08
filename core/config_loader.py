"""
配置加载器：将 YAML 配置文件解析为 Pydantic 模型。
"""

import logging
import os
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

import copy
import yaml
from pydantic import BaseModel, Field, ValidationError, model_validator

logger = logging.getLogger(__name__)


# ── 枚举 ──────────────────────────────────────────────

class AuthType(str, Enum):
    API_KEY = "api_key"
    BROWSER = "browser"
    OAUTH = "oauth"
    NONE = "none"


class ParserType(str, Enum):
    JSONPATH = "jsonpath"
    CSS = "css"
    REGEX = "regex"
    SCRIPT = "script"  # 自定义 Python 脚本


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





# ── 鉴权配置 ──────────────────────────────────────────

class TokenEndpointAuthMethod(str, Enum):
    CLIENT_SECRET_BASIC = "client_secret_basic"
    CLIENT_SECRET_POST = "client_secret_post"
    NONE = "none"


class AuthConfig(BaseModel):
    type: AuthType = AuthType.NONE
    # API Key 模式
    api_key: Optional[str] = None
    header_name: str = "Authorization"
    header_prefix: str = "Bearer"
    # Browser Cookie 模式
    browser: str = "chrome"  # chrome / edge / firefox
    domain: Optional[str] = None
    # OAuth 模式
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    auth_url: Optional[str] = None
    token_url: Optional[str] = None
    scopes: List[str] = Field(default_factory=list)
    redirect_uri: str = "http://localhost:5173/oauth/callback"

    # OAuth PKCE Support
    supports_pkce: bool = True
    code_challenge_method: str = "S256"

    # OAuth Token Endpoint Auth Method
    token_endpoint_auth_method: TokenEndpointAuthMethod = TokenEndpointAuthMethod.NONE

    # OAuth Customization (for non-standard providers like OpenRouter)
    token_request_type: str = "form"  # form / json
    token_field: str = "access_token"  # The field in response to use as token
    redirect_param: str = "redirect_uri"  # The query param for redirect url

    # Documentation URL for user to create OAuth client
    doc_url: Optional[str] = None

    # User Info Field Mapping
    user_info_field_map: Dict[str, str] = Field(default_factory=dict)  # e.g. {"email": "user_email", "id": "user_id"}
    
# ── 请求配置 ──────────────────────────────────────────

class RequestConfig(BaseModel):
    url: str
    method: HttpMethod = HttpMethod.GET
    headers: Dict[str, str] = Field(default_factory=dict)
    params: Dict[str, str] = Field(default_factory=dict)
    body: Optional[Dict[str, Any]] = None
    timeout: float = 30.0


# ── 解析配置 ──────────────────────────────────────────

class FieldMapping(BaseModel):
    name: str
    expr: str  # JSONPath / CSS Selector / Regex pattern
    type: str = "str"  # str / int / float / bool


class ParserConfig(BaseModel):
    type: ParserType = ParserType.JSONPATH
    fields: List[FieldMapping] = Field(default_factory=list)
    script: Optional[str] = None  # script 模式: Python 脚本路径


# ── 调度配置 ──────────────────────────────────────────

class ScheduleConfig(BaseModel):
    cron: Optional[str] = None  # Cron 表达式 (如 "*/30 * * * *")
    interval_minutes: int = 60  # 默认 60 分钟


# ── 数据源配置 ────────────────────────────────────────

# ── Flow Configuration ────────────────────────────────────────

class StepType(str, Enum):
    HTTP = "http"
    OAUTH = "oauth"
    API_KEY = "api_key"
    CURL = "curl"
    EXTRACT = "extract"
    SCRIPT = "script"
    LOG = "log"
    WEBVIEW = "webview"

class StepConfig(BaseModel):
    id: str
    run: Optional[str] = None
    use: StepType
    args: Dict[str, Any] = Field(default_factory=dict)
    outputs: Dict[str, str] = Field(default_factory=dict)
    context: Dict[str, str] = Field(default_factory=dict)
    # Explicit map of internal outputs keys to store as secret names in SecretsController
    secrets: Dict[str, str] = Field(default_factory=dict)


# ── 视图组件配置 ──────────────────────────────────────

class ViewComponent(BaseModel):
    type: ViewComponentType = ViewComponentType.METRIC
    source_id: Optional[str] = None  # Make optional for templates/groups
    field: Optional[str] = None
    icon: Optional[str] = None
    label: str = ""
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
    id: str
    auth: AuthConfig = Field(default_factory=AuthConfig)
    request: Optional[RequestConfig] = None
    parser: ParserConfig = Field(default_factory=ParserConfig)
    flow: Optional[List[StepConfig]] = None
    # View Templates - defined in Integration YAML
    templates: List[ViewComponent] = Field(default_factory=list)


# ── Source Configuration ────────────────────────────────────────

class SourceConfig(BaseModel):
    id: str
    name: str
    description: str = ""
    icon: Optional[str] = None
    enabled: bool = True

    # Integration Reference
    integration: Optional[str] = None  # Reference to an integration ID
    vars: Dict[str, Any] = Field(default_factory=dict) # Variables for template substitution

    # Specific configs (can override integration)
    auth: Optional[AuthConfig] = None
    request: Optional[RequestConfig] = None
    parser: Optional[ParserConfig] = None
    schedule: ScheduleConfig = Field(default_factory=ScheduleConfig)

    # Flow Configuration (New)
    flow: Optional[List[StepConfig]] = None

    @model_validator(mode='after')
    def check_config_completeness(self) -> "SourceConfig":
        # Note: This runs AFTER resolution, so auth/request/parser should be populated
        # But if we validate raw objects before resolution, we need to be careful.
        # Here we assume this model is used validates the FINAL object.
        if not self.flow and not self.auth and not self.integration:
             # It's possible auth is optional/none default, but request is usually required.
             pass 
        return self





# ── 顶层配置 ──────────────────────────────────────────

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
        """根据 ID 获取集成配置。"""
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
    base = Path(os.getenv("GLANCIER_DATA_DIR", "."))
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
    if root.is_file():
        files.append(root)
    elif root.is_dir():
        # Recursive glob
        files.extend(root.glob("**/*.yaml"))
        files.extend(root.glob("**/*.yml"))
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

                    integration_payload: dict[str, Any]
                    if "integrations" in content:
                        legacy_items = content.get("integrations")
                        if not isinstance(legacy_items, list) or len(legacy_items) != 1:
                            logger.warning(
                                "Skipping integration file %s: expected exactly one item in legacy 'integrations' list",
                                f,
                            )
                            continue
                        legacy_item = legacy_items[0]
                        if not isinstance(legacy_item, dict):
                            logger.warning("Skipping integration file %s: legacy integration item must be object", f)
                            continue
                        integration_payload = copy.deepcopy(legacy_item)
                    else:
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
