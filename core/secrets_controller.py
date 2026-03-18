"""
Secrets controller for securely storing API keys, OAuth tokens, and other sensitive data.
All secrets are stored in secrets.json with secret_id as top-level key.
Supports AES-256-GCM encryption using master key from MasterKeyProvider.
"""

import os
import json
import logging
from pathlib import Path
from typing import Any

from core.master_key_provider import MasterKeyProvider, MasterKeyUnavailableError

logger = logging.getLogger(__name__)

_SECRETS_DIR = Path(os.getenv("GLANCEUS_DATA_DIR", ".")) / "data"
_SECRETS_FILE = "secrets.json"


class SecretsController:
    """
    File-based secure storage.
    All secrets live in secrets.json keyed by secret_id.
    Encryption toggle is read from SettingsManager.
    Master key is resolved from MasterKeyProvider.
    """

    def __init__(
        self,
        secrets_dir: str | Path | None = None,
        settings_manager=None,
        master_key_provider: MasterKeyProvider | None = None,
    ):
        if secrets_dir is None:
            secrets_dir = _SECRETS_DIR
        self.secrets_dir = Path(secrets_dir)
        self.secrets_dir.mkdir(parents=True, exist_ok=True)
        self.secrets_file = self.secrets_dir / _SECRETS_FILE
        self._settings_manager = settings_manager
        self._master_key_provider = master_key_provider
        logger.info("Secrets storage file: %s", self.secrets_file)

    def inject_settings_manager(self, settings_manager):
        """Inject SettingsManager lazily."""
        self._settings_manager = settings_manager

    def inject_master_key_provider(self, master_key_provider: MasterKeyProvider):
        """Inject MasterKeyProvider lazily."""
        self._master_key_provider = master_key_provider

    # ── Internal helpers ───────────────────────────────

    def _encryption_enabled(self) -> bool:
        if self._settings_manager is None:
            return False
        try:
            return self._settings_manager.load_settings().encryption_enabled
        except Exception:
            return False

    def _master_key(self, *, required: bool = False) -> str | None:
        if self._master_key_provider is None:
            if required:
                raise MasterKeyUnavailableError("Master key provider is not initialized.")
            return None
        try:
            return self._master_key_provider.get_or_create_master_key()
        except Exception:
            if required:
                raise
            return None

    def _load_all(self) -> dict[str, Any]:
        """Load all raw secrets (may include ENC-prefixed ciphertext)."""
        if not self.secrets_file.exists():
            return {}
        try:
            with open(self.secrets_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.error("failed to read secrets file: %s", e)
            return {}

    def _save_all(self, data: dict[str, Any]):
        """Persist all secrets."""
        try:
            with open(self.secrets_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except IOError as e:
            logger.error("failed to save secrets file: %s", e)

    # ── Public API ──────────────────────────────────────

    def get_secrets(self, secret_id: str) -> dict[str, Any]:
        """
        Get all secrets for secret_id (auto-decrypt when needed).
        Returns empty dict if missing.
        """
        from core.encryption import decrypt_dict, is_encrypted
        all_secrets = self._load_all()
        raw = all_secrets.get(secret_id, {})
        if not raw:
            return raw
        # Try decrypting when encrypted values are present.
        if any(is_encrypted(v) for v in raw.values()):
            master_key = self._master_key(required=True)
            try:
                return decrypt_dict(raw, master_key)
            except Exception as e:
                logger.error("failed to decrypt secrets[%s]: %s", secret_id, e)
                raise
        return raw

    def get_secret(self, secret_id: str, key: str) -> Any:
        """Get one secret value under secret_id (auto-decrypt when needed)."""
        secrets = self.get_secrets(secret_id)
        return secrets.get(key)

    def set_secrets(self, secret_id: str, data: dict[str, Any]):
        """
        Set secrets for secret_id (merged with existing values).
        Encrypt new values automatically when encryption is enabled.
        """
        from core.encryption import encrypt_dict
        all_secrets = self._load_all()

        if self._encryption_enabled():
            master_key = self._master_key(required=True)
            data = encrypt_dict(data, master_key)

        if secret_id in all_secrets:
            all_secrets[secret_id].update(data)
        else:
            all_secrets[secret_id] = data

        self._save_all(all_secrets)
        logger.debug("Secrets saved: %s", secret_id)

    def set_secret(self, secret_id: str, key: str, value: Any):
        """Set one secret value."""
        self.set_secrets(secret_id, {key: value})

    def delete_secrets(self, secret_id: str):
        """Delete all secrets under secret_id."""
        all_secrets = self._load_all()
        if secret_id in all_secrets:
            del all_secrets[secret_id]
            self._save_all(all_secrets)
            logger.debug("Secrets deleted: %s", secret_id)

    def delete_secret(self, secret_id: str, key: str):
        """Delete one secret value under secret_id."""
        all_secrets = self._load_all()
        if secret_id in all_secrets and key in all_secrets[secret_id]:
            del all_secrets[secret_id][key]
            self._save_all(all_secrets)
            logger.debug("Secret '%s' deleted: %s", key, secret_id)

    # ── Full encryption migration (on encryption-toggle change) ──

    def migrate_encrypt_all(self):
        """Encrypt all existing plaintext secrets (called when enabling encryption)."""
        from core.encryption import apply_encryption
        master_key = self._master_key(required=True)
        all_secrets = self._load_all()
        migrated = {k: apply_encryption(v, master_key) for k, v in all_secrets.items()}
        self._save_all(migrated)
        logger.info("full encryption migration completed")

    def migrate_decrypt_all(self):
        """Decrypt all existing ciphertext secrets (called when disabling encryption)."""
        from core.encryption import strip_encryption
        master_key = self._master_key(required=True)
        all_secrets = self._load_all()
        migrated = {k: strip_encryption(v, master_key) for k, v in all_secrets.items()}
        self._save_all(migrated)
        logger.info("full decryption migration completed")
