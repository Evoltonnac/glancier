from __future__ import annotations

import pytest
from pydantic import ValidationError

from scripts.generate_schemas import (
    FLOW_STEP_SCHEMA_MODELS,
    IntegrationFileSchema,
    IntegrationYamlConfig,
)


def test_flow_step_schema_models_only_include_integration_yaml_models() -> None:
    assert set(FLOW_STEP_SCHEMA_MODELS) == {
        "step_config",
        "integration_config",
        "integration_file",
    }
    assert "source_config" not in FLOW_STEP_SCHEMA_MODELS


def test_integration_yaml_schema_is_flow_only() -> None:
    schema = IntegrationYamlConfig.model_json_schema()
    properties = schema.get("properties", {})

    assert "flow" in properties
    assert "auth" not in properties
    assert "request" not in properties
    assert "parser" not in properties
    assert "flow" in schema.get("required", [])


def test_integration_file_schema_rejects_legacy_top_level_auth() -> None:
    with pytest.raises(ValidationError):
        IntegrationFileSchema.model_validate(
            {
                "integrations": [
                    {
                        "id": "legacy_style",
                        "flow": [],
                        "auth": {"type": "none"},
                    }
                ]
            }
        )
