from __future__ import annotations

import pytest

from core.master_key_provider import MasterKeyProvider, MasterKeyUnavailableError


def test_get_or_create_master_key_reads_existing_keyring_value(monkeypatch):
    provider = MasterKeyProvider(account="test-account")
    reads = 0
    existing_key = "existing-key"

    monkeypatch.setattr("core.master_key_provider.is_keyring_backend_available", lambda: True)

    def fake_get_key(*_args, **_kwargs):
        nonlocal reads
        reads += 1
        return existing_key

    monkeypatch.setattr("core.master_key_provider.get_keychain_master_key", fake_get_key)

    assert provider.get_or_create_master_key() == existing_key
    assert provider.get_or_create_master_key() == existing_key
    assert reads == 1


def test_get_or_create_master_key_generates_when_keyring_is_empty(monkeypatch):
    provider = MasterKeyProvider(account="test-account")

    monkeypatch.setattr("core.master_key_provider.is_keyring_backend_available", lambda: True)
    monkeypatch.setattr("core.master_key_provider.get_keychain_master_key", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("core.master_key_provider.generate_master_key", lambda: "generated-key")
    writes: list[str] = []

    def fake_set_key(key: str, *_args, **_kwargs) -> bool:
        writes.append(key)
        return True

    monkeypatch.setattr("core.master_key_provider.set_keychain_master_key", fake_set_key)

    assert provider.get_or_create_master_key() == "generated-key"
    assert writes == ["generated-key"]


def test_get_or_create_master_key_raises_when_backend_unavailable(monkeypatch):
    provider = MasterKeyProvider(account="test-account")
    monkeypatch.setattr("core.master_key_provider.is_keyring_backend_available", lambda: False)

    with pytest.raises(MasterKeyUnavailableError):
        provider.get_or_create_master_key()


def test_is_encryption_available_uses_runtime_cache(monkeypatch):
    provider = MasterKeyProvider(account="test-account")
    monkeypatch.setattr("core.master_key_provider.is_keyring_backend_available", lambda: True)
    monkeypatch.setattr(
        "core.master_key_provider.get_keychain_master_key",
        lambda *_args, **_kwargs: "cached-key",
    )
    provider.get_or_create_master_key()

    monkeypatch.setattr("core.master_key_provider.is_keyring_backend_available", lambda: False)

    assert provider.is_encryption_available() is True
