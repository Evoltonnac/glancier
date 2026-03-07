#!/usr/bin/env python3
"""
Generate a complete, self-contained JSON schema for integration YAML files.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Type

from pydantic import BaseModel, ConfigDict, Field

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.config_loader import StepConfig, ViewComponent

CONFIG_SCHEMA_ROOT = REPO_ROOT / "config" / "schemas"


class IntegrationYamlConfig(BaseModel):
    """Schema-only model for flow-based integration YAML files."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: Optional[str] = None
    description: Optional[str] = None
    flow: list[StepConfig]
    templates: list[ViewComponent] = Field(default_factory=list)


class IntegrationFileSchema(BaseModel):
    """Top-level schema for integration YAML files."""

    model_config = ConfigDict(extra="forbid")

    integrations: list[IntegrationYamlConfig] = Field(default_factory=list)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def generate_complete_schema(target_root: Path) -> dict:
    """Generate a complete, self-contained integration schema."""
    target_root.mkdir(parents=True, exist_ok=True)

    # Generate complete schema with all $defs included
    schema = IntegrationFileSchema.model_json_schema(mode="serialization")

    # Add metadata
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Glancier Integration Configuration"
    schema["description"] = "Schema for Glancier integration YAML files"

    # Write to single file
    schema_path = target_root / "integration.schema.json"
    write_json(schema_path, schema)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schema_file": "integration.schema.json",
        "schema_path": str(schema_path)
    }


def main() -> None:
    result = generate_complete_schema(CONFIG_SCHEMA_ROOT)

    print("Generated integration schema:")
    print(f"- File: {result['schema_file']}")
    print(f"- Path: {result['schema_path']}")
    print(f"- Generated at: {result['generated_at']}")


if __name__ == "__main__":
    main()
