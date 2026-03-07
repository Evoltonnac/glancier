"""Test integration YAML validation using Pydantic."""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

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
