"""
加密模块：AES-GCM 对称加密，用于保护 secrets.json 中的敏感数据。

设计：
- 每个加密值使用 `ENC:` 前缀标识，兼容明文值（自适应读取）
- 使用 AES-256-GCM 算法（authenticated encryption）
- 主密钥优先存储在系统 Keychain（keyring），本地 settings.json 仅作兼容回退
- 多端同步时，主密钥通过用户手动"导出同步通行码"共享
"""

import base64
import os
import logging
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

ENC_PREFIX = "ENC:"
MASTER_KEY_BYTES = 32
KEYCHAIN_SERVICE = os.getenv("GLANCIER_KEYCHAIN_SERVICE", "com.glancier.app")
KEYCHAIN_ACCOUNT = os.getenv("GLANCIER_KEYCHAIN_ACCOUNT", "master-key")

try:
    import keyring
except Exception:  # pragma: no cover - import failure depends on runtime env
    keyring = None


def generate_master_key() -> str:
    """生成一个随机 256-bit 主密钥，返回 base64 编码字符串。"""
    raw_key = os.urandom(MASTER_KEY_BYTES)  # 256 bits
    return base64.b64encode(raw_key).decode("utf-8")


def _load_raw_key(master_key_b64: str) -> bytes:
    """将 base64 编码的主密钥还原为 bytes，并做长度校验。"""
    try:
        raw_key = base64.b64decode(master_key_b64, validate=True)
    except Exception as e:
        raise ValueError("主密钥格式非法，必须是 base64 编码。") from e
    if len(raw_key) != MASTER_KEY_BYTES:
        raise ValueError("主密钥长度非法，必须是 256-bit。")
    return raw_key


def get_keychain_master_key(
    service: str = KEYCHAIN_SERVICE,
    account: str = KEYCHAIN_ACCOUNT,
) -> str | None:
    """从系统 keychain 读取主密钥。读取失败或不可用时返回 None。"""
    if keyring is None:
        return None
    try:
        value = keyring.get_password(service, account)
    except Exception as e:
        logger.warning(f"读取 keychain 主密钥失败: {e}")
        return None
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    try:
        _load_raw_key(value)
    except Exception:
        logger.warning("Keychain 中主密钥格式非法，已忽略。")
        return None
    return value


def set_keychain_master_key(
    master_key_b64: str,
    service: str = KEYCHAIN_SERVICE,
    account: str = KEYCHAIN_ACCOUNT,
) -> bool:
    """写入主密钥到系统 keychain。成功返回 True，失败返回 False。"""
    if keyring is None:
        return False
    try:
        normalized_key = master_key_b64.strip()
        _load_raw_key(normalized_key)
        keyring.set_password(service, account, normalized_key)
        return True
    except Exception as e:
        logger.warning(f"写入 keychain 主密钥失败: {e}")
        return False


def encrypt_value(plaintext: str, master_key_b64: str) -> str:
    """
    使用 AES-256-GCM 加密字符串，返回带 ENC: 前缀的密文字符串。
    格式：ENC:<base64(nonce + ciphertext)>
    """
    key = _load_raw_key(master_key_b64)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    payload = base64.b64encode(nonce + ciphertext).decode("utf-8")
    return ENC_PREFIX + payload


def decrypt_value(ciphertext_str: str, master_key_b64: str) -> str:
    """
    解密带 ENC: 前缀的密文字符串，返回明文。
    如果不是加密值则直接返回原始字符串（容错）。
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
        logger.error(f"解密失败: {e}")
        raise ValueError(f"无法解密密钥，请检查是否使用了正确的主密钥。") from e


def is_encrypted(value: Any) -> bool:
    """判断一个值是否为加密格式。"""
    return isinstance(value, str) and value.startswith(ENC_PREFIX)


def encrypt_dict(data: dict, master_key_b64: str) -> dict:
    """对字典中所有字符串值进行加密（跳过已加密的值）。"""
    result = {}
    for k, v in data.items():
        if isinstance(v, str) and not is_encrypted(v):
            result[k] = encrypt_value(v, master_key_b64)
        else:
            result[k] = v
    return result


def decrypt_dict(data: dict, master_key_b64: str) -> dict:
    """对字典中所有加密字符串值进行解密（跳过明文值）。"""
    result = {}
    for k, v in data.items():
        if is_encrypted(v):
            result[k] = decrypt_value(v, master_key_b64)
        else:
            result[k] = v
    return result


def strip_encryption(data: dict, master_key_b64: str) -> dict:
    """将字典中所有加密值还原为明文（用于关闭加密时的全量迁移）。"""
    return decrypt_dict(data, master_key_b64)


def apply_encryption(data: dict, master_key_b64: str) -> dict:
    """将字典中所有明文字符串值加密（用于开启加密时的全量迁移）。"""
    return encrypt_dict(data, master_key_b64)
