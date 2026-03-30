from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from core.sql.normalization import serialize_sql_value


def test_serialize_sql_value_decimal_preserves_precision_as_string() -> None:
    assert serialize_sql_value(Decimal("12.3400")) == "12.3400"


def test_serialize_sql_value_aware_datetime_normalizes_to_utc_iso8601() -> None:
    aware = datetime(2026, 1, 2, 12, 30, 45, tzinfo=timezone(timedelta(hours=8)))
    assert serialize_sql_value(aware) == "2026-01-02T04:30:45+00:00"


def test_serialize_sql_value_none_remains_none() -> None:
    assert serialize_sql_value(None) is None


def test_serialize_sql_value_bytes_encodes_to_base64_ascii() -> None:
    assert serialize_sql_value(bytes(b"\x00\xff")) == "AP8="
