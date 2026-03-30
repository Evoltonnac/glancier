from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.config_loader import AppConfig, IntegrationConfig
from core.models import StoredSource, StoredView


class InMemoryResourceManager:
    def __init__(self) -> None:
        self.sources = [
            StoredSource(
                id="demo-source",
                integration_id="demo",
                name="Demo Source",
                config={},
                vars={},
            )
        ]
        self.views: list[StoredView] = []

    def load_sources(self):
        return list(self.sources)

    def load_views(self):
        return list(self.views)

    def save_view(self, view: StoredView):
        for index, existing in enumerate(self.views):
            if existing.id == view.id:
                self.views[index] = view
                return view
        self.views.append(view)
        return view

    def reorder_views(self, ordered_view_ids: list[str]) -> list[StoredView]:
        unique_ordered_view_ids = list(dict.fromkeys(ordered_view_ids))
        if len(unique_ordered_view_ids) != len(ordered_view_ids):
            raise ValueError("Duplicate view ids are not allowed")

        if len(unique_ordered_view_ids) != len(self.views):
            raise ValueError("ordered_view_ids must include each existing view exactly once")

        view_by_id = {view.id: view for view in self.views}
        if set(unique_ordered_view_ids) != set(view_by_id):
            raise ValueError("ordered_view_ids must include each existing view exactly once")

        reordered = [
            view_by_id[view_id].model_copy(update={"sort_index": index})
            for index, view_id in enumerate(unique_ordered_view_ids)
        ]
        self.views = list(reordered)
        return list(reordered)


def _build_client(
    *,
    template_title: str = "Demo Card",
    resource_manager: InMemoryResourceManager | None = None,
):
    integration = IntegrationConfig.model_validate(
        {
            "id": "demo",
            "templates": [
                {
                    "id": "demo_template",
                    "type": "source_card",
                    "ui": {"title": template_title, "icon": "D"},
                    "widgets": [{"type": "TextBlock", "text": "{value}"}],
                }
            ],
        }
    )

    if resource_manager is None:
        resource_manager = InMemoryResourceManager()
    api_module.init_api(
        executor=SimpleNamespace(get_source_state=lambda _source_id: None),
        data_controller=SimpleNamespace(),
        config=AppConfig(integrations=[integration]),
        auth_manager=SimpleNamespace(),
        secrets_controller=SimpleNamespace(),
        resource_manager=resource_manager,
        integration_manager=SimpleNamespace(),
        settings_manager=None,
    )
    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app), resource_manager


def _build_view_payload(props: dict | None = None) -> dict:
    item_payload = {
        "id": "widget-1",
        "x": 0,
        "y": 0,
        "w": 4,
        "h": 4,
        "source_id": "demo-source",
        "template_id": "demo_template",
    }
    if props is not None:
        item_payload["props"] = props
    return {
        "id": "starter_pack_overview",
        "name": "Starter",
        "layout_columns": 12,
        "items": [item_payload],
    }


def test_create_view_returns_hydrated_props_but_stores_only_overrides():
    client, resource_manager = _build_client()

    response = client.post("/api/views", json=_build_view_payload())

    assert response.status_code == 200
    payload = response.json()
    props = payload["items"][0]["props"]

    assert payload["sort_index"] == 0
    assert props["id"] == "demo_template"
    assert props["type"] == "source_card"
    assert props["ui"]["title"] == "Demo Card"
    assert resource_manager.views[0].items[0].props == {}


def test_list_views_syncs_with_latest_template_after_config_change():
    initial_client, resource_manager = _build_client(template_title="Demo Card")

    create_response = initial_client.post(
        "/api/views",
        json=_build_view_payload(
            props={
                "id": "demo_template",
                "type": "source_card",
                "ui": {"title": "Demo Card", "icon": "D"},
                "widgets": [{"type": "TextBlock", "text": "{value}"}],
            }
        ),
    )
    assert create_response.status_code == 200
    assert resource_manager.views[0].items[0].props == {}

    updated_client, _ = _build_client(
        template_title="Demo Card Updated",
        resource_manager=resource_manager,
    )

    response = updated_client.get("/api/views")
    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["items"][0]["props"]["ui"]["title"] == "Demo Card Updated"


def test_list_views_ignores_legacy_template_snapshots():
    resource_manager = InMemoryResourceManager()
    resource_manager.views.append(
        StoredView.model_validate(
            {
                "id": "starter_pack_overview",
                "name": "Starter",
                "layout_columns": 12,
                "items": [
                    {
                        "id": "widget-1",
                        "x": 0,
                        "y": 0,
                        "w": 4,
                        "h": 4,
                        "source_id": "demo-source",
                        "template_id": "demo_template",
                        "props": {
                            "id": "demo_template",
                            "type": "source_card",
                            "ui": {"title": "Old Snapshot Title", "icon": "D"},
                            "widgets": [{"type": "TextBlock", "text": "{value}"}],
                        },
                    }
                ],
            }
        )
    )

    client, _ = _build_client(
        template_title="Demo Card Latest",
        resource_manager=resource_manager,
    )

    response = client.get("/api/views")
    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["items"][0]["props"]["ui"]["title"] == "Demo Card Latest"


def test_reorder_views_updates_sort_index_and_response_order():
    client, resource_manager = _build_client()

    first = client.post(
        "/api/views",
        json={**_build_view_payload(), "id": "view-1", "name": "View 1"},
    )
    second = client.post(
        "/api/views",
        json={**_build_view_payload(), "id": "view-2", "name": "View 2"},
    )
    assert first.status_code == 200
    assert second.status_code == 200

    reorder_response = client.post(
        "/api/views/reorder",
        json={"ordered_view_ids": ["view-2", "view-1"]},
    )

    assert reorder_response.status_code == 200
    reordered_payload = reorder_response.json()
    assert [view["id"] for view in reordered_payload] == ["view-2", "view-1"]
    assert [view["sort_index"] for view in reordered_payload] == [0, 1]
    assert [view.id for view in resource_manager.views] == ["view-2", "view-1"]


def test_reorder_views_rejects_duplicate_ids():
    client, _ = _build_client()

    client.post("/api/views", json={**_build_view_payload(), "id": "view-1", "name": "View 1"})
    client.post("/api/views", json={**_build_view_payload(), "id": "view-2", "name": "View 2"})

    response = client.post(
        "/api/views/reorder",
        json={"ordered_view_ids": ["view-2", "view-2"]},
    )
    assert response.status_code == 400
