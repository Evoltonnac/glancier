"""
Secrets 控制器：负责安全存储 API Key、OAuth Token 等敏感信息。
统一存储到 secrets.json 文件中，每个 secret_id 作为顶层 key。
支持加密存储（AES-256-GCM），通过 SettingsManager 获取主密钥。
"""

import os
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_SECRETS_DIR = Path(os.getenv("GLANCIER_DATA_DIR", ".")) / "data"
_SECRETS_FILE = "secrets.json"


class SecretsController:
    """
    基于文件的安全存储。
    所有 secrets 统一存储到 secrets.json 文件中，每个 secret_id 作为顶层 key。
    当 settings_manager 注入后，根据加密开关自动加解密。
    """

    def __init__(self, secrets_dir: str | Path | None = None, settings_manager=None):
        if secrets_dir is None:
            secrets_dir = _SECRETS_DIR
        self.secrets_dir = Path(secrets_dir)
        self.secrets_dir.mkdir(parents=True, exist_ok=True)
        self.secrets_file = self.secrets_dir / _SECRETS_FILE
        self._settings_manager = settings_manager
        logger.info(f"Secrets 存储文件: {self.secrets_file}")

    def inject_settings_manager(self, settings_manager):
        """延迟注入 SettingsManager（支持循环依赖的场景）。"""
        self._settings_manager = settings_manager

    # ── 内部辅助 ─────────────────────────────────────────

    def _encryption_enabled(self) -> bool:
        if self._settings_manager is None:
            return False
        try:
            return self._settings_manager.load_settings().encryption_enabled
        except Exception:
            return False

    def _master_key(self) -> str | None:
        if self._settings_manager is None:
            return None
        try:
            return self._settings_manager.get_or_create_master_key()
        except Exception:
            return None

    def _load_all(self) -> dict[str, Any]:
        """加载所有 secrets（原始存储，可能包含 ENC: 前缀的密文）。"""
        if not self.secrets_file.exists():
            return {}
        try:
            with open(self.secrets_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"读取 secrets 文件失败: {e}")
            return {}

    def _save_all(self, data: dict[str, Any]):
        """保存所有 secrets。"""
        try:
            with open(self.secrets_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except IOError as e:
            logger.error(f"保存 secrets 文件失败: {e}")

    # ── 公共 API ─────────────────────────────────────────

    def get_secrets(self, secret_id: str) -> dict[str, Any]:
        """
        获取指定 secret_id 的所有 secrets（自动解密）。
        返回空字典如果不存在。
        """
        from core.encryption import decrypt_dict, is_encrypted
        all_secrets = self._load_all()
        raw = all_secrets.get(secret_id, {})
        if not raw:
            return raw
        # 如果当前加密已开启或字段中存在加密值，则尝试解密
        master_key = self._master_key()
        if master_key and any(is_encrypted(v) for v in raw.values()):
            try:
                return decrypt_dict(raw, master_key)
            except Exception as e:
                logger.error(f"解密 secrets[{secret_id}] 失败: {e}")
                raise
        return raw

    def get_secret(self, secret_id: str, key: str) -> Any:
        """获取指定 secret_id 下的单个 secret 值（自动解密）。"""
        secrets = self.get_secrets(secret_id)
        return secrets.get(key)

    def set_secrets(self, secret_id: str, data: dict[str, Any]):
        """
        设置指定 secret_id 的 secrets（合并现有值）。
        根据当前加密设置，自动对新写入值加密。
        """
        from core.encryption import encrypt_dict
        all_secrets = self._load_all()

        if self._encryption_enabled():
            master_key = self._master_key()
            if master_key:
                data = encrypt_dict(data, master_key)

        if secret_id in all_secrets:
            all_secrets[secret_id].update(data)
        else:
            all_secrets[secret_id] = data

        self._save_all(all_secrets)
        logger.debug(f"Secrets 已保存: {secret_id}")

    def set_secret(self, secret_id: str, key: str, value: Any):
        """设置单个 secret 值。"""
        self.set_secrets(secret_id, {key: value})

    def delete_secrets(self, secret_id: str):
        """删除指定 secret_id 的所有 secrets。"""
        all_secrets = self._load_all()
        if secret_id in all_secrets:
            del all_secrets[secret_id]
            self._save_all(all_secrets)
            logger.debug(f"Secrets 已删除: {secret_id}")

    def delete_secret(self, secret_id: str, key: str):
        """删除指定 secret_id 下的单个 secret。"""
        all_secrets = self._load_all()
        if secret_id in all_secrets and key in all_secrets[secret_id]:
            del all_secrets[secret_id][key]
            self._save_all(all_secrets)
            logger.debug(f"Secret '{key}' 已删除: {secret_id}")

    # ── 全量加密迁移（切换加密开关时调用） ─────────────────

    def migrate_encrypt_all(self):
        """将所有现有明文 secrets 全量加密（开启加密时调用）。"""
        from core.encryption import apply_encryption
        master_key = self._master_key()
        if not master_key:
            logger.error("迁移加密失败：主密钥未找到")
            return
        all_secrets = self._load_all()
        migrated = {k: apply_encryption(v, master_key) for k, v in all_secrets.items()}
        self._save_all(migrated)
        logger.info("全量加密迁移完成")

    def migrate_decrypt_all(self):
        """将所有现有密文 secrets 全量解密（关闭加密时调用）。"""
        from core.encryption import strip_encryption
        master_key = self._master_key()
        if not master_key:
            logger.error("迁移解密失败：主密钥未找到")
            return
        all_secrets = self._load_all()
        migrated = {k: strip_encryption(v, master_key) for k, v in all_secrets.items()}
        self._save_all(migrated)
        logger.info("全量解密迁移完成")
