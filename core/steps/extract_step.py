"""
Extract Step Module.

This module handles the extraction of specific data points from structured objects
like JSON responses or dictionaries, typically using JSONPath or direct key lookup.

Args Schema:
    source (Any): The source data to extract from (e.g., dict or list).
    type (str, optional): The extraction method. 'jsonpath' or 'key'. Defaults to 'jsonpath'.

Return Structure:
    dict: Extracted values for all mapped outputs.
"""

import logging
from jsonpath_ng import parse
from typing import Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from core.config_loader import StepConfig, SourceConfig
    from core.executor import Executor

logger = logging.getLogger(__name__)
_MISSING = object()


def _extract_jsonpath(source_data: Any, expr: str) -> Any:
    try:
        jsonpath_expr = parse(expr)
    except Exception:
        return _MISSING

    matches = jsonpath_expr.find(source_data)
    if not matches:
        return _MISSING
    return matches[0].value


def _extract_key(source_data: Any, expr: str) -> Any:
    if not isinstance(source_data, dict):
        return _MISSING

    # Case-insensitive header lookup if it seems to be headers (ratelimit)
    if "ratelimit" in str(expr).lower():
        for k, v in source_data.items():
            if k.lower() == str(expr).lower():
                return v
        return _MISSING

    if expr in source_data:
        return source_data[expr]
    return _MISSING


def _extract_value(source_data: Any, expr: str, extract_type: str) -> Any:
    if extract_type == "jsonpath":
        return _extract_jsonpath(source_data, expr)
    if extract_type == "key":
        return _extract_key(source_data, expr)
    return _MISSING


async def execute_extract_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: Dict[str, Any],
    context: Dict[str, Any],
    outputs: Dict[str, Any],
    executor: "Executor",
) -> Dict[str, Any]:
    """
    Executes an extract step.
    
    Returns:
        Dict[str, Any]: output dictionary with the extracted value.
    """
    source_data = args.get("source")
    extract_type = args.get("type", "jsonpath")

    if not step.outputs:
        return {}

    extracted: Dict[str, Any] = {}
    for target_var, source_path in step.outputs.items():
        if not isinstance(source_path, str):
            logger.warning(
                "[%s] extract output '%s' has non-string source path '%s'",
                step.id,
                target_var,
                source_path,
            )
            continue

        value = _extract_value(source_data, source_path, extract_type)

        if value is _MISSING:
            continue

        # Publish source-path key so executor can map `target: source_path`.
        extracted[source_path] = value

    return extracted
