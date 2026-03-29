from __future__ import annotations

import json
import sqlite3
from types import SimpleNamespace

import main as main_module
from core.config_loader import AppConfig
from core.network_trust.models import PersistedTrustDecision, TrustDecision, TrustScopeType
from core.network_trust.policy import NetworkTrustPolicy
from core.models import StoredSource, StoredView, ViewItem
from core.storage.contract import STORAGE_SCHEMA_VERSION
from core.storage.settings_adapter import SettingsAdapter
from core.storage.sqlite_connection import create_sqlite_connection
from core.storage.sqlite_resource_repo import SqliteResourceRepository
from core.storage.sqlite_runtime_repo import SqliteRuntimeRepository
from core.storage.sqlite_trust_rule_repo import SqliteTrustRuleRepository
from core.settings_manager import SettingsManager, SystemSettings


class SqlConnectionSpy:
    def __init__(self, delegate: sqlite3.Connection):
        self._delegate = delegate
        self.sql_statements: list[str] = []

    def execute(self, sql: str, parameters=()):  # type: ignore[no-untyped-def]
        self.sql_statements.append(" ".join(sql.strip().split()))
        return self._delegate.execute(sql, parameters)

    def commit(self) -> None:
        self._delegate.commit()

    def rollback(self) -> None:
        self._delegate.rollback()

    def cursor(self):  # type: ignore[no-untyped-def]
        return self._delegate.cursor()

    def __enter__(self):
        self._delegate.__enter__()
        return self

    def __exit__(self, exc_type, exc, tb):  # type: ignore[no-untyped-def]
        return self._delegate.__exit__(exc_type, exc, tb)


def test_storage_bootstrap_sets_schema_version_and_tables(tmp_path):
    db_path = tmp_path / "storage.db"

    conn = create_sqlite_connection(db_path)
    try:
        user_version = conn.execute("PRAGMA user_version").fetchone()
        assert user_version is not None
        assert user_version[0] == STORAGE_SCHEMA_VERSION

        table_rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        table_names = {row[0] for row in table_rows}
        assert {
            "runtime_latest",
            "runtime_history",
            "stored_sources",
            "stored_views",
            "connection_trust_rules",
        } <= table_names

        index_rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index'"
        ).fetchall()
        index_names = {row[0] for row in index_rows}
        assert "idx_connection_trust_rules_identity" in index_names
        assert "idx_connection_trust_rules_lookup" in index_names
    finally:
        conn.close()


def test_trust_rule_repo_upsert_query_delete_and_policy_precedence(tmp_path):
    db_path = tmp_path / "storage.db"
    conn = create_sqlite_connection(db_path)
    source_repo = SqliteResourceRepository(conn)
    trust_repo = SqliteTrustRuleRepository(conn)

    source_repo.save_source(
        StoredSource(
            id="source-alpha",
            integration_id="demo",
            name="Alpha",
            config={},
            vars={},
        )
    )

    try:
        source_rule = trust_repo.upsert_rule(
            capability="http",
            scope_type=TrustScopeType.SOURCE.value,
            source_id="source-alpha",
            target_type="host",
            target_value="127.0.0.1",
            decision=PersistedTrustDecision.ALLOW.value,
            metadata={"from": "test"},
        )
        assert source_rule.scope_type == TrustScopeType.SOURCE
        assert source_rule.decision == PersistedTrustDecision.ALLOW

        # Deterministic identity: same key upserts in-place instead of creating duplicates.
        updated_source_rule = trust_repo.upsert_rule(
            capability="http",
            scope_type=TrustScopeType.SOURCE.value,
            source_id="source-alpha",
            target_type="host",
            target_value="127.0.0.1",
            decision=PersistedTrustDecision.DENY.value,
            metadata={"from": "update"},
        )
        assert updated_source_rule.rule_id == source_rule.rule_id
        assert updated_source_rule.decision == PersistedTrustDecision.DENY
        rows = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM connection_trust_rules
            WHERE capability = 'http'
              AND scope_type = 'source'
              AND source_id = 'source-alpha'
              AND target_type = 'host'
              AND target_value = '127.0.0.1'
            """
        ).fetchone()
        assert rows is not None
        assert rows["cnt"] == 1

        global_rule = trust_repo.upsert_rule(
            capability="http",
            scope_type=TrustScopeType.GLOBAL.value,
            source_id=None,
            target_type="host",
            target_value="10.0.0.5",
            decision=PersistedTrustDecision.ALLOW.value,
        )
        assert global_rule.scope_type == TrustScopeType.GLOBAL
        assert global_rule.source_id is None
        fetched_global = trust_repo.find_rule(
            capability="http",
            scope_type=TrustScopeType.GLOBAL.value,
            source_id=None,
            target_type="host",
            target_value="10.0.0.5",
        )
        assert fetched_global is not None
        assert fetched_global.decision == PersistedTrustDecision.ALLOW

        policy = NetworkTrustPolicy(
            rule_repository=trust_repo,
            default_policy_resolver=lambda: "prompt",
        )

        # Source rule overrides global and default.
        source_resolution = policy.evaluate(
            capability="http",
            source_id="source-alpha",
            target_type="host",
            target_value="127.0.0.1",
        )
        assert source_resolution.decision == TrustDecision.DENY
        assert source_resolution.reason == "source_rule"

        # Global rule applies when source-scoped rule is absent.
        global_resolution = policy.evaluate(
            capability="http",
            source_id="source-alpha",
            target_type="host",
            target_value="10.0.0.5",
        )
        assert global_resolution.decision == TrustDecision.ALLOW
        assert global_resolution.reason == "global_rule"

        # Default fallback resolves when no persisted match exists.
        fallback_resolution = policy.evaluate(
            capability="http",
            source_id="source-alpha",
            target_type="host",
            target_value="example.com",
        )
        assert fallback_resolution.decision == TrustDecision.PROMPT
        assert fallback_resolution.reason == "default"

        policy.grant_allow_once(
            capability="http",
            source_id="source-alpha",
            target_type="host",
            target_value="127.0.0.1",
        )
        first_allow_once = policy.evaluate(
            capability="http",
            source_id="source-alpha",
            target_type="host",
            target_value="127.0.0.1",
        )
        second_allow_once = policy.evaluate(
            capability="http",
            source_id="source-alpha",
            target_type="host",
            target_value="127.0.0.1",
        )
        assert first_allow_once.decision == TrustDecision.ALLOW
        assert first_allow_once.reason == "allow_once"
        assert second_allow_once.decision == TrustDecision.ALLOW
        assert second_allow_once.reason == "allow_once"

        policy.clear_allow_once_for_source(source_id="source-alpha")
        cleared_resolution = policy.evaluate(
            capability="http",
            source_id="source-alpha",
            target_type="host",
            target_value="127.0.0.1",
        )
        assert cleared_resolution.decision == TrustDecision.DENY
        assert cleared_resolution.reason == "source_rule"

        assert trust_repo.delete_rule(
            capability="http",
            scope_type=TrustScopeType.GLOBAL.value,
            source_id=None,
            target_type="host",
            target_value="10.0.0.5",
        ) is True
        assert trust_repo.delete_rule(
            capability="http",
            scope_type=TrustScopeType.GLOBAL.value,
            source_id=None,
            target_type="host",
            target_value="10.0.0.5",
        ) is False
    finally:
        conn.close()


def test_trust_rule_source_scope_cascades_on_source_delete(tmp_path):
    db_path = tmp_path / "storage.db"
    conn = create_sqlite_connection(db_path)
    source_repo = SqliteResourceRepository(conn)
    trust_repo = SqliteTrustRuleRepository(conn)

    source_repo.save_source(
        StoredSource(
            id="source-delete-me",
            integration_id="demo",
            name="Delete Me",
            config={},
            vars={},
        )
    )
    trust_repo.upsert_rule(
        capability="http",
        scope_type=TrustScopeType.SOURCE.value,
        source_id="source-delete-me",
        target_type="host",
        target_value="192.168.1.5",
        decision=PersistedTrustDecision.ALLOW.value,
    )

    try:
        before = trust_repo.find_rule(
            capability="http",
            scope_type=TrustScopeType.SOURCE.value,
            source_id="source-delete-me",
            target_type="host",
            target_value="192.168.1.5",
        )
        assert before is not None

        assert source_repo.delete_source("source-delete-me") is True

        after = trust_repo.find_rule(
            capability="http",
            scope_type=TrustScopeType.SOURCE.value,
            source_id="source-delete-me",
            target_type="host",
            target_value="192.168.1.5",
        )
        assert after is None
    finally:
        conn.close()


def test_runtime_repo_crud_contract_parity(tmp_path):
    db_path = tmp_path / "storage.db"
    conn = create_sqlite_connection(db_path)
    repo = SqliteRuntimeRepository(conn)

    try:
        repo.upsert("source-alpha", {"value": 1})

        latest = repo.get_latest("source-alpha")
        assert latest is not None
        assert latest["source_id"] == "source-alpha"
        assert latest["data"] == {"value": 1}
        assert latest.get("updated_at") is not None
        assert latest.get("last_success_at") is not None

        all_latest = repo.get_all_latest()
        assert len(all_latest) == 1
        assert all_latest[0]["source_id"] == "source-alpha"

        first_ts = latest["updated_at"]
        conn.execute(
            """
            INSERT INTO runtime_history(source_id, timestamp, payload_json)
            VALUES (?, ?, ?)
            """,
            ("source-alpha", first_ts, json.dumps({"source_id": "source-alpha", "timestamp": first_ts})),
        )
        conn.execute(
            """
            INSERT INTO runtime_history(source_id, timestamp, payload_json)
            VALUES (?, ?, ?)
            """,
            (
                "source-alpha",
                first_ts + 1.0,
                json.dumps({"source_id": "source-alpha", "timestamp": first_ts + 1.0}),
            ),
        )
        conn.commit()

        history = repo.get_history("source-alpha", limit=1)
        assert len(history) == 1
        assert history[0]["timestamp"] == first_ts + 1.0

        repo.clear_source("source-alpha")
        assert repo.get_latest("source-alpha") is None
        assert repo.get_history("source-alpha") == []
    finally:
        conn.close()


def test_resource_repo_crud_and_source_reference_cleanup(tmp_path):
    db_path = tmp_path / "storage.db"
    conn = create_sqlite_connection(db_path)
    repo = SqliteResourceRepository(conn)

    source = StoredSource(
        id="source-alpha",
        integration_id="integration-alpha",
        name="Alpha Source",
        config={"token": "abc"},
        vars={"region": "us"},
    )
    view = StoredView(
        id="view-alpha",
        name="Main View",
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
                props={"mode": "compact"},
            )
        ],
    )

    try:
        saved_source = repo.save_source(source)
        assert saved_source.id == "source-alpha"
        assert [s.id for s in repo.load_sources()] == ["source-alpha"]

        saved_view = repo.save_view(view)
        assert saved_view.id == "view-alpha"
        assert [v.id for v in repo.load_views()] == ["view-alpha"]

        reordered_views = repo.reorder_views(["view-alpha"])
        assert [v.id for v in reordered_views] == ["view-alpha"]
        assert [v.sort_index for v in reordered_views] == [0]

        affected_views = repo.remove_source_references_from_views("source-alpha")
        assert affected_views == ["view-alpha"]
        updated_view = repo.load_views()[0]
        assert updated_view.items == []

        assert repo.delete_source("source-alpha") is True
        assert repo.delete_source("source-alpha") is False
        assert repo.delete_view("view-alpha") is True
        assert repo.delete_view("view-alpha") is False
    finally:
        conn.close()


def test_resource_repo_load_views_orders_by_sort_index_then_id(tmp_path):
    db_path = tmp_path / "storage.db"
    conn = create_sqlite_connection(db_path)
    repo = SqliteResourceRepository(conn)

    views = [
        StoredView(
            id="view-b",
            name="View B",
            sort_index=2,
            layout_columns=12,
            items=[],
        ),
        StoredView(
            id="view-c",
            name="View C",
            sort_index=1,
            layout_columns=12,
            items=[],
        ),
        StoredView(
            id="view-a",
            name="View A",
            sort_index=1,
            layout_columns=12,
            items=[],
        ),
    ]

    try:
        for view in views:
            repo.save_view(view)
        assert [view.id for view in repo.load_views()] == [
            "view-a",
            "view-c",
            "view-b",
        ]
    finally:
        conn.close()


def test_resource_repo_reorder_views_updates_sort_index_atomically(tmp_path):
    db_path = tmp_path / "storage.db"
    conn = create_sqlite_connection(db_path)
    repo = SqliteResourceRepository(conn)

    views = [
        StoredView(
            id="view-1",
            name="View 1",
            sort_index=0,
            layout_columns=12,
            items=[],
        ),
        StoredView(
            id="view-2",
            name="View 2",
            sort_index=1,
            layout_columns=12,
            items=[],
        ),
    ]

    try:
        for view in views:
            repo.save_view(view)

        reordered_views = repo.reorder_views(["view-2", "view-1"])
        assert [view.id for view in reordered_views] == ["view-2", "view-1"]
        assert [view.sort_index for view in reordered_views] == [0, 1]
        assert [view.id for view in repo.load_views()] == ["view-2", "view-1"]
    finally:
        conn.close()


def test_create_app_wires_shared_storage_contract(monkeypatch, tmp_path):
    captured: dict[str, object] = {}

    class _FakeDataController:
        def __init__(self, *, storage):
            captured["data_storage"] = storage

        def close(self):
            return None

    class _FakeResourceManager:
        def __init__(self, *, storage):
            captured["resource_storage"] = storage

        def load_sources(self):
            return []

    class _FakeSettingsManager:
        def __init__(self):
            self.settings_file = tmp_path / "data" / "settings.json"

        def load_settings(self):
            return SystemSettings()

        def save_settings(self, settings: SystemSettings):
            return None

    fake_secrets = SimpleNamespace(
        inject_settings_manager=lambda _settings: None,
        inject_master_key_provider=lambda _provider: None,
    )

    monkeypatch.setattr(main_module, "seed_first_launch_workspace", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(main_module, "load_config", lambda: AppConfig())
    monkeypatch.setattr(main_module, "DataController", _FakeDataController)
    monkeypatch.setattr(main_module, "ResourceManager", _FakeResourceManager)
    monkeypatch.setattr(main_module, "SettingsManager", _FakeSettingsManager)
    monkeypatch.setattr(main_module, "SecretsController", lambda: fake_secrets)
    monkeypatch.setattr(
        main_module,
        "AuthManager",
        lambda _secrets, app_config, settings_manager=None: SimpleNamespace(),
    )
    def _build_fake_executor(_dc, _sc, _sm, **kwargs):
        captured["executor_kwargs"] = kwargs
        return SimpleNamespace(get_source_state=lambda _source_id: None)

    monkeypatch.setattr(main_module, "Executor", _build_fake_executor)
    monkeypatch.setattr(main_module, "IntegrationManager", lambda: SimpleNamespace())
    monkeypatch.setattr(
        main_module,
        "RefreshScheduler",
        lambda **_kwargs: SimpleNamespace(start=lambda: None, stop=lambda: None),
    )
    monkeypatch.setattr(main_module.api, "init_api", lambda **kwargs: captured.setdefault("api_kwargs", kwargs))

    main_module.create_app()

    data_storage = captured["data_storage"]
    resource_storage = captured["resource_storage"]
    assert data_storage is resource_storage
    assert isinstance(data_storage.settings, SettingsAdapter)
    assert data_storage.trust_rules is not None
    executor_kwargs = captured["executor_kwargs"]
    assert executor_kwargs.get("network_trust_policy") is not None
    api_kwargs = captured["api_kwargs"]
    assert api_kwargs.get("network_trust_policy") is not None
    assert api_kwargs.get("trust_rule_repo") is not None


def test_settings_adapter_writes_to_settings_json(tmp_path):
    settings_dir = tmp_path / "data"
    manager = SettingsManager(settings_dir=settings_dir)
    adapter = SettingsAdapter(manager)

    loaded = adapter.load_settings()
    updated = loaded.model_copy(update={"language": "zh"})
    adapter.save_settings(updated)

    settings_file = settings_dir / "settings.json"
    payload = json.loads(settings_file.read_text(encoding="utf-8"))
    assert payload["language"] == "zh"


def test_runtime_repo_migration_upsert_preserves_timestamps_and_returns_source_ids(tmp_path):
    db_path = tmp_path / "storage.db"
    conn = create_sqlite_connection(db_path)
    repo = SqliteRuntimeRepository(conn)

    records = [
        {
            "source_id": "source-alpha",
            "data": {"value": 1},
            "updated_at": 101.0,
            "last_success_at": 100.0,
        },
        {
            "source_id": "source-beta",
            "status": "error",
            "error": "failure",
            "updated_at": 88.0,
            "last_success_at": None,
        },
        {
            "source_id": "source-alpha",
            "data": {"value": 2},
            "updated_at": 111.0,
            "last_success_at": 109.0,
        },
    ]

    try:
        migrated_source_ids = repo.upsert_migration_latest(records)
        assert migrated_source_ids == ["source-alpha", "source-beta"]

        latest_alpha = repo.get_latest("source-alpha")
        latest_beta = repo.get_latest("source-beta")
        assert latest_alpha is not None
        assert latest_beta is not None
        assert latest_alpha["data"] == {"value": 2}
        assert latest_alpha["updated_at"] == 111.0
        assert latest_alpha["last_success_at"] == 109.0
        assert latest_beta["updated_at"] == 88.0
        assert latest_beta["last_success_at"] is None
    finally:
        conn.close()


def test_resource_repo_migration_upsert_batches_sources_and_views(tmp_path):
    db_path = tmp_path / "storage.db"
    conn = create_sqlite_connection(db_path)
    repo = SqliteResourceRepository(conn)

    sources = [
        StoredSource(
            id="source-alpha",
            integration_id="integration-alpha",
            name="Alpha Source",
            config={"token": "abc"},
            vars={"region": "us"},
        ),
        StoredSource(
            id="source-beta",
            integration_id="integration-beta",
            name="Beta Source",
            config={"token": "xyz"},
            vars={"region": "eu"},
        ),
        StoredSource(
            id="source-alpha",
            integration_id="integration-alpha",
            name="Alpha Source Updated",
            config={"token": "def"},
            vars={"region": "us-east"},
        ),
    ]
    views = [
        StoredView(
            id="view-alpha",
            name="Alpha View",
            layout_columns=12,
            items=[],
        ),
        StoredView(
            id="view-beta",
            name="Beta View",
            layout_columns=24,
            items=[],
        ),
        StoredView(
            id="view-alpha",
            name="Alpha View Updated",
            layout_columns=12,
            items=[],
        ),
    ]

    try:
        migrated_source_ids = repo.upsert_migration_sources(sources)
        migrated_view_ids = repo.upsert_migration_views(views)

        assert migrated_source_ids == ["source-alpha", "source-beta"]
        assert migrated_view_ids == ["view-alpha", "view-beta"]
        assert [source.id for source in repo.load_sources()] == ["source-alpha", "source-beta"]
        assert [view.id for view in repo.load_views()] == ["view-alpha", "view-beta"]
        assert repo.get_source("source-alpha") is not None
        assert repo.get_source("source-alpha").name == "Alpha Source Updated"  # type: ignore[union-attr]
        assert repo.get_view("view-alpha") is not None
        assert repo.get_view("view-alpha").name == "Alpha View Updated"  # type: ignore[union-attr]
    finally:
        conn.close()


def test_migration_upsert_apis_run_in_single_begin_immediate_transaction(tmp_path):
    db_path = tmp_path / "storage.db"
    connection = create_sqlite_connection(db_path)
    spy = SqlConnectionSpy(connection)
    runtime_repo = SqliteRuntimeRepository(spy)  # type: ignore[arg-type]
    resource_repo = SqliteResourceRepository(spy)  # type: ignore[arg-type]

    runtime_records = [
        {"source_id": "source-alpha", "data": {"value": 1}, "updated_at": 10.0, "last_success_at": 9.0},
        {"source_id": "source-beta", "data": {"value": 2}, "updated_at": 20.0, "last_success_at": 19.0},
    ]
    source_batch = [
        StoredSource(
            id="source-alpha",
            integration_id="integration-alpha",
            name="Alpha Source",
            config={},
            vars={},
        ),
        StoredSource(
            id="source-beta",
            integration_id="integration-beta",
            name="Beta Source",
            config={},
            vars={},
        ),
    ]
    view_batch = [
        StoredView(
            id="view-alpha",
            name="Alpha View",
            layout_columns=12,
            items=[],
        ),
        StoredView(
            id="view-beta",
            name="Beta View",
            layout_columns=24,
            items=[],
        ),
    ]

    try:
        runtime_repo.upsert_migration_latest(runtime_records)
        begin_after_runtime = len([sql for sql in spy.sql_statements if "BEGIN IMMEDIATE" in sql])
        assert begin_after_runtime == 1

        resource_repo.upsert_migration_sources(source_batch)
        begin_after_sources = len([sql for sql in spy.sql_statements if "BEGIN IMMEDIATE" in sql])
        assert begin_after_sources == 2

        resource_repo.upsert_migration_views(view_batch)
        begin_after_views = len([sql for sql in spy.sql_statements if "BEGIN IMMEDIATE" in sql])
        assert begin_after_views == 3
    finally:
        connection.close()


def test_runtime_repo_mutations_run_in_begin_immediate_transaction(tmp_path):
    db_path = tmp_path / "storage.db"
    connection = create_sqlite_connection(db_path)
    spy = SqlConnectionSpy(connection)
    repo = SqliteRuntimeRepository(spy)  # type: ignore[arg-type]

    try:
        repo.upsert("source-alpha", {"value": 1})
        repo.set_state("source-alpha", status="running", message="ok")
        repo.clear_retry_metadata("source-alpha")
        repo.clear_source("source-alpha")
    finally:
        connection.close()

    assert any("BEGIN IMMEDIATE" in sql for sql in spy.sql_statements)


def test_resource_repo_mutations_run_in_begin_immediate_transaction(tmp_path):
    db_path = tmp_path / "storage.db"
    connection = create_sqlite_connection(db_path)
    spy = SqlConnectionSpy(connection)
    repo = SqliteResourceRepository(spy)  # type: ignore[arg-type]

    source = StoredSource(
        id="source-alpha",
        integration_id="integration-alpha",
        name="Alpha Source",
        config={},
        vars={},
    )
    view = StoredView(
        id="view-alpha",
        name="Main View",
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

    try:
        repo.save_source(source)
        repo.save_view(view)
        repo.reorder_views(["view-alpha"])
        repo.remove_source_references_from_views("source-alpha")
        repo.delete_source("source-alpha")
        repo.delete_view("view-alpha")
    finally:
        connection.close()

    assert any("BEGIN IMMEDIATE" in sql for sql in spy.sql_statements)
