import os
import json
import logging
from pathlib import Path
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator

from core.refresh_policy import (
    DEFAULT_GLOBAL_REFRESH_INTERVAL_MINUTES,
    REFRESH_INTERVAL_OPTIONS_MINUTES,
    normalize_refresh_interval_minutes,
)

logger = logging.getLogger(__name__)


class SystemSettings(BaseModel):
    autostart: bool = False
    proxy: str = ""  # e.g. "http://127.0.0.1:7890"
    encryption_enabled: bool = True
    debug_logging_enabled: bool = False
    # Global auto-refresh interval in minutes. 0 means disabled.
    refresh_interval_minutes: int = Field(
        default=DEFAULT_GLOBAL_REFRESH_INTERVAL_MINUTES,
        ge=0,
    )
    # Timeout for a single webview scraper task in seconds.
    # Timed-out tasks are skipped so queue can continue.
    scraper_timeout_seconds: int = Field(default=10, ge=1, le=300)
    # base64 encoded AES-256 master key; stored locally, never synced
    master_key: Optional[str] = None
    theme: str = "system" # can be 'light', 'dark', or 'system'
    # UI density: 'compact', 'normal', or 'relaxed'
    density: str = "normal"
    # UI language. English is default.
    language: Literal["en", "zh"] = "en"

    @field_validator("refresh_interval_minutes", mode="before")
    @classmethod
    def _validate_refresh_interval_minutes(cls, value):
        normalized = normalize_refresh_interval_minutes(value)
        if normalized is None:
            options = ", ".join(str(option) for option in REFRESH_INTERVAL_OPTIONS_MINUTES)
            raise ValueError(f"refresh_interval_minutes must be one of: {options}")
        return normalized


_SETTINGS_DIR = Path(os.getenv("GLANCEUS_DATA_DIR", ".")) / "data"
_SETTINGS_FILE = "settings.json"


class SettingsManager:
    """
    Manage system-level settings (autostart, proxy, encryption switch, etc.).
    Stored separately from data.json (user view data) to avoid sync overwrite issues.
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
                # Backward-compatible normalization for older settings files.
                if not isinstance(data, dict):
                    return SystemSettings()
                if "encryption_enabled" not in data:
                    # Keep legacy installs unchanged when the old field is absent.
                    data["encryption_enabled"] = False
                raw_refresh = data.get("refresh_interval_minutes")
                normalized_refresh = normalize_refresh_interval_minutes(raw_refresh)
                if "refresh_interval_minutes" not in data:
                    # Older settings files defaulted to disabled global refresh.
                    data["refresh_interval_minutes"] = 0
                elif normalized_refresh is None:
                    data["refresh_interval_minutes"] = DEFAULT_GLOBAL_REFRESH_INTERVAL_MINUTES
                else:
                    data["refresh_interval_minutes"] = normalized_refresh
                if data.get("language") not in {"en", "zh"}:
                    data["language"] = "en"
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
        Get or create the local master key.
        On first call, generate and persist to keychain and settings.json.
        Returns the base64-encoded key bytes.
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
        # First-time setup: generate and persist.
        new_key = generate_master_key()
        settings.master_key = new_key
        self.save_settings(settings)
        logger.info("Generated new master key for local encryption.")
        return new_key
