from __future__ import annotations

from core.settings_manager import SettingsManager, SystemSettings


def test_load_settings_defaults_include_scraper_timeout(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)

    settings = manager.load_settings()

    assert settings.scraper_timeout_seconds == 10
    assert settings.debug_logging_enabled is False
    assert settings.refresh_interval_minutes == 30
    assert settings.encryption_enabled is True
    assert settings.language == "en"


def test_save_and_reload_scraper_timeout(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    expected = SystemSettings(
        scraper_timeout_seconds=25,
        proxy="http://127.0.0.1:7890",
        debug_logging_enabled=True,
        refresh_interval_minutes=30,
        language="zh",
    )

    manager.save_settings(expected)
    loaded = manager.load_settings()

    assert loaded.scraper_timeout_seconds == 25
    assert loaded.proxy == "http://127.0.0.1:7890"
    assert loaded.debug_logging_enabled is True
    assert loaded.refresh_interval_minutes == 30
    assert loaded.language == "zh"


def test_load_settings_invalid_language_falls_back_to_en(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    manager.settings_file.write_text(
        '{"language":"jp","proxy":"http://127.0.0.1:7890"}',
        encoding="utf-8",
    )

    loaded = manager.load_settings()

    assert loaded.language == "en"
    assert loaded.proxy == "http://127.0.0.1:7890"
    assert loaded.refresh_interval_minutes == 0
    assert loaded.encryption_enabled is False


def test_load_settings_invalid_refresh_interval_falls_back_to_default(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    manager.settings_file.write_text(
        '{"refresh_interval_minutes": 7, "encryption_enabled": true}',
        encoding="utf-8",
    )

    loaded = manager.load_settings()

    assert loaded.refresh_interval_minutes == 30
    assert loaded.encryption_enabled is True


def test_save_settings_drops_legacy_master_key_field(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    manager.settings_file.write_text(
        '{"master_key":"legacy","encryption_enabled":true}',
        encoding="utf-8",
    )

    settings = manager.load_settings()
    manager.save_settings(settings)
    saved_payload = manager.settings_file.read_text(encoding="utf-8")

    assert "master_key" not in saved_payload
