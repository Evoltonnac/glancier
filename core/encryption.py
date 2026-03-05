"""
加密模块：AES-GCM 对称加密，用于保护 secrets.json 中的敏感数据。

设计：
- 每个加密值使用 `ENC:` 前缀标识，兼容明文值（自适应读取）
- 使用 AES-256-GCM 算法（authenticated encryption）
- 主密钥（Master Key）存储在本地 settings.json 中（不纳入多端同步）
- 多端同步时，主密钥通过用户手动"导出同步通行码"共享
"""

import base64
import os
import logging
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

ENC_PREFIX = "ENC:"


def generate_master_key() -> str:
    """生成一个随机 256-bit 主密钥，返回 base64 编码字符串。"""
    raw_key = os.urandom(32)  # 256 bits
    return base64.b64encode(raw_key).decode("utf-8")


def _load_raw_key(master_key_b64: str) -> bytes:
    """将 base64 编码的主密钥还原为 bytes。"""
    return base64.b64decode(master_key_b64)


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
