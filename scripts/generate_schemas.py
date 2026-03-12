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

from core.config_loader import StepConfig, ViewComponent

CONFIG_SCHEMA_ROOT = REPO_ROOT / "config" / "schemas"
REACT_SDUI_GENERATOR = REPO_ROOT / "scripts" / "generate_react_sdui_schema.mjs"


class IntegrationYamlConfig(BaseModel):
    """Schema-only model for single integration YAML files."""

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    description: Optional[str] = None
    flow: list[StepConfig]
    templates: list[ViewComponent] = Field(default_factory=list)


class IntegrationFileSchema(IntegrationYamlConfig):
    """Top-level schema for integration YAML files."""


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def generate_python_fragment() -> dict[str, Any]:
    """Generate the Python/Pydantic fragment."""
    schema = IntegrationFileSchema.model_json_schema(mode="serialization")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Glancier Integration Configuration (Python Fragment)"
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
) -> Any:
    """Rewrite internal root refs from '#' to root_ref_target."""
    if isinstance(value, dict):
        rewritten: dict[str, Any] = {}
        for key, nested in value.items():
            if strip_schema_keyword and key == "$schema":
                continue
            if key == "$ref" and nested == "#":
                rewritten[key] = root_ref_target
                continue
            rewritten[key] = rewrite_schema_refs(
                nested,
                root_ref_target=root_ref_target,
                strip_schema_keyword=strip_schema_keyword,
            )
        return rewritten
    if isinstance(value, list):
        return [
            rewrite_schema_refs(
                item,
                root_ref_target=root_ref_target,
                strip_schema_keyword=strip_schema_keyword,
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
    combined["title"] = "Glancier Integration Configuration"
    combined["description"] = (
        "Composed schema for Glancier integration YAML files "
        "(Python flow definitions + React SDUI widget definitions)."
    )

    widget_tree = react_sdui_fragment.get("widget_tree")
    if not isinstance(widget_tree, dict):
        raise ValueError("React SDUI fragment missing required 'widget_tree' schema object.")

    defs = combined.setdefault("$defs", {})
    defs["SduiWidget"] = rewrite_schema_refs(
        widget_tree,
        root_ref_target="#/$defs/SduiWidget",
        strip_schema_keyword=True,
    )

    widget_defs = react_sdui_fragment.get("widget_defs", {})
    if isinstance(widget_defs, dict):
        for name, fragment in widget_defs.items():
            if isinstance(fragment, dict):
                defs[f"Sdui{normalize_def_name(name)}"] = fragment

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
