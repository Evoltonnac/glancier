from __future__ import annotations

from core.settings_manager import SettingsManager, SystemSettings


def test_load_settings_defaults_include_scraper_timeout(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)

    settings = manager.load_settings()

    assert settings.scraper_timeout_seconds == 10


def test_save_and_reload_scraper_timeout(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    expected = SystemSettings(scraper_timeout_seconds=25, proxy="http://127.0.0.1:7890")

    manager.save_settings(expected)
    loaded = manager.load_settings()

    assert loaded.scraper_timeout_seconds == 25
    assert loaded.proxy == "http://127.0.0.1:7890"
