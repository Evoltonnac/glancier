from __future__ import annotations

from decimal import Decimal

from core.sql.normalization import build_normalized_sql_response, build_sql_fields


def test_build_sql_fields_preserves_column_projection_order() -> None:
    columns = ["label", "count", "price"]
    rows = [{"label": "alpha", "count": 3, "price": Decimal("9.90")}]

    fields = build_sql_fields(columns, rows)

    assert [field["name"] for field in fields] == columns
    assert fields == [
        {"name": "label", "type": "string"},
        {"name": "count", "type": "integer"},
        {"name": "price", "type": "decimal"},
    ]


def test_build_normalized_sql_response_contains_canonical_keys_and_aliases() -> None:
    columns = ["label", "count", "price"]
    rows = [{"label": "alpha", "count": 3, "price": Decimal("9.90")}]
    fields = build_sql_fields(columns, rows)

    sql_response = build_normalized_sql_response(
        rows=rows,
        fields=fields,
        row_count=1,
        duration_ms=42,
        truncated=False,
        statement_count=1,
        statement_types=["select"],
        is_high_risk=False,
        risk_reasons=[],
        timeout_seconds=30.0,
        max_rows=500,
    )

    assert sql_response["fields"] == fields
    assert "duration_ms" in sql_response
    assert "truncated" in sql_response
    assert sql_response["columns"] == columns
    assert sql_response["execution_ms"] == sql_response["duration_ms"]
