from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.config_loader import AppConfig
from core.data_controller import DataController
from core.models import StoredSource, StoredView, ViewItem
from core.resource_manager import ResourceManager
from core.secrets_controller import SecretsController
from core.storage.sqlite_connection import create_sqlite_connection
from core.storage.sqlite_trust_rule_repo import SqliteTrustRuleRepository


def _build_client(tmp_path):
    data_dir = tmp_path / "data"
    resource_manager = ResourceManager(data_dir=data_dir)
    data_controller = DataController(db_path=data_dir / "data.json")
    secrets_controller = SecretsController(secrets_dir=data_dir)
    trust_connection = create_sqlite_connection(data_dir / "storage.db")
    trust_rule_repo = SqliteTrustRuleRepository(trust_connection)

    api_module.init_api(
        executor=SimpleNamespace(get_source_state=lambda _source_id: None, _states={}),
        data_controller=data_controller,
        config=AppConfig(),
        auth_manager=SimpleNamespace(_handlers={}, clear_error=lambda _source_id: None),
        secrets_controller=secrets_controller,
        resource_manager=resource_manager,
        integration_manager=SimpleNamespace(),
        settings_manager=None,
        trust_rule_repo=trust_rule_repo,
    )

    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app), resource_manager, data_controller, secrets_controller, trust_rule_repo


def test_delete_source_cascades_data_secrets_and_view_bindings(tmp_path):
    client, resource_manager, data_controller, secrets_controller, trust_rule_repo = _build_client(tmp_path)

    source_a = StoredSource(
        id="source-a",
        integration_id="demo",
        name="Source A",
        config={},
        vars={},
    )
    source_b = StoredSource(
        id="source-b",
        integration_id="demo",
        name="Source B",
        config={},
        vars={},
    )
    resource_manager.save_source(source_a)
    resource_manager.save_source(source_b)

    trust_rule_repo.upsert_rule(
        capability="http",
        scope_type="source",
        source_id="source-a",
        target_type="host",
        target_value="127.0.0.1",
        decision="allow",
    )
    trust_rule_repo.upsert_rule(
        capability="http",
        scope_type="global",
        source_id=None,
        target_type="host",
        target_value="10.0.0.5",
        decision="deny",
    )

    data_controller.upsert("source-a", {"value": 1})
    data_controller.upsert("source-b", {"value": 2})

    secrets_controller.set_secret("source-a", "token", "a-token")
    secrets_controller.set_secret("source-b", "token", "b-token")

    resource_manager.save_view(
        StoredView(
            id="view-main",
            name="Main",
            layout_columns=12,
            items=[
                ViewItem(
                    id="item-a",
                    x=0,
                    y=0,
                    w=3,
                    h=3,
                    source_id="source-a",
                    template_id="metric",
                    props={},
                ),
                ViewItem(
                    id="item-b",
                    x=3,
                    y=0,
                    w=3,
                    h=3,
                    source_id="source-b",
                    template_id="metric",
                    props={},
                ),
            ],
        )
    )

    response = client.delete("/api/sources/source-a")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_id"] == "source-a"
    assert payload["cleanup"]["data_cleared"] is True
    assert payload["cleanup"]["secrets_cleared"] is True
    assert payload["cleanup"]["affected_view_count"] == 1
    assert payload["cleanup"]["affected_view_ids"] == ["view-main"]

    assert resource_manager.get_source("source-a") is None
    assert resource_manager.get_source("source-b") is not None

    assert data_controller.get_latest("source-a") is None
    assert data_controller.get_latest("source-b") is not None

    assert secrets_controller.get_secret("source-a", "token") is None
    assert secrets_controller.get_secret("source-b", "token") == "b-token"

    saved_view = resource_manager.get_view("view-main")
    assert saved_view is not None
    assert [item.source_id for item in saved_view.items] == ["source-b"]

    source_rule = trust_rule_repo.find_rule(
        capability="http",
        scope_type="source",
        source_id="source-a",
        target_type="host",
        target_value="127.0.0.1",
    )
    assert source_rule is None
    global_rule = trust_rule_repo.find_rule(
        capability="http",
        scope_type="global",
        source_id=None,
        target_type="host",
        target_value="10.0.0.5",
    )
    assert global_rule is not None
