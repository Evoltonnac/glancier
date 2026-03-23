from __future__ import annotations

import inspect
import json
from pathlib import Path
from typing import Any

import pytest

from core.models import StoredSource, StoredView, ViewItem
from core.storage.contract import StorageContract
from core.storage.errors import StorageContractError
import core.storage.migration as migration_module
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


def test_run_startup_migration_imports_legacy_data_controller_payload_shape(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    _write_json(
        data_dir / "data.json",
        {
            "latest_by_source": {
                "source-alpha": {
                    "data": {"value": 1},
                    "updated_at": 123.0,
                    "last_success_at": 122.0,
                },
                "source-beta": {
                    "source_id": "source-beta",
                    "data": {"value": 2},
                    "updated_at": 223.0,
                    "last_success_at": 222.0,
                },
            },
            "history_by_source": {
                "source-alpha": [{"timestamp": 120.0, "data": {"value": 0}}],
            },
        },
    )

    storage, connection = _build_storage(tmp_path)
    try:
        run_startup_migration(storage, data_dir=data_dir)

        latest_alpha = storage.runtime.get_latest("source-alpha")
        latest_beta = storage.runtime.get_latest("source-beta")

        assert latest_alpha is not None
        assert latest_beta is not None
        assert latest_alpha["data"] == {"value": 1}
        assert latest_beta["data"] == {"value": 2}
        assert storage.runtime.get_latest("latest_by_source") is None
        assert (data_dir / "data.deprecated.v1.json").exists()
    finally:
        connection.close()


def test_run_startup_migration_repairs_runtime_from_deprecated_data_chunk(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    _write_json(
        data_dir / "data.deprecated.v1.json",
        {
            "latest_by_source": {
                "source-alpha": {
                    "data": {"value": 10},
                    "updated_at": 300.0,
                    "last_success_at": 299.0,
                }
            },
            "history_by_source": {},
        },
    )

    storage, connection = _build_storage(tmp_path)
    source = StoredSource(
        id="source-alpha",
        integration_id="integration-alpha",
        name="Alpha Source",
        config={},
        vars={},
    )
    storage.resources.save_source(source)
    storage.runtime.upsert_migration_latest(
        [
            {
                "source_id": "latest_by_source",
                "data": None,
                "updated_at": 1.0,
            }
        ]
    )

    try:
        run_startup_migration(storage, data_dir=data_dir)
        repaired = storage.runtime.get_latest("source-alpha")
        assert repaired is not None
        assert repaired["data"] == {"value": 10}

        run_startup_migration(storage, data_dir=data_dir)
        repaired_again = storage.runtime.get_latest("source-alpha")
        assert repaired_again is not None
        assert repaired_again["data"] == {"value": 10}
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


def test_run_startup_migration_routes_writes_through_repository_migration_apis(tmp_path: Path):
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

    class RuntimeMigrationSpy(SqliteRuntimeRepository):
        def __init__(self, connection, events: list[str]):  # type: ignore[no-untyped-def]
            super().__init__(connection)
            self._events = events
            self.migration_batches: list[list[dict[str, Any]]] = []

        def upsert_migration_latest(self, records: list[dict[str, Any]]) -> list[str]:
            self._events.append("data")
            self.migration_batches.append([dict(record) for record in records])
            return super().upsert_migration_latest(records)

    class ResourceMigrationSpy(SqliteResourceRepository):
        def __init__(self, connection, events: list[str]):  # type: ignore[no-untyped-def]
            super().__init__(connection)
            self._events = events
            self.source_batches: list[list[StoredSource]] = []
            self.view_batches: list[list[StoredView]] = []

        def upsert_migration_sources(self, sources: list[StoredSource]) -> list[str]:
            self._events.append("sources")
            self.source_batches.append(list(sources))
            return super().upsert_migration_sources(sources)

        def upsert_migration_views(self, views: list[StoredView]) -> list[str]:
            self._events.append("views")
            self.view_batches.append(list(views))
            return super().upsert_migration_views(views)

    connection = create_sqlite_connection(tmp_path / "storage.db")
    events: list[str] = []
    runtime = RuntimeMigrationSpy(connection, events)
    resources = ResourceMigrationSpy(connection, events)
    storage = StorageContract(runtime=runtime, resources=resources, settings=object())

    try:
        run_startup_migration(storage, data_dir=data_dir)

        assert events == ["data", "sources", "views"]
        assert len(runtime.migration_batches) == 1
        assert len(resources.source_batches) == 1
        assert len(resources.view_batches) == 1
    finally:
        connection.close()


def test_migration_module_does_not_embed_runtime_or_resource_mutation_sql():
    source = inspect.getsource(migration_module)
    assert "INSERT INTO runtime_latest" not in source
    assert "INSERT INTO stored_sources" not in source
    assert "INSERT INTO stored_views" not in source
    assert "UPDATE stored_views SET payload_json" not in source
