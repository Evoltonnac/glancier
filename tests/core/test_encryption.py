from __future__ import annotations

import pytest

from core.encryption import (
    ENC_PREFIX,
    decrypt_dict,
    decrypt_value,
    encrypt_dict,
    encrypt_value,
    get_keyring_unavailable_reason,
    generate_master_key,
    get_keychain_master_key,
    is_keyring_backend_available,
    is_encrypted,
    set_keychain_master_key,
)


def test_encrypt_decrypt_roundtrip():
    key = generate_master_key()

    encrypted = encrypt_value("super-secret", key)
    decrypted = decrypt_value(encrypted, key)

    assert encrypted.startswith(ENC_PREFIX)
    assert decrypted == "super-secret"


def test_decrypt_value_keeps_plaintext_unchanged():
    key = generate_master_key()
    assert decrypt_value("plain-text", key) == "plain-text"


def test_encrypt_and_decrypt_dict_only_touch_string_fields():
    key = generate_master_key()
    original = {
        "token": "abc123",
        "count": 7,
        "flag": True,
        "nested": {"k": "v"},
    }

    encrypted = encrypt_dict(original, key)
    assert is_encrypted(encrypted["token"])
    assert encrypted["count"] == 7
    assert encrypted["flag"] is True
    assert encrypted["nested"] == {"k": "v"}

    decrypted = decrypt_dict(encrypted, key)
    assert decrypted == original


def test_decrypt_with_wrong_key_raises_value_error():
    key = generate_master_key()
    wrong_key = generate_master_key()
    encrypted = encrypt_value("do-not-leak", key)

    with pytest.raises(ValueError):
        decrypt_value(encrypted, wrong_key)


def test_keychain_helpers_fallback_when_keyring_unavailable(monkeypatch):
    import core.encryption as encryption_module

    monkeypatch.setattr(encryption_module, "keyring", None)
    key = generate_master_key()

    assert set_keychain_master_key(key, service="test-service", account="test-account") is False
    assert get_keychain_master_key(service="test-service", account="test-account") is None


def test_get_keychain_master_key_strips_surrounding_whitespace(monkeypatch):
    import core.encryption as encryption_module

    key = generate_master_key()

    class _FakeKeyring:
        @staticmethod
        def get_password(service: str, account: str) -> str:
            assert service == "test-service"
            assert account == "test-account"
            return f"  {key}\n"

    monkeypatch.setattr(encryption_module, "keyring", _FakeKeyring())

    assert (
        get_keychain_master_key(service="test-service", account="test-account")
        == key
    )


def test_set_keychain_master_key_strips_whitespace_before_store(monkeypatch):
    import core.encryption as encryption_module

    key = generate_master_key()
    calls: list[tuple[str, str, str]] = []

    class _FakeKeyring:
        @staticmethod
        def set_password(service: str, account: str, value: str) -> None:
            calls.append((service, account, value))

    monkeypatch.setattr(encryption_module, "keyring", _FakeKeyring())

    assert (
        set_keychain_master_key(
            f"  {key}\n",
            service="test-service",
            account="test-account",
        )
        is True
    )
    assert calls == [("test-service", "test-account", key)]


def test_is_keyring_backend_available_false_when_keyring_missing(monkeypatch):
    import core.encryption as encryption_module

    monkeypatch.setattr(encryption_module, "keyring", None)

    assert is_keyring_backend_available() is False
    assert (
        get_keyring_unavailable_reason()
        == "Python package 'keyring' is not installed in the runtime environment."
    )


def test_is_keyring_backend_available_false_for_fail_backend(monkeypatch):
    import core.encryption as encryption_module

    class _FailBackend:
        priority = 0

    class _FakeKeyring:
        @staticmethod
        def get_keyring():
            return _FailBackend()

    monkeypatch.setattr(encryption_module, "keyring", _FakeKeyring())

    assert is_keyring_backend_available() is False
    assert "No supported keyring backend is active" in get_keyring_unavailable_reason()
