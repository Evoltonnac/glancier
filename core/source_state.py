"""
数据源运行时状态定义。
包含状态枚举、交互请求模型等。
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SourceStatus(str, Enum):
    ACTIVE = "active"
    ERROR = "error"
    SUSPENDED = "suspended" # 挂起，等待用户交互
    DISABLED = "disabled"
    CONFIG_CHANGED = "config_changed" # 配置已更改，需要重新加载
    REFRESHING = "refreshing" # 正在刷新中


class InteractionType(str, Enum):
    INPUT_TEXT = "input_text"
    OAUTH_START = "oauth_start"
    OAUTH_DEVICE_FLOW = "oauth_device_flow"
    COOKIES_REFRESH = "cookies_refresh"
    CAPTCHA = "captcha"
    CONFIRM = "confirm"
    RETRY = "retry" # 简单的重试按钮
    WEBVIEW_SCRAPE = "webview_scrape" # 静默 Webview 采集


class InteractionField(BaseModel):
    """描述交互所需的字段。"""
    key: str
    label: str
    type: str = "text" # text, password, etc.
    description: Optional[str] = None
    required: bool = True
    default: Optional[Any] = None


class InteractionRequest(BaseModel):
    """
    后端发起的交互请求。
    当数据源处于 SUSPENDED 状态时，通过此对象告知前端需要做什么。
    """
    type: InteractionType
    step_id: Optional[str] = None # 触发交互的 Flow Step ID
    source_id: Optional[str] = None # 关联的数据源 ID

    title: str = "Action Required"
    message: Optional[str] = None
    warning_message: Optional[str] = None
    
    fields: List[InteractionField] = Field(default_factory=list)
    data: Dict[str, Any] | None = None # 其他元数据 (e.g. oauth_url)


class SourceState(BaseModel):
    """数据源的运行时状态。"""
    source_id: str
    status: SourceStatus = SourceStatus.ACTIVE
    message: Optional[str] = None
    last_updated: float = 0.0
    
    # 当状态为 SUSPENDED 时，必须包含 interaction
    interaction: Optional[InteractionRequest] = None
