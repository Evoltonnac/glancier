from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.models import StoredSource, StoredView, ViewItem
from core.storage.contract import StorageContract
from core.storage.errors import StorageContractError
from core.storage.migration import run_startup_migration
from core.storage.sqlite_connection import create_sqlite_connection
from core.storage.sqlite_resource_repo import SqliteResourceRepository
from core.storage.sqlite_runtime_repo import SqliteRuntimeRepository


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _build_storage(tmp_path: Path) -> tuple[StorageContract, object]:
    connection = create_sqlite_connection(tmp_path / "storage.db")
    storage = StorageContract(
        runtime=SqliteRuntimeRepository(connection),
        resources=SqliteResourceRepository(connection),
        settings=object(),
    )
    return storage, connection


def test_run_startup_migration_imports_all_chunks_in_order_and_renames_markers(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    _write_json(
        data_dir / "data.json",
        [{"source_id": "source-alpha", "data": {"value": 1}}],
    )

    source = StoredSource(
        id="source-alpha",
        integration_id="integration-alpha",
        name="Alpha Source",
        config={"token": "abc"},
        vars={"region": "us"},
    )
    _write_json(data_dir / "sources.json", [source.model_dump()])

    view = StoredView(
        id="view-alpha",
        name="Alpha View",
        layout_columns=12,
        items=[
            ViewItem(
                id="item-alpha",
                x=0,
                y=0,
                w=3,
                h=4,
                source_id="source-alpha",
                template_id="tmpl-1",
                props={},
            )
        ],
    )
    _write_json(data_dir / "views.json", [view.model_dump()])

    storage, connection = _build_storage(tmp_path)
    try:
        run_startup_migration(storage, data_dir=data_dir)

        latest = storage.runtime.get_latest("source-alpha")
        assert latest is not None
        assert latest["data"] == {"value": 1}
        assert [item.id for item in storage.resources.load_sources()] == ["source-alpha"]
        assert [item.id for item in storage.resources.load_views()] == ["view-alpha"]

        assert not (data_dir / "data.json").exists()
        assert not (data_dir / "sources.json").exists()
        assert not (data_dir / "views.json").exists()
        assert (data_dir / "data.deprecated.v1.json").exists()
        assert (data_dir / "sources.deprecated.v1.json").exists()
        assert (data_dir / "views.deprecated.v1.json").exists()
    finally:
        connection.close()


def test_run_startup_migration_renames_only_after_successful_chunk_validation(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    _write_json(
        data_dir / "data.json",
        [{"source_id": "source-alpha", "data": {"value": 1}}],
    )
    _write_json(data_dir / "sources.json", [{"integration_id": "broken"}])
    _write_json(data_dir / "views.json", [])

    storage, connection = _build_storage(tmp_path)
    try:
        with pytest.raises(StorageContractError):
            run_startup_migration(storage, data_dir=data_dir)

        latest = storage.runtime.get_latest("source-alpha")
        assert latest is not None
        assert latest["data"] == {"value": 1}

        assert (data_dir / "data.deprecated.v1.json").exists()
        assert not (data_dir / "data.json").exists()

        assert (data_dir / "sources.json").exists()
        assert not (data_dir / "sources.deprecated.v1.json").exists()
        assert (data_dir / "views.json").exists()
        assert not (data_dir / "views.deprecated.v1.json").exists()

        assert storage.resources.load_sources() == []
        assert storage.resources.load_views() == []
    finally:
        connection.close()


def test_run_startup_migration_is_idempotent_and_skips_deprecated_chunks(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    _write_json(
        data_dir / "data.json",
        [{"source_id": "source-alpha", "data": {"value": 1}}],
    )
    _write_json(
        data_dir / "sources.json",
        [
            {
                "id": "source-alpha",
                "integration_id": "integration-alpha",
                "name": "Alpha Source",
                "config": {},
                "vars": {},
            }
        ],
    )
    _write_json(
        data_dir / "views.json",
        [{"id": "view-alpha", "name": "Alpha View", "layout_columns": 12, "items": []}],
    )

    storage, connection = _build_storage(tmp_path)
    try:
        run_startup_migration(storage, data_dir=data_dir)
        run_startup_migration(storage, data_dir=data_dir)

        runtime_count = connection.execute("SELECT COUNT(*) FROM runtime_latest").fetchone()[0]
        source_count = connection.execute("SELECT COUNT(*) FROM stored_sources").fetchone()[0]
        view_count = connection.execute("SELECT COUNT(*) FROM stored_views").fetchone()[0]
        assert runtime_count == 1
        assert source_count == 1
        assert view_count == 1

        assert (data_dir / "data.deprecated.v1.json").exists()
        assert (data_dir / "sources.deprecated.v1.json").exists()
        assert (data_dir / "views.deprecated.v1.json").exists()
    finally:
        connection.close()
