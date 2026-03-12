import os
import json
import logging
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class SystemSettings(BaseModel):
    autostart: bool = False
    proxy: str = ""  # e.g. "http://127.0.0.1:7890"
    encryption_enabled: bool = False
    debug_logging_enabled: bool = False
    # Timeout for a single webview scraper task in seconds.
    # Timed-out tasks are skipped so queue can continue.
    scraper_timeout_seconds: int = Field(default=10, ge=1, le=300)
    # base64 encoded AES-256 master key; stored locally, never synced
    master_key: Optional[str] = None
    theme: str = "system" # can be 'light', 'dark', or 'system'


_SETTINGS_DIR = Path(os.getenv("GLANCIER_DATA_DIR", ".")) / "data"
_SETTINGS_FILE = "settings.json"


class SettingsManager:
    """
    负责管理系统级配置 (如开机自启状态、代理、加密开关等)。
    独立于 data.json (用户视图配置) 存储，以防多端同步互相覆盖。
    """

    def __init__(self, settings_dir: str | Path | None = None):
        if settings_dir is None:
            settings_dir = _SETTINGS_DIR
        self.settings_dir = Path(settings_dir)
        self.settings_dir.mkdir(parents=True, exist_ok=True)
        self.settings_file = self.settings_dir / _SETTINGS_FILE
        logger.info(f"System settings file: {self.settings_file}")

    def load_settings(self) -> SystemSettings:
        if not self.settings_file.exists():
            return SystemSettings()
        try:
            with open(self.settings_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return SystemSettings.model_validate(data)
        except Exception as e:
            logger.error(f"Failed to load settings from {self.settings_file}: {e}")
            return SystemSettings()

    def save_settings(self, settings: SystemSettings):
        try:
            with open(self.settings_file, "w", encoding="utf-8") as f:
                json.dump(settings.model_dump(), f, indent=2, ensure_ascii=False)
            logger.info("System settings saved successfully.")
            if settings.master_key:
                from core.encryption import set_keychain_master_key

                if not set_keychain_master_key(
                    settings.master_key,
                    account=str(self.settings_file.resolve()),
                ):
                    logger.warning(
                        "Master key could not be persisted to keychain; fallback remains settings.json."
                    )
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")

    def get_or_create_master_key(self) -> str:
        """
        获取或创建本地主密钥。
        首次调用时自动生成并持久化到 keychain 和 settings.json。
        返回 base64 编码的主密钥字节串。
        """
        from core.encryption import (
            generate_master_key,
            get_keychain_master_key,
            set_keychain_master_key,
        )
        settings = self.load_settings()
        keychain_key = get_keychain_master_key(account=str(self.settings_file.resolve()))
        if keychain_key:
            if settings.master_key != keychain_key:
                settings.master_key = keychain_key
                self.save_settings(settings)
            return keychain_key

        if settings.master_key:
            set_keychain_master_key(
                settings.master_key,
                account=str(self.settings_file.resolve()),
            )
            return settings.master_key
        # 首次：生成并持久化
        new_key = generate_master_key()
        settings.master_key = new_key
        self.save_settings(settings)
        logger.info("Generated new master key for local encryption.")
        return new_key
