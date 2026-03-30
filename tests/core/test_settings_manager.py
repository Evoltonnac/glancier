from __future__ import annotations

from core.settings_manager import SettingsManager, SystemSettings


def test_load_settings_defaults_include_scraper_timeout(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)

    settings = manager.load_settings()

    assert settings.scraper_timeout_seconds == 10
    assert settings.enhanced_scraping is False
    assert settings.debug_logging_enabled is False
    assert settings.refresh_interval_minutes == 30
    assert settings.encryption_enabled is True
    assert settings.language == "en"
    assert settings.http_private_target_policy_default == "prompt"
    assert settings.sql_default_timeout_seconds == 30
    assert settings.sql_default_max_rows == 500


def test_save_and_reload_scraper_timeout(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    expected = SystemSettings(
        scraper_timeout_seconds=25,
        enhanced_scraping=True,
        proxy="http://127.0.0.1:7890",
        debug_logging_enabled=True,
        refresh_interval_minutes=30,
        language="zh",
        http_private_target_policy_default="allow",
    )

    manager.save_settings(expected)
    loaded = manager.load_settings()

    assert loaded.scraper_timeout_seconds == 25
    assert loaded.enhanced_scraping is True
    assert loaded.proxy == "http://127.0.0.1:7890"
    assert loaded.debug_logging_enabled is True
    assert loaded.refresh_interval_minutes == 30
    assert loaded.language == "zh"
    assert loaded.http_private_target_policy_default == "allow"


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
        '{"refresh_interval_minutes": 10081, "encryption_enabled": true}',
        encoding="utf-8",
    )

    loaded = manager.load_settings()

    assert loaded.refresh_interval_minutes == 30
    assert loaded.encryption_enabled is True


def test_load_settings_custom_refresh_interval_is_preserved(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    manager.settings_file.write_text(
        '{"refresh_interval_minutes": 7, "encryption_enabled": true}',
        encoding="utf-8",
    )

    loaded = manager.load_settings()

    assert loaded.refresh_interval_minutes == 7
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


def test_proxy_value_is_trimmed_on_save_and_load(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)

    manager.save_settings(SystemSettings(proxy="  http://127.0.0.1:7890  "))
    loaded = manager.load_settings()

    assert loaded.proxy == "http://127.0.0.1:7890"

def test_load_settings_enhanced_scraping_defaults_false_on_invalid_value(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    manager.settings_file.write_text(
        '{"enhanced_scraping": "yes"}',
        encoding="utf-8",
    )

    loaded = manager.load_settings()

    assert loaded.enhanced_scraping is False


def test_load_settings_invalid_http_private_target_policy_falls_back_to_prompt(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    manager.settings_file.write_text(
        '{"http_private_target_policy_default":"always_allow","encryption_enabled":true}',
        encoding="utf-8",
    )

    loaded = manager.load_settings()

    assert loaded.http_private_target_policy_default == "prompt"


def test_load_settings_sql_guardrail_defaults_normalize_legacy_values(tmp_path):
    manager = SettingsManager(settings_dir=tmp_path)
    manager.settings_file.write_text(
        (
            '{"encryption_enabled":true,'
            '"sql_default_timeout_seconds":"bad-value",'
            '"sql_default_max_rows":0}'
        ),
        encoding="utf-8",
    )

    loaded = manager.load_settings()

    assert loaded.sql_default_timeout_seconds == 30
    assert loaded.sql_default_max_rows == 500
