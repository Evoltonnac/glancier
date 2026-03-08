from __future__ import annotations

from core.integration_manager import IntegrationManager


def test_create_integration_keeps_filename_suffix_stable(tmp_path):
    config_root = tmp_path / "config"
    manager = IntegrationManager(config_root=str(config_root))

    created = manager.create_integration("sample.yaml", "flow: []\n")

    assert created is True
    assert (config_root / "integrations" / "sample.yaml").exists()
    assert not (config_root / "integrations" / "sample.yaml.yaml").exists()


def test_list_files_and_extract_file_based_id(tmp_path):
    config_root = tmp_path / "config"
    integrations_dir = config_root / "integrations"
    integrations_dir.mkdir(parents=True)
    (integrations_dir / "multi.yaml").write_text(
        "flow: []\n",
        encoding="utf-8",
    )

    manager = IntegrationManager(config_root=str(config_root))

    assert manager.list_integration_files() == ["multi.yaml"]
    assert manager.get_integration_ids_in_file("multi.yaml") == ["multi"]


def test_metadata_reads_optional_display_name(tmp_path):
    config_root = tmp_path / "config"
    integrations_dir = config_root / "integrations"
    integrations_dir.mkdir(parents=True)
    (integrations_dir / "named.yaml").write_text(
        "name: 中文显示名\nflow: []\n",
        encoding="utf-8",
    )

    manager = IntegrationManager(config_root=str(config_root))

    assert manager.get_integration_display_name("named.yaml") == "中文显示名"
    assert manager.list_integration_file_metadata() == [
        {
            "filename": "named.yaml",
            "id": "named",
            "name": "中文显示名",
        }
    ]
