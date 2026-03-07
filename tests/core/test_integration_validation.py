"""
Test integration YAML validation using Pydantic.
"""

import pytest
import yaml
from pydantic import ValidationError

from core.config_loader import IntegrationConfig


def test_valid_integration():
    """Test that a valid integration passes validation."""
    yaml_content = """
id: test-integration
flow:
  - id: step1
    use: http
    args:
      url: https://api.example.com
"""
    data = yaml.safe_load(yaml_content)
    integration = IntegrationConfig.model_validate(data)
    assert integration.id == "test-integration"
    assert len(integration.flow) == 1


def test_missing_required_field():
    """Test that missing required fields raise ValidationError."""
    yaml_content = """
name: Test Integration
flow:
  - id: step1
    use: http
"""
    data = yaml.safe_load(yaml_content)
    with pytest.raises(ValidationError) as exc_info:
        IntegrationConfig.model_validate(data)

    errors = exc_info.value.errors()
    assert any(err["loc"] == ("id",) for err in errors)


def test_invalid_flow_step():
    """Test that invalid flow steps raise ValidationError."""
    yaml_content = """
id: test-integration
flow:
  - id: step1
    # missing 'use' field
    args:
      url: https://api.example.com
"""
    data = yaml.safe_load(yaml_content)
    with pytest.raises(ValidationError) as exc_info:
        IntegrationConfig.model_validate(data)

    errors = exc_info.value.errors()
    # Should have error about missing 'use' field in flow step
    assert any("use" in str(err["loc"]) for err in errors)


def test_extra_fields_forbidden():
    """Test that extra fields are rejected."""
    yaml_content = """
id: test-integration
flow:
  - id: step1
    use: http
    args:
      url: https://api.example.com
unknown_field: should_fail
"""
    data = yaml.safe_load(yaml_content)
    with pytest.raises(ValidationError) as exc_info:
        IntegrationConfig.model_validate(data)

    errors = exc_info.value.errors()
    assert any("unknown_field" in str(err["loc"]) for err in errors)
