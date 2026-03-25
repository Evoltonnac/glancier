from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.source_update_events import SourceUpdateEventBus
from tests.helpers.mock_runtime import make_api_runtime, make_stored_source


def _build_client_with_bus(bus: SourceUpdateEventBus) -> TestClient:
    runtime = make_api_runtime(sources=[make_stored_source("source-1")], integrations={})
    runtime["data_controller"] = SimpleNamespace()
    runtime["executor"] = SimpleNamespace(get_source_state=lambda _source_id: None)
    runtime["settings_manager"] = None

    api_module.init_api(
        runtime["executor"],
        runtime["data_controller"],
        runtime["config"],
        runtime["auth_manager"],
        runtime["secrets_controller"],
        runtime["resource_manager"],
        runtime["integration_manager"],
        runtime["settings_manager"],
        source_update_bus=bus,
    )
    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app)


def test_ws_source_updates_delivers_replay_and_live_event():
    bus = SourceUpdateEventBus()
    first = bus.publish_source_updated("source-1", event_type="state_updated")
    client = _build_client_with_bus(bus)

    with client.websocket_connect(f"/api/ws/source-updates?since_seq={first['seq'] - 1}") as websocket:
        ready = websocket.receive_json()
        assert ready["event"] == "source.stream.ready"
        assert ready["sync_required"] is False
        assert ready["latest_seq"] >= first["seq"]

        replay_event = websocket.receive_json()
        assert replay_event["event"] == "source.updated"
        assert replay_event["source_id"] == "source-1"
        assert replay_event["seq"] == first["seq"]

        second = bus.publish_source_updated("source-1", event_type="detail_updated")
        live_event = websocket.receive_json()
        assert live_event["event"] == "source.updated"
        assert live_event["seq"] == second["seq"]
        assert live_event["event_type"] == "detail_updated"


def test_ws_source_updates_reports_history_gap_for_reconnect_reconciliation():
    bus = SourceUpdateEventBus(history_limit=2)
    bus.publish_source_updated("source-1", event_type="state_updated")
    bus.publish_source_updated("source-1", event_type="state_updated")
    bus.publish_source_updated("source-1", event_type="state_updated")

    client = _build_client_with_bus(bus)
    # Ask for seq=0 to simulate reconnect from a stale cursor older than retained history.
    with client.websocket_connect("/api/ws/source-updates?since_seq=0") as websocket:
        ready = websocket.receive_json()
        assert ready["event"] == "source.stream.ready"
        assert ready["sync_required"] is True

        sync_required = websocket.receive_json()
        assert sync_required["event"] == "source.sync_required"
        assert sync_required["reason"] == "history_gap"
