from __future__ import annotations

from core.settings_manager import SettingsManager, SystemSettings
from core.encryption import generate_master_key


def test_load_settings_defaults_include_scraper_timeout(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)

    settings = manager.load_settings()

    assert settings.scraper_timeout_seconds == 10
    assert settings.debug_logging_enabled is False
    assert settings.refresh_interval_minutes == 0


def test_save_and_reload_scraper_timeout(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    expected = SystemSettings(
        scraper_timeout_seconds=25,
        proxy="http://127.0.0.1:7890",
        debug_logging_enabled=True,
        refresh_interval_minutes=30,
    )

    manager.save_settings(expected)
    loaded = manager.load_settings()

    assert loaded.scraper_timeout_seconds == 25
    assert loaded.proxy == "http://127.0.0.1:7890"
    assert loaded.debug_logging_enabled is True
    assert loaded.refresh_interval_minutes == 30


def test_get_or_create_master_key_prefers_keychain_value(tmp_path, monkeypatch):
    manager = SettingsManager(settings_dir=tmp_path)
    file_key = generate_master_key()
    keychain_key = generate_master_key()

    monkeypatch.setattr("core.encryption.set_keychain_master_key", lambda *args, **kwargs: True)
    manager.save_settings(SystemSettings(master_key=file_key))
    monkeypatch.setattr("core.encryption.get_keychain_master_key", lambda *args, **kwargs: keychain_key)

    resolved = manager.get_or_create_master_key()

    assert resolved == keychain_key
    assert manager.load_settings().master_key == keychain_key


def test_get_or_create_master_key_backfills_keychain_from_settings(tmp_path, monkeypatch):
    manager = SettingsManager(settings_dir=tmp_path)
    file_key = generate_master_key()
    set_calls: list[str] = []

    monkeypatch.setattr("core.encryption.get_keychain_master_key", lambda *args, **kwargs: None)

    def fake_set_keychain(master_key_b64: str, *args, **kwargs) -> bool:
        set_calls.append(master_key_b64)
        return True

    monkeypatch.setattr("core.encryption.set_keychain_master_key", fake_set_keychain)
    manager.save_settings(SystemSettings(master_key=file_key))
    set_calls.clear()

    resolved = manager.get_or_create_master_key()

    assert resolved == file_key
    assert set_calls == [file_key]
