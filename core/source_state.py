"""
Runtime state models for sources, including status enums and interaction payloads.
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SourceStatus(str, Enum):
    ACTIVE = "active"
    ERROR = "error"
    SUSPENDED = "suspended"  # Suspended, waiting for user interaction.
    DISABLED = "disabled"
    CONFIG_CHANGED = "config_changed"  # Config changed, reload required.
    REFRESHING = "refreshing"  # Refresh in progress.


class InteractionType(str, Enum):
    INPUT_TEXT = "input_text"
    OAUTH_START = "oauth_start"
    OAUTH_DEVICE_FLOW = "oauth_device_flow"
    COOKIES_REFRESH = "cookies_refresh"
    CAPTCHA = "captcha"
    CONFIRM = "confirm"
    RETRY = "retry"  # Simple retry action.
    WEBVIEW_SCRAPE = "webview_scrape"  # Silent WebView scraping.


class InteractionField(BaseModel):
    """Describe one field required by an interaction."""
    key: str
    label: str
    type: str = "text"  # text, password, etc.
    description: Optional[str] = None
    required: bool = True
    default: Optional[Any] = None


class InteractionRequest(BaseModel):
    """
    Interaction request emitted by backend.
    When a source is suspended, this payload tells the frontend what to do.
    """
    type: InteractionType
    step_id: Optional[str] = None  # Flow step ID that triggered interaction.
    source_id: Optional[str] = None  # Associated source ID.

    title: str = "Action Required"
    message: Optional[str] = None
    warning_message: Optional[str] = None
    
    fields: List[InteractionField] = Field(default_factory=list)
    data: Dict[str, Any] | None = None  # Additional metadata (for example oauth_url).


class SourceState(BaseModel):
    """Runtime state for one source."""
    source_id: str
    status: SourceStatus = SourceStatus.ACTIVE
    message: Optional[str] = None
    last_updated: float = 0.0
    
    # When status is SUSPENDED, interaction should be present.
    interaction: Optional[InteractionRequest] = None
