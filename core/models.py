"""
Data models for stored Sources and Views (JSON-based management).
"""

from typing import Any, Dict, List, Optional, Type

from pydantic import BaseModel, Field


class ViewItem(BaseModel):
    """A single item in a View layout (widget)."""
    id: str = Field(default="", description="Unique identifier for layout engine")
    x: int = Field(default=0, description="X position in grid columns")
    y: int = Field(default=0, description="Y position in grid rows")
    w: int = Field(default=4, description="Width in grid columns")
    h: int = Field(default=2, description="Height in grid rows")
    source_id: str = Field(default="", description="Link to StoredSource")
    template_id: str = Field(default="", description="Link to Integration's templates")
    props: Dict[str, Any] = Field(default_factory=dict, description="Optional overrides for the template")


class StoredView(BaseModel):
    """A stored View configuration."""
    id: str
    name: str
    layout_columns: int = Field(default=12, description="Default 12, supports 24")
    items: List[ViewItem] = Field(default_factory=list, description="List of ViewItems")


class StoredSource(BaseModel):
    """A stored Source configuration."""
    id: str
    integration_id: str
    name: str
    config: Dict[str, Any] = Field(default_factory=dict, description="Authentication and specific settings")
    vars: Dict[str, Any] = Field(default_factory=dict, description="Variables for template substitution")


WIDGET_SCHEMA_MODELS: Dict[str, Type[BaseModel]] = {
    "view_item": ViewItem,
    "stored_view": StoredView,
    "stored_source": StoredSource,
}
