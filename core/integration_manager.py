"""
Integration manager for integration/source YAML file operations.
"""

import os
from pathlib import Path
from typing import Any, List, Optional

import yaml


# Use the same config-root discovery logic as config_loader.
def find_config_root() -> Path:
    """Find the root config directory."""
    base = Path(os.getenv("GLANCIER_DATA_DIR", "."))
    config_dir = base / "config"
    if config_dir.is_dir():
        return config_dir
    return base


class IntegrationManager:
    """Manage integration and source YAML files."""

    def __init__(self, config_root: Optional[str] = None):
        if config_root:
            self.config_root = Path(config_root)
        else:
            self.config_root = find_config_root()

        self.integrations_dir = self.config_root / "integrations"

        # Ensure directory exists.
        self.integrations_dir.mkdir(parents=True, exist_ok=True)

    def _iter_integration_files(self) -> List[Path]:
        files = {}
        for pattern in ("*.yaml", "*.yml"):
            for file_path in self.integrations_dir.glob(pattern):
                if file_path.name.startswith("."):
                    continue
                files[file_path.name] = file_path
        return [files[name] for name in sorted(files)]

    def normalize_filename(self, filename: str) -> str:
        cleaned = Path(filename.strip()).name
        if not cleaned:
            raise ValueError("Filename cannot be empty")
        if cleaned.endswith((".yaml", ".yml")):
            return cleaned
        return f"{cleaned}.yaml"

    def _resolve_file_path(self, filename: str) -> Path:
        normalized = self.normalize_filename(filename)
        return self.integrations_dir / normalized

    def list_integration_files(self) -> List[str]:
        """List all integration config filenames."""
        return [file_path.name for file_path in self._iter_integration_files()]

    def _read_display_name_from_file(self, file_path: Path) -> Optional[str]:
        """Read top-level `name` field from a single integration file."""
        try:
            with open(file_path, "r", encoding="utf-8") as fp:
                content = yaml.safe_load(fp)
        except Exception:
            return None

        if not isinstance(content, dict):
            return None

        raw_name = content.get("name")
        if not isinstance(raw_name, str):
            return None

        display_name = raw_name.strip()
        return display_name or None

    def get_integration_display_name(self, filename: str) -> Optional[str]:
        """Return display name (top-level `name`) for an integration file."""
        file_path = self._resolve_file_path(filename)
        if not file_path.exists():
            return None
        return self._read_display_name_from_file(file_path)

    def get_integration_path(self, filename: str) -> Optional[str]:
        """Return absolute path for an integration file."""
        file_path = self._resolve_file_path(filename)
        if not file_path.exists():
            return None
        try:
            return str(file_path.resolve())
        except Exception:
            return str(file_path)

    def list_integration_file_metadata(self) -> List[dict[str, Any]]:
        """List integration file metadata (`filename` / `id` / `name`)."""
        items: List[dict[str, Any]] = []
        for file_path in self._iter_integration_files():
            items.append(
                {
                    "filename": file_path.name,
                    "id": file_path.stem,
                    "name": self._read_display_name_from_file(file_path),
                }
            )
        return items

    def get_integration_ids_in_file(self, filename: str) -> List[str]:
        """Return integration IDs for file (stem-based)."""
        file_path = self._resolve_file_path(filename)
        if not file_path.exists():
            return []

        integration_id = file_path.stem
        try:
            with open(file_path, "r", encoding="utf-8") as fp:
                content = yaml.safe_load(fp)
        except Exception as exc:
            print(f"Error reading integration ids from {file_path}: {exc}")
            return []

        # Empty file is allowed; ID still comes from filename stem.
        if content is None:
            return [integration_id]

        # New format must be object; any internal id is ignored in favor of filename.
        if not isinstance(content, dict):
            return []

        return [integration_id]

    def find_files_by_integration_id(self, integration_id: str) -> List[str]:
        """Find filenames whose stem matches integration ID."""
        target = integration_id.strip()
        if not target:
            return []

        return [
            filename
            for filename in self.list_integration_files()
            if Path(filename).stem == target
        ]

    def get_integration(self, filename: str) -> Optional[str]:
        """Read integration file content by filename."""
        file_path = self._resolve_file_path(filename)
        if not file_path.exists():
            return None
        with open(file_path, "r", encoding="utf-8") as file_obj:
            return file_obj.read()

    def save_integration(self, filename: str, content: str) -> bool:
        """Save integration file content by filename."""
        file_path = self._resolve_file_path(filename)
        if not file_path.exists():
            return False
        try:
            with open(file_path, "w", encoding="utf-8") as file_obj:
                file_obj.write(content)
            return True
        except Exception as exc:
            print(f"Error saving integration {filename}: {exc}")
            return False

    def create_integration(self, filename: str, content: str = "") -> bool:
        """Create a new integration file by filename."""
        try:
            file_path = self._resolve_file_path(filename)
        except ValueError as exc:
            print(f"Error creating integration {filename}: {exc}")
            return False

        try:
            with open(file_path, "w", encoding="utf-8") as file_obj:
                file_obj.write(content)
            return True
        except Exception as exc:
            print(f"Error creating integration {file_path.name}: {exc}")
            return False

    def delete_integration(self, filename: str) -> bool:
        """Delete integration file by filename."""
        file_path = self._resolve_file_path(filename)
        if file_path.exists():
            try:
                file_path.unlink()
                return True
            except Exception as exc:
                print(f"Error deleting integration {filename}: {exc}")
                return False
        return False
