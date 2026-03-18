from __future__ import annotations

import logging
from pathlib import Path

from core.encryption import (
    get_keyring_unavailable_reason,
    generate_master_key,
    get_keychain_master_key,
    is_keyring_backend_available,
    set_keychain_master_key,
)

logger = logging.getLogger(__name__)


class MasterKeyUnavailableError(RuntimeError):
    """Raised when encryption master key cannot be resolved from system keyring."""


class MasterKeyProvider:
    """Keyring-backed master-key provider with process-level cache."""

    def __init__(self, *, account: str):
        self._account = account
        self._cached_master_key: str | None = None

    @classmethod
    def from_settings_file(cls, settings_file: str | Path) -> "MasterKeyProvider":
        return cls(account=str(Path(settings_file).resolve()))

    def is_encryption_available(self) -> bool:
        if self._cached_master_key:
            return True
        return is_keyring_backend_available()

    def get_or_create_master_key(self) -> str:
        if self._cached_master_key:
            return self._cached_master_key
        if not is_keyring_backend_available():
            unavailable_reason = get_keyring_unavailable_reason()
            reason_text = (
                unavailable_reason
                if unavailable_reason
                else "System keyring backend is unavailable."
            )
            raise MasterKeyUnavailableError(
                f"{reason_text} Local encryption requires a supported keyring service."
            )

        existing_key = get_keychain_master_key(account=self._account)
        if existing_key:
            self._cached_master_key = existing_key
            return existing_key

        new_key = generate_master_key()
        if not set_keychain_master_key(new_key, account=self._account):
            raise MasterKeyUnavailableError(
                "Failed to persist encryption master key to system keyring."
            )
        self._cached_master_key = new_key
        logger.info("Generated and stored encryption master key in system keyring.")
        return new_key
