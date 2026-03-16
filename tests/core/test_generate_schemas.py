from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from scripts.generate_schemas import (
    IntegrationFileSchema,
    IntegrationYamlConfig,
    compose_integration_schema,
    generate_complete_schema,
    generate_python_fragment,
)


def test_integration_yaml_schema_is_flow_only() -> None:
    schema = IntegrationYamlConfig.model_json_schema()
    properties = schema.get("properties", {})

    assert "flow" in properties
    assert "default_refresh_interval_minutes" in properties
    assert "auth" not in properties
    assert "request" not in properties
    assert "parser" not in properties
    assert "id" not in properties
    assert "flow" not in schema.get("required", [])


def test_integration_file_schema_rejects_inline_id() -> None:
    with pytest.raises(ValidationError):
        IntegrationFileSchema.model_validate(
            {
                "id": "inline_id_should_fail",
                "flow": [],
            }
        )


def test_compose_integration_schema_injects_sdui_widget_reference() -> None:
    python_fragment = generate_python_fragment()
    react_fragment = {
        "widget_tree": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "const": "TextBlock"},
                "text": {"type": "string"},
            },
            "required": ["type", "text"],
            "additionalProperties": False,
        },
        "widget_defs": {
            "TextBlock": {
                "type": "object",
                "properties": {"type": {"const": "TextBlock"}},
                "required": ["type"],
            }
        },
    }

    combined = compose_integration_schema(python_fragment, react_fragment)

    defs = combined.get("$defs", {})
    assert "SduiWidget" in defs
    assert "SduiTextBlock" in defs

    view_component = defs.get("ViewComponent", {})
    widgets = view_component.get("properties", {}).get("widgets", {})
    any_of = widgets.get("anyOf", [])
    assert any_of[0]["items"]["$ref"] == "#/$defs/SduiWidget"
    assert any_of[1]["type"] == "null"


def test_generate_complete_schema_writes_split_files(tmp_path) -> None:
    react_fragment = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "React SDUI Fragment (Test)",
        "widget_tree": {
            "type": "object",
            "properties": {"type": {"const": "Badge"}, "text": {"type": "string"}},
            "required": ["type", "text"],
            "additionalProperties": False,
        },
        "widget_defs": {"Badge": {"type": "object"}},
    }

    result = generate_complete_schema(tmp_path, react_fragment_override=react_fragment)
    files = result["files"]

    python_path = tmp_path / "integration.python.schema.json"
    react_path = tmp_path / "integration.sdui.schema.json"
    combined_path = tmp_path / "integration.schema.json"

    assert files["python_fragment"] == str(python_path)
    assert files["react_sdui_fragment"] == str(react_path)
    assert files["combined_schema"] == str(combined_path)

    assert python_path.exists()
    assert react_path.exists()
    assert combined_path.exists()

    combined = json.loads(combined_path.read_text(encoding="utf-8"))
    assert "$defs" in combined
    assert "SduiWidget" in combined["$defs"]
    widgets = combined["$defs"]["ViewComponent"]["properties"]["widgets"]
    assert widgets["anyOf"][0]["items"]["$ref"] == "#/$defs/SduiWidget"


def test_compose_integration_schema_rewrites_recursive_root_refs() -> None:
    python_fragment = generate_python_fragment()
    react_fragment = {
        "widget_tree": {
            "type": "array",
            "items": {"$ref": "#"},
        },
        "widget_defs": {},
    }

    combined = compose_integration_schema(python_fragment, react_fragment)
    sdui_widget = combined["$defs"]["SduiWidget"]

    assert sdui_widget["items"]["$ref"] == "#/$defs/SduiWidget"


def test_compose_integration_schema_supports_react_defs_single_source() -> None:
    python_fragment = generate_python_fragment()
    react_fragment = {
        "$defs": {
            "Widget": {
                "oneOf": [
                    {"$ref": "#/$defs/TextBlock"},
                    {"$ref": "#/$defs/Container"},
                ]
            },
            "TextBlock": {
                "type": "object",
                "properties": {"type": {"const": "TextBlock"}, "text": {"type": "string"}},
                "required": ["type", "text"],
                "additionalProperties": False,
            },
            "Container": {
                "type": "object",
                "properties": {
                    "type": {"const": "Container"},
                    "items": {"type": "array", "items": {"$ref": "#/$defs/Widget"}},
                },
                "required": ["type", "items"],
                "additionalProperties": False,
            },
        },
        "widget_tree": {"$ref": "#/$defs/Widget"},
        "widget_defs": {
            "TextBlock": {"$ref": "#/$defs/TextBlock"},
        },
    }

    combined = compose_integration_schema(python_fragment, react_fragment)
    defs = combined["$defs"]

    assert defs["SduiWidget"]["oneOf"][0]["$ref"] == "#/$defs/SduiTextBlock"
    assert defs["SduiWidget"]["oneOf"][1]["$ref"] == "#/$defs/SduiContainer"
    assert defs["SduiContainer"]["properties"]["items"]["items"]["$ref"] == "#/$defs/SduiWidget"
    assert defs["SduiTextBlock"]["properties"]["type"]["const"] == "TextBlock"


def test_compose_integration_schema_rejects_missing_widget_def_for_ref_tree() -> None:
    python_fragment = generate_python_fragment()
    react_fragment = {
        "widget_tree": {"$ref": "#/$defs/Widget"},
        "widget_defs": {},
    }

    with pytest.raises(ValueError, match="widget_tree references '\\$defs.Widget'"):
        compose_integration_schema(python_fragment, react_fragment)
