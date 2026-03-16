#!/usr/bin/env python3
"""
Generate split JSON schema artifacts for integration YAML files.

Outputs (all under config/schemas):
- integration.python.schema.json (from Python/Pydantic models)
- integration.sdui.schema.json (from React SDUI zod schemas)
- integration.schema.json (composed full schema for Monaco validation)
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.config_loader import (
    STEP_ARGS_SCHEMAS_BY_USE,
    StepConfig,
    ViewComponent,
)

CONFIG_SCHEMA_ROOT = REPO_ROOT / "config" / "schemas"
REACT_SDUI_GENERATOR = REPO_ROOT / "scripts" / "generate_react_sdui_schema.mjs"


class IntegrationYamlConfig(BaseModel):
    """Schema-only model for single integration YAML files."""

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    description: Optional[str] = None
    # Integration-level default auto-refresh interval in minutes.
    # None means unset, 0 means disabled.
    default_refresh_interval_minutes: Optional[int] = Field(default=None, ge=0)
    flow: Optional[list[StepConfig]] = None
    templates: list[ViewComponent] = Field(default_factory=list)


class IntegrationFileSchema(IntegrationYamlConfig):
    """Top-level schema for integration YAML files."""


def _build_step_variant_schema(
    *,
    use_value: str,
    args_schema: dict[str, Any],
    base_properties: dict[str, Any],
) -> dict[str, Any]:
    shared_properties = deepcopy(base_properties)
    shared_properties["use"] = {
        "type": "string",
        "const": use_value,
        "title": "Use",
    }
    shared_properties["args"] = args_schema

    return {
        "type": "object",
        "properties": shared_properties,
        "required": ["id", "use"],
        "additionalProperties": False,
    }


def apply_step_variants_schema(schema: dict[str, Any]) -> dict[str, Any]:
    defs = schema.get("$defs")
    if not isinstance(defs, dict):
        return schema

    step_config_schema = defs.get("StepConfig")
    step_type_schema = defs.get("StepType")
    if not isinstance(step_config_schema, dict) or not isinstance(step_type_schema, dict):
        return schema

    step_properties = step_config_schema.get("properties")
    if not isinstance(step_properties, dict):
        return schema

    base_properties: dict[str, Any] = {}
    for key in ("id", "run", "outputs", "context", "secrets"):
        value = step_properties.get(key)
        if value is not None:
            base_properties[key] = deepcopy(value)

    enum_values = step_type_schema.get("enum")
    if not isinstance(enum_values, list):
        return schema

    args_schemas = STEP_ARGS_SCHEMAS_BY_USE
    missing_declared_schemas = [
        use_value
        for use_value in enum_values
        if isinstance(use_value, str) and use_value not in args_schemas
    ]
    if missing_declared_schemas:
        missing = ", ".join(sorted(missing_declared_schemas))
        raise ValueError(
            f"Missing step args schema declarations in core.config_loader.STEP_ARGS_SCHEMAS_BY_USE: {missing}"
        )
    variant_refs: list[dict[str, Any]] = []

    for use_value in enum_values:
        if not isinstance(use_value, str):
            continue
        variant_name = f"StepConfig_{use_value}"
        args_schema = deepcopy(args_schemas[use_value])
        defs[variant_name] = _build_step_variant_schema(
            use_value=use_value,
            args_schema=args_schema,
            base_properties=base_properties,
        )
        variant_refs.append({"$ref": f"#/$defs/{variant_name}"})

    if variant_refs:
        defs["StepConfig"] = {
            "title": "StepConfig",
            "oneOf": variant_refs,
        }

    return schema


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def generate_python_fragment() -> dict[str, Any]:
    """Generate the Python/Pydantic fragment."""
    schema = IntegrationFileSchema.model_json_schema(mode="serialization")
    schema = apply_step_variants_schema(schema)
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Glanceus Integration Configuration (Python Fragment)"
    schema["description"] = (
        "Generated from Python models: integration root, flow steps, and view component envelope."
    )
    return schema


def run_react_sdui_generator(output_path: Path) -> None:
    """Generate React SDUI fragment via Node script."""
    if not REACT_SDUI_GENERATOR.exists():
        raise FileNotFoundError(f"React SDUI schema generator not found: {REACT_SDUI_GENERATOR}")

    completed = subprocess.run(
        ["node", str(REACT_SDUI_GENERATOR), str(output_path)],
        cwd=str(REPO_ROOT),
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        stdout = completed.stdout.strip()
        debug = "\n".join(part for part in [stdout, stderr] if part)
        raise RuntimeError(f"Failed to generate React SDUI schema fragment.\n{debug}")


def normalize_def_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", name)


def rewrite_schema_refs(
    value: Any,
    *,
    root_ref_target: str,
    strip_schema_keyword: bool = False,
    defs_ref_prefix: str = "#/$defs/Sdui",
) -> Any:
    """Rewrite internal refs to composed-schema targets."""
    if isinstance(value, dict):
        rewritten: dict[str, Any] = {}
        for key, nested in value.items():
            if strip_schema_keyword and key == "$schema":
                continue
            if key == "$ref" and isinstance(nested, str):
                if nested == "#":
                    rewritten[key] = root_ref_target
                    continue
                if nested.startswith("#/$defs/"):
                    def_name = nested.removeprefix("#/$defs/")
                    rewritten[key] = f"{defs_ref_prefix}{normalize_def_name(def_name)}"
                    continue
                rewritten[key] = nested
                continue
            rewritten[key] = rewrite_schema_refs(
                nested,
                root_ref_target=root_ref_target,
                strip_schema_keyword=strip_schema_keyword,
                defs_ref_prefix=defs_ref_prefix,
            )
        return rewritten
    if isinstance(value, list):
        return [
            rewrite_schema_refs(
                item,
                root_ref_target=root_ref_target,
                strip_schema_keyword=strip_schema_keyword,
                defs_ref_prefix=defs_ref_prefix,
            )
            for item in value
        ]
    return value


def compose_integration_schema(
    python_fragment: dict[str, Any],
    react_sdui_fragment: dict[str, Any],
) -> dict[str, Any]:
    """Compose final integration schema from Python and React fragments."""
    combined = deepcopy(python_fragment)
    combined["title"] = "Glanceus Integration Configuration"
    combined["description"] = (
        "Composed schema for Glanceus integration YAML files "
        "(Python flow definitions + React SDUI widget definitions)."
    )

    widget_tree = react_sdui_fragment.get("widget_tree")
    if not isinstance(widget_tree, dict):
        raise ValueError("React SDUI fragment missing required 'widget_tree' schema object.")

    defs = combined.setdefault("$defs", {})
    react_defs = react_sdui_fragment.get("$defs", {})
    if isinstance(react_defs, dict):
        for name, fragment in react_defs.items():
            if not isinstance(fragment, dict):
                continue
            defs[f"Sdui{normalize_def_name(name)}"] = rewrite_schema_refs(
                fragment,
                root_ref_target="#/$defs/SduiWidget",
                strip_schema_keyword=True,
            )

    rewritten_widget_tree = rewrite_schema_refs(
        widget_tree,
        root_ref_target="#/$defs/SduiWidget",
        strip_schema_keyword=True,
    )
    if (
        isinstance(rewritten_widget_tree, dict)
        and rewritten_widget_tree.get("$ref") == "#/$defs/SduiWidget"
    ):
        if "SduiWidget" not in defs:
            raise ValueError(
                "React SDUI fragment widget_tree references '$defs.Widget' "
                "but '$defs.Widget' is missing."
            )
    else:
        defs["SduiWidget"] = rewritten_widget_tree

    widget_defs = react_sdui_fragment.get("widget_defs", {})
    if isinstance(widget_defs, dict):
        for name, fragment in widget_defs.items():
            if isinstance(fragment, dict):
                target_name = f"Sdui{normalize_def_name(name)}"
                if target_name in defs:
                    continue
                defs[target_name] = rewrite_schema_refs(
                    fragment,
                    root_ref_target="#/$defs/SduiWidget",
                    strip_schema_keyword=True,
                )

    view_component_schema = defs.get("ViewComponent")
    if not isinstance(view_component_schema, dict):
        raise ValueError("Python fragment missing '$defs.ViewComponent'.")

    properties = view_component_schema.setdefault("properties", {})
    existing_widgets = properties.get("widgets", {})
    widgets_title = "Widgets"
    widgets_default = None
    if isinstance(existing_widgets, dict):
        widgets_title = str(existing_widgets.get("title", widgets_title))
        widgets_default = existing_widgets.get("default", widgets_default)

    properties["widgets"] = {
        "anyOf": [
            {
                "type": "array",
                "items": {"$ref": "#/$defs/SduiWidget"},
            },
            {"type": "null"},
        ],
        "default": widgets_default,
        "title": widgets_title,
    }

    return combined


def generate_complete_schema(
    target_root: Path,
    react_fragment_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate all schema artifacts and write them into target_root."""
    target_root.mkdir(parents=True, exist_ok=True)

    python_fragment = generate_python_fragment()
    python_fragment_path = target_root / "integration.python.schema.json"
    write_json(python_fragment_path, python_fragment)

    react_fragment_path = target_root / "integration.sdui.schema.json"
    if react_fragment_override is None:
        run_react_sdui_generator(react_fragment_path)
        react_fragment = json.loads(react_fragment_path.read_text(encoding="utf-8"))
    else:
        react_fragment = react_fragment_override
        write_json(react_fragment_path, react_fragment)

    combined_schema = compose_integration_schema(python_fragment, react_fragment)
    combined_schema_path = target_root / "integration.schema.json"
    write_json(combined_schema_path, combined_schema)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "output_dir": str(target_root),
        "files": {
            "python_fragment": str(python_fragment_path),
            "react_sdui_fragment": str(react_fragment_path),
            "combined_schema": str(combined_schema_path),
        },
    }


def main() -> None:
    result = generate_complete_schema(CONFIG_SCHEMA_ROOT)

    print("Generated integration schemas:")
    print(f"- Output dir: {result['output_dir']}")
    for key, path in result["files"].items():
        print(f"- {key}: {path}")
    print(f"- Generated at: {result['generated_at']}")


if __name__ == "__main__":
    main()
