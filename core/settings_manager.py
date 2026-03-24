import os
import json
import logging
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, Field, field_validator

from core.refresh_policy import (
    DEFAULT_GLOBAL_REFRESH_INTERVAL_MINUTES,
    MAX_REFRESH_INTERVAL_MINUTES,
    MIN_REFRESH_INTERVAL_MINUTES,
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
    # Optional compatibility hooks for JS-heavy websites during webview scraping.
    enhanced_scraping: bool = False
    # Opt-in Beta guard for script step execution risk.
    script_sandbox_enabled: bool = False
    # Script step timeout in seconds.
    script_timeout_seconds: int = Field(default=10, ge=1, le=120)
    theme: str = "system" # can be 'light', 'dark', or 'system'
    # UI density: 'compact', 'normal', or 'relaxed'
    density: str = "normal"
    # UI language. English is default.
    language: Literal["en", "zh"] = "en"

    @field_validator("proxy", mode="before")
    @classmethod
    def _normalize_proxy(cls, value):
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("refresh_interval_minutes", mode="before")
    @classmethod
    def _validate_refresh_interval_minutes(cls, value):
        normalized = normalize_refresh_interval_minutes(value)
        if normalized is None:
            raise ValueError(
                "refresh_interval_minutes must be 0 (disabled) or between "
                f"{MIN_REFRESH_INTERVAL_MINUTES} and {MAX_REFRESH_INTERVAL_MINUTES} minutes",
            )
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
                had_legacy_master_key = "master_key" in data
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
                raw_script_timeout = data.get("script_timeout_seconds")
                if "script_timeout_seconds" not in data:
                    data["script_timeout_seconds"] = 10
                else:
                    try:
                        script_timeout = int(raw_script_timeout)
                    except (TypeError, ValueError):
                        script_timeout = 10
                    if script_timeout < 1 or script_timeout > 120:
                        script_timeout = 10
                    data["script_timeout_seconds"] = script_timeout
                if not isinstance(data.get("enhanced_scraping"), bool):
                    data["enhanced_scraping"] = False
                settings = SystemSettings.model_validate(data)
                if had_legacy_master_key:
                    # Strip deprecated plaintext master key from settings.json.
                    self.save_settings(settings)
                return settings
        except Exception as e:
            logger.error(f"Failed to load settings from {self.settings_file}: {e}")
            return SystemSettings()

    def save_settings(self, settings: SystemSettings):
        try:
            with open(self.settings_file, "w", encoding="utf-8") as f:
                json.dump(settings.model_dump(), f, indent=2, ensure_ascii=False)
            logger.info("System settings saved successfully.")
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
