"""
Extract Step Module.

This module handles the extraction of specific data points from structured objects
like JSON responses or dictionaries, typically using JSONPath or direct key lookup.

Args Schema:
    source (Any): The source data to extract from (e.g., dict or list).
    expr (str): The extraction expression (e.g., JSONPath string or dictionary key).
    type (str, optional): The extraction method. 'jsonpath' or 'key'. Defaults to 'jsonpath'.

Return Structure:
    dict: A dictionary where the key is defined by step.outputs (first value)
          and the value is the extracted data.
"""

from jsonpath_ng import parse
from typing import Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from core.config_loader import StepConfig, SourceConfig
    from core.executor import Executor


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
    expr = args.get("expr")
    extract_type = args.get("type", "jsonpath")

    if not step.outputs:
        return {}

    output_key = list(step.outputs.values())[0]

    if extract_type == "jsonpath":
        jsonpath_expr = parse(expr)
        matches = jsonpath_expr.find(source_data)
        if matches:
            return {output_key: matches[0].value}
        return {}
    
    elif extract_type == "key":
        if isinstance(source_data, dict):
            # Case-insensitive header lookup if it seems to be headers (ratelimit)
            if "ratelimit" in str(expr).lower():
                val = next((v for k, v in source_data.items() if k.lower() == str(expr).lower()), None)
                return {output_key: val}
            return {output_key: source_data.get(expr)}
        return {}

    return {}
