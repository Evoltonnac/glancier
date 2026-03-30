from __future__ import annotations

from dataclasses import dataclass
from typing import Final

import sqlglot
from sqlglot import errors as sql_errors
from sqlglot import expressions as exp

_NON_SELECT_STATEMENT_REASON: Final[str] = "non_select_statement"
_MULTIPLE_STATEMENTS_REASON: Final[str] = "multiple_statements"
_INVALID_CONTRACT_CODE: Final[str] = "runtime.sql_invalid_contract"

_HIGH_RISK_NODE_TYPES: Final[tuple[type[exp.Expression], ...]] = tuple(
    node_type
    for node_type in (
        getattr(exp, "Insert", None),
        getattr(exp, "Update", None),
        getattr(exp, "Delete", None),
        getattr(exp, "Merge", None),
        getattr(exp, "Create", None),
        getattr(exp, "Alter", None),
        getattr(exp, "Drop", None),
        getattr(exp, "TruncateTable", None),
        getattr(exp, "Truncate", None),
    )
    if isinstance(node_type, type)
)


@dataclass(frozen=True, slots=True)
class SqlContractClassification:
    statement_count: int
    statement_types: tuple[str, ...]
    is_high_risk: bool
    requires_trust: bool
    risk_reasons: tuple[str, ...]


class SqlContractValidationError(ValueError):
    def __init__(self, summary: str, details: str):
        super().__init__(summary)
        self.code = _INVALID_CONTRACT_CODE
        self.summary = summary
        self.details = details


def _parse_sql_statements(query_text: str, *, dialect: str | None) -> list[exp.Expression]:
    normalized_query = str(query_text).strip()
    if not normalized_query:
        raise SqlContractValidationError(
            "SQL query text is required.",
            "Provide a non-empty SQL query string in step args.query.",
        )

    try:
        parsed_statements = sqlglot.parse(normalized_query, read=dialect)
    except sql_errors.ParseError as error:
        details = str(error).splitlines()[0].strip()
        raise SqlContractValidationError(
            "SQL query text failed static validation.",
            details or "SQL parser rejected query text.",
        ) from error

    statements = [statement for statement in parsed_statements if isinstance(statement, exp.Expression)]
    if not statements:
        raise SqlContractValidationError(
            "SQL query text failed static validation.",
            "SQL parser did not return any executable statement.",
        )

    return statements


def _statement_type(statement: exp.Expression) -> str:
    return str(statement.key or statement.__class__.__name__).lower()


def _is_statement_high_risk(statement: exp.Expression) -> bool:
    if not isinstance(statement, exp.Query):
        return True
    return any(isinstance(node, _HIGH_RISK_NODE_TYPES) for node in statement.walk())


def classify_sql_contract(query_text: str, *, dialect: str | None = None) -> SqlContractClassification:
    statements = _parse_sql_statements(query_text, dialect=dialect)
    statement_types = tuple(_statement_type(statement) for statement in statements)

    risk_reasons: list[str] = []
    if len(statements) > 1:
        risk_reasons.append(_MULTIPLE_STATEMENTS_REASON)

    if any(_is_statement_high_risk(statement) for statement in statements):
        risk_reasons.append(_NON_SELECT_STATEMENT_REASON)

    unique_reasons = tuple(dict.fromkeys(risk_reasons))
    is_high_risk = bool(unique_reasons)
    return SqlContractClassification(
        statement_count=len(statements),
        statement_types=statement_types,
        is_high_risk=is_high_risk,
        requires_trust=is_high_risk,
        risk_reasons=unique_reasons,
    )
