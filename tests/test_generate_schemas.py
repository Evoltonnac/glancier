from __future__ import annotations

from pathlib import Path

from core.config_loader import STEP_ARGS_SCHEMAS_BY_USE, StepType
from scripts.generate_schemas import generate_python_fragment


def test_sql_step_type_is_declared() -> None:
    assert StepType.SQL.value == "sql"


def test_all_step_types_have_colocated_args_schema_declarations() -> None:
    expected_step_values = {step_type.value for step_type in StepType}
    declared_values = set(STEP_ARGS_SCHEMAS_BY_USE.keys())

    assert declared_values == expected_step_values


def test_step_config_schema_uses_per_step_variants() -> None:
    schema = generate_python_fragment()
    step_config = schema["$defs"]["StepConfig"]

    assert "oneOf" in step_config
    refs = [item["$ref"] for item in step_config["oneOf"]]
    expected_refs = {f"#/$defs/StepConfig_{step_type.value}" for step_type in StepType}
    assert set(refs) == expected_refs
    assert "#/$defs/StepConfig_sql" in refs


def test_form_fields_require_key_in_schema() -> None:
    schema = generate_python_fragment()
    form_step = schema["$defs"]["StepConfig_form"]
    form_args = form_step["properties"]["args"]
    field_item = form_args["properties"]["fields"]["items"]

    assert field_item["required"] == ["key"]
    assert field_item["properties"]["key"]["minLength"] == 1


def test_webview_step_requires_url_arg() -> None:
    schema = generate_python_fragment()
    webview_step = schema["$defs"]["StepConfig_webview"]
    webview_args = webview_step["properties"]["args"]

    assert webview_args["required"] == ["url"]


def test_sqlglot_dependency_is_declared() -> None:
    requirements = Path(__file__).resolve().parents[1] / "requirements.txt"
    requirement_lines = {
        line.strip().lower()
        for line in requirements.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }

    assert any(line.startswith("sqlglot") for line in requirement_lines)
