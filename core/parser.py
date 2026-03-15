"""
Data parser supporting JSONPath / CSS Selector / Regex / custom-script modes.
Parses HTTP responses into structured dictionaries.
"""

import importlib.util
import logging
import re
from typing import Any

from core.config_loader import FieldMapping, ParserConfig, ParserType

logger = logging.getLogger(__name__)


def _cast_value(value: Any, type_hint: str) -> Any:
    """Cast extracted value by configured type."""
    if value is None:
        return None
    try:
        if type_hint == "int":
            return int(float(str(value)))
        elif type_hint == "float":
            return float(str(value))
        elif type_hint == "bool":
            return str(value).lower() in ("true", "1", "yes")
        elif type_hint in ("object", "json", "list", "dict"):
            return value
        return str(value)
    except (ValueError, TypeError):
        logger.warning("type cast failed: %r -> %s", value, type_hint)
        return value


# ── JSONPath parsing ──────────────────────────────────

def _parse_jsonpath(data: dict | list, fields: list[FieldMapping]) -> dict[str, Any]:
    from jsonpath_ng.ext import parse as jp_parse

    result = {}
    for field in fields:
        try:
            expr = jp_parse(field.expr)
            matches = expr.find(data)
            if matches:
                raw = matches[0].value
                result[field.name] = _cast_value(raw, field.type)
            else:
                result[field.name] = None
                logger.debug("JSONPath '%s' matched no values", field.expr)
        except Exception as e:
            logger.warning("JSONPath parse error [%s]: %s", field.name, e)
            result[field.name] = None
    return result


# ── CSS selector parsing ──────────────────────────────

def _parse_css(html: str, fields: list[FieldMapping]) -> dict[str, Any]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    result = {}
    for field in fields:
        try:
            elements = soup.select(field.expr)
            if elements:
                raw = elements[0].get_text(strip=True)
                result[field.name] = _cast_value(raw, field.type)
            else:
                result[field.name] = None
                logger.debug("CSS selector '%s' matched no values", field.expr)
        except Exception as e:
            logger.warning("CSS parse error [%s]: %s", field.name, e)
            result[field.name] = None
    return result


# ── Regex parsing ─────────────────────────────────────

def _parse_regex(text: str, fields: list[FieldMapping]) -> dict[str, Any]:
    result = {}
    for field in fields:
        try:
            match = re.search(field.expr, text)
            if match:
                # Prefer named group, then first group, then full match.
                raw = match.group(field.name) if field.name in (match.groupdict() or {}) else (
                    match.group(1) if match.lastindex else match.group(0)
                )
                result[field.name] = _cast_value(raw, field.type)
            else:
                result[field.name] = None
                logger.debug("Regex '%s' matched no values", field.expr)
        except Exception as e:
            logger.warning("Regex parse error [%s]: %s", field.name, e)
            result[field.name] = None
    return result


# ── Script parsing ────────────────────────────────────

def _parse_script(response_text: str, script_path: str) -> dict[str, Any]:
    """
    Execute custom Python script for parsing.
    Script must define parse(response_text: str) -> dict.
    """
    try:
        spec = importlib.util.spec_from_file_location("custom_parser", script_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        if not hasattr(module, "parse"):
            raise AttributeError(f"script {script_path} is missing parse()")

        return module.parse(response_text)
    except Exception as e:
        logger.error("script parse error [%s]: %s", script_path, e)
        return {"_error": str(e)}


# ── Unified parse entrypoint ──────────────────────────

def parse_response(
    response_text: str,
    response_json: dict | list | None,
    parser_config: ParserConfig,
) -> dict[str, Any]:
    """
    Unified parse entrypoint.

    Args:
        response_text: raw HTTP response text
        response_json: JSON-parsed payload when available
        parser_config: parser configuration
    Returns:
        parsed field dictionary
    """
    ptype = parser_config.type

    if ptype == ParserType.JSONPATH:
        if response_json is None:
            logger.error("JSONPath mode requires JSON response but parsing failed")
            return {"_error": "Response is not valid JSON"}
        return _parse_jsonpath(response_json, parser_config.fields)

    elif ptype == ParserType.CSS:
        return _parse_css(response_text, parser_config.fields)

    elif ptype == ParserType.REGEX:
        return _parse_regex(response_text, parser_config.fields)

    elif ptype == ParserType.SCRIPT:
        if not parser_config.script:
            return {"_error": "Script mode requires script path"}
        return _parse_script(response_text, parser_config.script)

    else:
        return {"_error": f"Unknown parser type: {ptype}"}
