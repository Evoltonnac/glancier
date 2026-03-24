from __future__ import annotations

import pytest

from core.sql.contracts import SqlContractValidationError, classify_sql_contract


@pytest.mark.parametrize(
    ("query", "expected_statement_types"),
    [
        ("SELECT 1", ("select",)),
        ("WITH cte AS (SELECT 1 AS value) SELECT value FROM cte", ("select",)),
    ],
)
def test_select_and_cte_queries_are_non_risk(
    query: str,
    expected_statement_types: tuple[str, ...],
) -> None:
    classification = classify_sql_contract(query)

    assert classification.is_high_risk is False
    assert classification.requires_trust is False
    assert classification.statement_count == 1
    assert classification.statement_types == expected_statement_types
    assert classification.risk_reasons == ()


@pytest.mark.parametrize(
    ("query", "expected_reason"),
    [
        ("INSERT INTO metrics VALUES (1)", "non_select_statement"),
        ("CREATE TABLE metrics (id INT)", "non_select_statement"),
        ("SELECT 1; DELETE FROM metrics", "multiple_statements"),
    ],
)
def test_mutation_ddl_and_multi_statement_queries_are_high_risk(
    query: str,
    expected_reason: str,
) -> None:
    classification = classify_sql_contract(query)

    assert classification.is_high_risk is True
    assert classification.requires_trust is True
    assert expected_reason in classification.risk_reasons


@pytest.mark.parametrize("query", ["", "   ", "SELECT FROM"])
def test_empty_or_invalid_sql_raises_deterministic_contract_error(query: str) -> None:
    with pytest.raises(SqlContractValidationError) as exc_info:
        classify_sql_contract(query)

    assert exc_info.value.code == "runtime.sql_invalid_contract"
