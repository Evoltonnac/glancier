from __future__ import annotations

import pytest

from core.storage.errors import (
    StorageIntegrityViolationError,
    StorageReadError,
    StorageSchemaMismatchError,
    StorageWriteError,
    storage_error_to_api_response,
)


@pytest.mark.parametrize(
    ("error", "status_code", "error_code", "summary"),
    [
        (StorageReadError("read failed"), 500, "storage.read_failed", "Storage read failed"),
        (StorageWriteError("write failed"), 500, "storage.write_failed", "Storage write failed"),
        (
            StorageIntegrityViolationError("integrity failed"),
            500,
            "storage.integrity_violation",
            "Storage integrity violation",
        ),
        (
            StorageSchemaMismatchError("schema failed"),
            503,
            "storage.schema_mismatch",
            "Storage schema mismatch",
        ),
    ],
)
def test_storage_error_to_api_response_maps_status_codes_and_error_envelope(
    error,
    status_code: int,
    error_code: str,
    summary: str,
):
    mapped_status, payload = storage_error_to_api_response(error)

    assert mapped_status == status_code
    assert payload["error_code"] == error_code
    assert payload["error"]["code"] == error_code
    assert payload["error"]["summary"] == summary
    assert payload["error"]["details"]

