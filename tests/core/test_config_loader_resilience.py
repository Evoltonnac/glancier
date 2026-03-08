from __future__ import annotations

import pytest
from pydantic import ValidationError

from core.config_loader import load_config


def test_load_config_skips_invalid_integration_entries(tmp_path):
    config_dir = tmp_path / "config"
    integrations_dir = config_dir / "integrations"
    integrations_dir.mkdir(parents=True)

    (integrations_dir / "good.yaml").write_text(
        """
auth:
  type: none
""".strip()
        + "\n",
        encoding="utf-8",
    )
    (integrations_dir / "bad.yaml").write_text(
        """
auth:
  type: invalid_auth
""".strip()
        + "\n",
        encoding="utf-8",
    )

    config = load_config(config_dir)

    assert [integration.id for integration in config.integrations] == ["good"]


def test_load_config_rejects_duplicate_file_based_integration_ids(tmp_path):
    config_dir = tmp_path / "config"
    integrations_dir = config_dir / "integrations"
    integrations_dir.mkdir(parents=True)

    (integrations_dir / "dup.yaml").write_text("flow: []\n", encoding="utf-8")
    (integrations_dir / "dup.yml").write_text("flow: []\n", encoding="utf-8")

    with pytest.raises(ValidationError):
        load_config(config_dir)
