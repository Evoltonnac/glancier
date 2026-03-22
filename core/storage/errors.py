from __future__ import annotations

import sqlite3
from typing import Literal

from core.error_formatter import build_error_envelope

StorageErrorKind = Literal["read", "write", "schema"]

_STORAGE_ERROR_SUMMARY_BY_CODE = {
    "storage.read_failed": "Storage read failed",
    "storage.write_failed": "Storage write failed",
    "storage.integrity_violation": "Storage integrity violation",
    "storage.schema_mismatch": "Storage schema mismatch",
}

_STORAGE_HTTP_STATUS_BY_CODE = {
    "storage.read_failed": 500,
    "storage.write_failed": 500,
    "storage.integrity_violation": 500,
    "storage.schema_mismatch": 503,
}


class StorageContractError(RuntimeError):
    def __init__(self, message: str, *, error_code: str):
        super().__init__(message)
        self.error_code = error_code
        self.code = error_code
        self.summary = message
        self.details = message


class StorageReadError(StorageContractError):
    def __init__(self, message: str):
        super().__init__(message, error_code="storage.read_failed")


class StorageWriteError(StorageContractError):
    def __init__(self, message: str):
        super().__init__(message, error_code="storage.write_failed")


class StorageIntegrityViolationError(StorageContractError):
    def __init__(self, message: str):
        super().__init__(message, error_code="storage.integrity_violation")


class StorageSchemaMismatchError(StorageContractError):
    def __init__(self, message: str):
        super().__init__(message, error_code="storage.schema_mismatch")


def map_sqlite_error(
    error: sqlite3.Error,
    *,
    kind: StorageErrorKind,
    operation: str,
) -> StorageContractError:
    message = f"{operation} failed: {error}"
    if isinstance(error, sqlite3.IntegrityError):
        return StorageIntegrityViolationError(message)
    if kind == "read":
        return StorageReadError(message)
    if kind == "schema":
        return StorageSchemaMismatchError(message)
    return StorageWriteError(message)


def storage_error_to_api_response(error: StorageContractError) -> tuple[int, dict[str, object]]:
    code = error.error_code
    summary = _STORAGE_ERROR_SUMMARY_BY_CODE.get(code, "Storage operation failed")
    details = str(error).strip() or summary
    envelope = build_error_envelope(
        code=code,
        summary=summary,
        details=details,
    )
    status_code = _STORAGE_HTTP_STATUS_BY_CODE.get(code, 500)
    return status_code, {
        "detail": summary,
        "error_code": code,
        "error": envelope,
    }
