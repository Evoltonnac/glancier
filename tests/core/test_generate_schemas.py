from __future__ import annotations

import pytest
from pydantic import ValidationError

from scripts.generate_schemas import IntegrationFileSchema, IntegrationYamlConfig


def test_integration_yaml_schema_is_flow_only() -> None:
    schema = IntegrationYamlConfig.model_json_schema()
    properties = schema.get("properties", {})

    assert "flow" in properties
    assert "auth" not in properties
    assert "request" not in properties
    assert "parser" not in properties
    assert "id" not in properties
    assert "flow" in schema.get("required", [])


def test_integration_file_schema_rejects_legacy_integrations_array() -> None:
    with pytest.raises(ValidationError):
        IntegrationFileSchema.model_validate(
            {
                "integrations": [
                    {
                        "id": "legacy_style",
                        "flow": [],
                    }
                ]
            }
        )


def test_integration_file_schema_rejects_inline_id() -> None:
    with pytest.raises(ValidationError):
        IntegrationFileSchema.model_validate(
            {
                "id": "legacy_style",
                "flow": [],
            }
        )
