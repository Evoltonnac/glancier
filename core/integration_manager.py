"""
集成管理器和数据源 YAML 文件管理。
"""

import os
from pathlib import Path
from typing import List, Optional

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

    def list_integrations(self) -> List[str]:
        """列出所有集成配置（返回 YAML 文件中定义的 id）。"""
        integration_ids = []
        for f in self.integrations_dir.glob("*.yaml"):
            try:
                with open(f, "r", encoding="utf-8") as fp:
                    content = yaml.safe_load(fp)
                    if content and "integrations" in content:
                        for integration in content["integrations"]:
                            if "id" in integration:
                                integration_ids.append(integration["id"])
            except Exception as e:
                print(f"Error reading integration {f}: {e}")
        return integration_ids

    def _find_integration_file(self, integration_id: str) -> Optional[Path]:
        """根据 integration id 查找对应的文件路径。"""
        for f in self.integrations_dir.glob("*.yaml"):
            try:
                with open(f, "r", encoding="utf-8") as fp:
                    content = yaml.safe_load(fp)
                    if content and "integrations" in content:
                        for integration in content["integrations"]:
                            if integration.get("id") == integration_id:
                                return f
            except Exception as e:
                print(f"Error reading integration {f}: {e}")
        return None

    def get_integration(self, integration_id: str) -> Optional[str]:
        """读取集成配置文件内容。"""
        file_path = self._find_integration_file(integration_id)
        if file_path is None:
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    def save_integration(self, integration_id: str, content: str) -> bool:
        """保存集成配置文件（通过 integration_id 查找文件）。"""
        file_path = self._find_integration_file(integration_id)
        if file_path is None:
            # 如果文件不存在，使用 integration_id 作为文件名
            file_path = self.integrations_dir / f"{integration_id}.yaml"
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"Error saving integration {integration_id}: {e}")
            return False

    def create_integration(self, integration_id: str, content: str = "") -> bool:
        """创建新的集成配置文件。"""
        # 确保文件名以 .yaml 结尾
        filename = f"{integration_id}.yaml"
        if not filename.endswith(".yaml"):
            filename += ".yaml"
        file_path = self.integrations_dir / filename
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"Error creating integration {filename}: {e}")
            return False

    def delete_integration(self, integration_id: str) -> bool:
        """删除集成配置文件。"""
        file_path = self._find_integration_file(integration_id)
        if file_path and file_path.exists():
            try:
                file_path.unlink()
                return True
            except Exception as e:
                print(f"Error deleting integration {integration_id}: {e}")
                return False
        return False
