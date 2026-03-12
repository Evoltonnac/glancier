"""
Resource Manager: Handles JSON-based storage for Sources and Views.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.models import StoredSource, StoredView

logger = logging.getLogger(__name__)

# Default paths
DATA_DIR = Path(os.getenv("GLANCIER_DATA_DIR", ".")) / "data"
SOURCES_FILE = DATA_DIR / "sources.json"
VIEWS_FILE = DATA_DIR / "views.json"


class ResourceManager:
    """Manages stored Sources and Views in JSON files."""

    def __init__(self, data_dir: Path = DATA_DIR):
        self.data_dir = data_dir
        self.sources_file = data_dir / "sources.json"
        self.views_file = data_dir / "views.json"

        # Ensure data directory exists
        self.data_dir.mkdir(parents=True, exist_ok=True)

    # ── Sources ──────────────────────────────────────────

    def load_sources(self) -> List[StoredSource]:
        """Load all stored sources from JSON file."""
        if not self.sources_file.exists():
            return []
        try:
            with open(self.sources_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [StoredSource(**item) for item in data]
        except Exception as e:
            logger.error(f"Failed to load sources: {e}")
            return []

    def save_source(self, source: StoredSource) -> StoredSource:
        """Create or update a source."""
        sources = self.load_sources()
        # Find existing and update, or append new
        existing_idx = None
        for i, s in enumerate(sources):
            if s.id == source.id:
                existing_idx = i
                break

        if existing_idx is not None:
            sources[existing_idx] = source
        else:
            sources.append(source)

        self._save_sources(sources)
        return source

    def delete_source(self, source_id: str) -> bool:
        """Delete a source by ID."""
        sources = self.load_sources()
        original_len = len(sources)
        sources = [s for s in sources if s.id != source_id]

        if len(sources) < original_len:
            self._save_sources(sources)
            return True
        return False

    def get_source(self, source_id: str) -> Optional[StoredSource]:
        """Get a single source by ID."""
        sources = self.load_sources()
        for s in sources:
            if s.id == source_id:
                return s
        return None

    def _save_sources(self, sources: List[StoredSource]):
        """Save sources list to JSON file."""
        with open(self.sources_file, "w", encoding="utf-8") as f:
            json.dump([s.model_dump() for s in sources], f, indent=2, ensure_ascii=False)

    # ── Views ────────────────────────────────────────────

    def load_views(self) -> List[StoredView]:
        """Load all stored views from JSON file."""
        if not self.views_file.exists():
            return []
        try:
            with open(self.views_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [StoredView(**item) for item in data]
        except Exception as e:
            logger.error(f"Failed to load views: {e}")
            return []

    def save_view(self, view: StoredView) -> StoredView:
        """Create or update a view."""
        views = self.load_views()
        # Find existing and update, or append new
        existing_idx = None
        for i, v in enumerate(views):
            if v.id == view.id:
                existing_idx = i
                break

        if existing_idx is not None:
            views[existing_idx] = view
        else:
            views.append(view)

        self._save_views(views)
        return view

    def delete_view(self, view_id: str) -> bool:
        """Delete a view by ID."""
        views = self.load_views()
        original_len = len(views)
        views = [v for v in views if v.id != view_id]

        if len(views) < original_len:
            self._save_views(views)
            return True
        return False

    def get_view(self, view_id: str) -> Optional[StoredView]:
        """Get a single view by ID."""
        views = self.load_views()
        for v in views:
            if v.id == view_id:
                return v
        return None

    def remove_source_references_from_views(self, source_id: str) -> list[str]:
        """Remove all view items bound to a source_id and return affected view IDs."""
        views = self.load_views()
        if not views:
            return []

        affected_view_ids: list[str] = []
        updated_views: list[StoredView] = []

        for view in views:
            retained_items = [item for item in view.items if item.source_id != source_id]
            if len(retained_items) != len(view.items):
                affected_view_ids.append(view.id)
                updated_views.append(view.model_copy(update={"items": retained_items}))
            else:
                updated_views.append(view)

        if affected_view_ids:
            self._save_views(updated_views)

        return affected_view_ids

    def _save_views(self, views: List[StoredView]):
        """Save views list to JSON file."""
        with open(self.views_file, "w", encoding="utf-8") as f:
            json.dump([v.model_dump() for v in views], f, indent=2, ensure_ascii=False)
