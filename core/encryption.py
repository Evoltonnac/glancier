"""
Encryption module: AES-GCM symmetric encryption for sensitive secrets.json data.

Design:
- Every encrypted value uses `ENC:` prefix and remains backward-compatible with plaintext.
- Uses AES-256-GCM (authenticated encryption).
- Master key is stored in the system keyring only.
"""

import base64
import os
import logging
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

ENC_PREFIX = "ENC:"
MASTER_KEY_BYTES = 32
KEYCHAIN_SERVICE = os.getenv("GLANCEUS_KEYCHAIN_SERVICE", "com.glanceus.app")
KEYCHAIN_ACCOUNT = os.getenv("GLANCEUS_KEYCHAIN_ACCOUNT", "master-key")

try:
    import keyring
except Exception:  # pragma: no cover - import failure depends on runtime env
    keyring = None


def get_keyring_unavailable_reason() -> str | None:
    """Return detailed reason when keyring backend is unavailable."""
    if keyring is None:
        return "Python package 'keyring' is not installed in the runtime environment."
    try:
        backend = keyring.get_keyring()
    except Exception as e:
        logger.warning("failed to resolve keyring backend: %s", e)
        return f"Failed to resolve keyring backend: {e}"

    # keyring.backends.fail.Keyring reports priority 0 and cannot store secrets.
    priority = getattr(backend, "priority", 0)
    if isinstance(priority, (int, float)) and priority <= 0:
        backend_name = backend.__class__.__module__ + "." + backend.__class__.__name__
        return f"No supported keyring backend is active (resolved backend: {backend_name})."
    return None


def is_keyring_backend_available() -> bool:
    """Return whether a usable keyring backend is available at runtime."""
    return get_keyring_unavailable_reason() is None


def generate_master_key() -> str:
    """Generate a random 256-bit master key (base64-encoded)."""
    raw_key = os.urandom(MASTER_KEY_BYTES)  # 256 bits
    return base64.b64encode(raw_key).decode("utf-8")


def _load_raw_key(master_key_b64: str) -> bytes:
    """Decode base64 master key to bytes and validate key length."""
    try:
        raw_key = base64.b64decode(master_key_b64, validate=True)
    except Exception as e:
        raise ValueError("Invalid master key format: must be base64.") from e
    if len(raw_key) != MASTER_KEY_BYTES:
        raise ValueError("Invalid master key length: must be 256-bit.")
    return raw_key


def get_keychain_master_key(
    service: str = KEYCHAIN_SERVICE,
    account: str = KEYCHAIN_ACCOUNT,
) -> str | None:
    """Read master key from system keychain; return None if unavailable."""
    if keyring is None:
        return None
    try:
        value = keyring.get_password(service, account)
    except Exception as e:
        logger.warning("failed to read keychain master key: %s", e)
        return None
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        _load_raw_key(value)
    except Exception:
        logger.warning("invalid key format in keychain; ignored")
        return None
    return value


def set_keychain_master_key(
    master_key_b64: str,
    service: str = KEYCHAIN_SERVICE,
    account: str = KEYCHAIN_ACCOUNT,
) -> bool:
    """Persist master key to system keychain. Returns True on success."""
    if keyring is None:
        return False
    try:
        normalized_key = master_key_b64.strip()
        _load_raw_key(normalized_key)
        keyring.set_password(service, account, normalized_key)
        return True
    except Exception as e:
        logger.warning("failed to write keychain master key: %s", e)
        return False


def encrypt_value(plaintext: str, master_key_b64: str) -> str:
    """
    Encrypt plaintext with AES-256-GCM and return ENC-prefixed ciphertext.
    Format: ENC:<base64(nonce + ciphertext)>
    """
    key = _load_raw_key(master_key_b64)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    payload = base64.b64encode(nonce + ciphertext).decode("utf-8")
    return ENC_PREFIX + payload


def decrypt_value(ciphertext_str: str, master_key_b64: str) -> str:
    """
    Decrypt ENC-prefixed ciphertext and return plaintext.
    If input is not encrypted, return the original string.
    """
    if not ciphertext_str.startswith(ENC_PREFIX):
        return ciphertext_str
    try:
        key = _load_raw_key(master_key_b64)
        aesgcm = AESGCM(key)
        payload = base64.b64decode(ciphertext_str[len(ENC_PREFIX):])
        nonce = payload[:12]
        ct = payload[12:]
        plaintext = aesgcm.decrypt(nonce, ct, None)
        return plaintext.decode("utf-8")
    except Exception as e:
        logger.error("decryption failed: %s", e)
        raise ValueError("Unable to decrypt value. Check whether the master key is correct.") from e


def is_encrypted(value: Any) -> bool:
    """Return whether a value uses ENC-prefixed encrypted format."""
    return isinstance(value, str) and value.startswith(ENC_PREFIX)


def encrypt_dict(data: dict, master_key_b64: str) -> dict:
    """Encrypt all plaintext string values in dict (skip already encrypted)."""
    result = {}
    for k, v in data.items():
        if isinstance(v, str) and not is_encrypted(v):
            result[k] = encrypt_value(v, master_key_b64)
        else:
            result[k] = v
    return result


def decrypt_dict(data: dict, master_key_b64: str) -> dict:
    """Decrypt all encrypted string values in dict (skip plaintext)."""
    result = {}
    for k, v in data.items():
        if is_encrypted(v):
            result[k] = decrypt_value(v, master_key_b64)
        else:
            result[k] = v
    return result


def strip_encryption(data: dict, master_key_b64: str) -> dict:
    """Restore encrypted dict values to plaintext (used when disabling encryption)."""
    return decrypt_dict(data, master_key_b64)


def apply_encryption(data: dict, master_key_b64: str) -> dict:
    """Encrypt plaintext dict values (used for full migration when enabling encryption)."""
    return encrypt_dict(data, master_key_b64)
