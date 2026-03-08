"""
集成管理器和数据源 YAML 文件管理。
"""

import os
from pathlib import Path
from typing import Any, List, Optional

import yaml


# 使用与 config_loader 相同的逻辑查找配置根目录
def find_config_root() -> Path:
    """Find the root config directory."""
    base = Path(os.getenv("GLANCIER_DATA_DIR", "."))
    config_dir = base / "config"
    if config_dir.is_dir():
        return config_dir
    return base


class IntegrationManager:
    """管理集成和数据源 YAML 文件。"""

    def __init__(self, config_root: Optional[str] = None):
        if config_root:
            self.config_root = Path(config_root)
        else:
            self.config_root = find_config_root()

        self.integrations_dir = self.config_root / "integrations"

        # 确保目录存在
        self.integrations_dir.mkdir(parents=True, exist_ok=True)

    def _iter_integration_files(self) -> List[Path]:
        files = {}
        for pattern in ("*.yaml", "*.yml"):
            for file_path in self.integrations_dir.glob(pattern):
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
        """列出所有集成配置文件名。"""
        return [file_path.name for file_path in self._iter_integration_files()]

    def _read_display_name_from_file(self, file_path: Path) -> Optional[str]:
        """读取单个 integration 文件的顶层 name 字段。"""
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
        """返回 integration 文件的显示名（顶层 name）。"""
        file_path = self._resolve_file_path(filename)
        if not file_path.exists():
            return None
        return self._read_display_name_from_file(file_path)

    def list_integration_file_metadata(self) -> List[dict[str, Any]]:
        """列出 integration 文件元数据（filename/id/name）。"""
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

    def list_integrations(self) -> List[str]:
        """兼容旧调用：返回文件名列表。"""
        return self.list_integration_files()

    def get_integration_ids_in_file(self, filename: str) -> List[str]:
        """返回文件对应的 integration id（文件名去扩展名）。"""
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

        # 空文件允许存在，id 仍以文件名为准。
        if content is None:
            return [integration_id]

        # 新格式应为对象；对象内的 id 字段会被忽略并由文件名注入。
        if not isinstance(content, dict):
            return []

        return [integration_id]

    def find_files_by_integration_id(self, integration_id: str) -> List[str]:
        """查找与 integration id 同名（stem 匹配）的文件名列表。"""
        target = integration_id.strip()
        if not target:
            return []

        return [
            filename
            for filename in self.list_integration_files()
            if Path(filename).stem == target
        ]

    def get_integration(self, filename: str) -> Optional[str]:
        """读取集成配置文件内容（按文件名）。"""
        file_path = self._resolve_file_path(filename)
        if not file_path.exists():
            return None
        with open(file_path, "r", encoding="utf-8") as file_obj:
            return file_obj.read()

    def save_integration(self, filename: str, content: str) -> bool:
        """保存集成配置文件内容（按文件名）。"""
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
        """创建新的集成配置文件（按文件名）。"""
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
        """删除集成配置文件（按文件名）。"""
        file_path = self._resolve_file_path(filename)
        if file_path.exists():
            try:
                file_path.unlink()
                return True
            except Exception as exc:
                print(f"Error deleting integration {filename}: {exc}")
                return False
        return False
