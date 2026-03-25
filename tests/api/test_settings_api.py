from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.master_key_provider import MasterKeyUnavailableError
from core.settings_manager import SystemSettings


class _MockSettingsManager:
    def __init__(self, settings: SystemSettings):
        self._settings = settings
        self.saved: list[SystemSettings] = []

    def load_settings(self) -> SystemSettings:
        return self._settings

    def save_settings(self, settings: SystemSettings):
        self._settings = settings
        self.saved.append(settings)


class _MockSecrets:
    def __init__(self):
        self.calls: list[str] = []

    def migrate_encrypt_all(self):
        self.calls.append("encrypt")

    def migrate_decrypt_all(self):
        self.calls.append("decrypt")


class _MockMasterKeyProvider:
    def __init__(self, *, available: bool, error: Exception | None = None):
        self.available = available
        self.error = error
        self.provision_calls = 0

    def is_encryption_available(self) -> bool:
        return self.available

    def get_or_create_master_key(self) -> str:
        self.provision_calls += 1
        if self.error is not None:
            raise self.error
        return "master-key"


def _build_client(
    settings_manager: _MockSettingsManager,
    *,
    secrets: _MockSecrets | None = None,
    master_key_provider: _MockMasterKeyProvider | None = None,
) -> TestClient:
    api_module.init_api(
        executor=SimpleNamespace(get_source_state=lambda _source_id: None),
        data_controller=SimpleNamespace(),
        config=SimpleNamespace(integrations=[]),
        auth_manager=SimpleNamespace(),
        secrets_controller=secrets or _MockSecrets(),
        resource_manager=SimpleNamespace(load_sources=lambda: []),
        integration_manager=SimpleNamespace(),
        settings_manager=settings_manager,
        master_key_provider=master_key_provider,
    )
    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app)


def test_get_settings_includes_encryption_available_flag():
    settings_manager = _MockSettingsManager(SystemSettings(encryption_enabled=False))
    provider = _MockMasterKeyProvider(available=False)
    client = _build_client(settings_manager, master_key_provider=provider)

    response = client.get("/api/settings")

    assert response.status_code == 200
    assert response.json()["encryption_available"] is False
    assert "master_key" not in response.json()


def test_update_settings_rejects_enable_when_keyring_unavailable():
    settings_manager = _MockSettingsManager(SystemSettings(encryption_enabled=False))
    provider = _MockMasterKeyProvider(
        available=False,
        error=MasterKeyUnavailableError("System keyring backend is unavailable."),
    )
    secrets = _MockSecrets()
    client = _build_client(
        settings_manager,
        secrets=secrets,
        master_key_provider=provider,
    )

    payload = settings_manager.load_settings().model_dump()
    payload["encryption_enabled"] = True
    response = client.put("/api/settings", json=payload)

    assert response.status_code == 400
    assert "System keyring backend is unavailable" in response.json()["detail"]
    assert settings_manager.saved == []
    assert secrets.calls == []


def test_update_settings_runs_encrypt_migration_on_enable():
    settings_manager = _MockSettingsManager(SystemSettings(encryption_enabled=False))
    provider = _MockMasterKeyProvider(available=True)
    secrets = _MockSecrets()
    client = _build_client(
        settings_manager,
        secrets=secrets,
        master_key_provider=provider,
    )

    payload = settings_manager.load_settings().model_dump()
    payload["encryption_enabled"] = True
    response = client.put("/api/settings", json=payload)

    assert response.status_code == 200
    assert response.json()["encryption_enabled"] is True
    assert response.json()["encryption_available"] is True
    assert provider.provision_calls == 1
    assert secrets.calls == ["encrypt"]


def test_update_settings_runs_decrypt_migration_on_disable():
    settings_manager = _MockSettingsManager(SystemSettings(encryption_enabled=True))
    provider = _MockMasterKeyProvider(available=True)
    secrets = _MockSecrets()
    client = _build_client(
        settings_manager,
        secrets=secrets,
        master_key_provider=provider,
    )

    payload = settings_manager.load_settings().model_dump()
    payload["encryption_enabled"] = False
    response = client.put("/api/settings", json=payload)

    assert response.status_code == 200
    assert response.json()["encryption_enabled"] is False
    assert secrets.calls == ["decrypt"]


def test_get_settings_includes_script_sandbox_and_timeout_defaults():
    settings_manager = _MockSettingsManager(SystemSettings())
    client = _build_client(settings_manager)

    response = client.get("/api/settings")

    assert response.status_code == 200
    payload = response.json()
    assert payload["script_sandbox_enabled"] is False
    assert payload["script_timeout_seconds"] == 10


def test_update_settings_persists_script_sandbox_and_timeout():
    settings_manager = _MockSettingsManager(SystemSettings())
    client = _build_client(settings_manager)

    payload = settings_manager.load_settings().model_dump()
    payload["script_sandbox_enabled"] = True
    payload["script_timeout_seconds"] = 25
    response = client.put("/api/settings", json=payload)

    assert response.status_code == 200
    updated = response.json()
    assert updated["script_sandbox_enabled"] is True
    assert updated["script_timeout_seconds"] == 25
    assert settings_manager.saved[-1].script_sandbox_enabled is True
    assert settings_manager.saved[-1].script_timeout_seconds == 25


def test_update_settings_persists_enhanced_scraping_flag():
    settings_manager = _MockSettingsManager(SystemSettings())
    client = _build_client(settings_manager)

    payload = settings_manager.load_settings().model_dump()
    payload["enhanced_scraping"] = True
    response = client.put("/api/settings", json=payload)

    assert response.status_code == 200
    updated = response.json()
    assert updated["enhanced_scraping"] is True
    assert settings_manager.saved[-1].enhanced_scraping is True
