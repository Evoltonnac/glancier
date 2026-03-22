from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from core import api as api_module
from core.config_loader import IntegrationConfig
from core.models import StoredSource
from core.scraper_task_store import ScraperTaskStore
from core.source_state import InteractionType, SourceStatus

_INTERNAL_TOKEN_ENV = "GLANCEUS_INTERNAL_TOKEN"
_INTERNAL_TOKEN = "internal-test-token"


class _StubResourceManager:
    def __init__(self, sources: list[StoredSource]) -> None:
        self._sources = sources

    def load_sources(self) -> list[StoredSource]:
        return list(self._sources)


class _StubConfig:
    def __init__(self, integration: IntegrationConfig) -> None:
        self._integration = integration
        self.integrations = [integration]

    def get_integration(self, integration_id: str):
        if integration_id == self._integration.id:
            return self._integration
        return None


class _StubSecrets:
    def __init__(self) -> None:
        self.values: dict[tuple[str, str], object] = {}

    def set_secret(self, source_id: str, key: str, value):
        self.values[(source_id, key)] = value


def _build_client(tmp_path):
    os.environ[_INTERNAL_TOKEN_ENV] = _INTERNAL_TOKEN
    store = ScraperTaskStore(tmp_path / "scraper_tasks.json")
    source = StoredSource(
        id="source-1",
        integration_id="demo",
        name="Demo Source",
        config={},
        vars={},
    )
    integration = IntegrationConfig(id="demo", flow=[], templates=[])
    executor = SimpleNamespace(
        get_source_state=lambda _source_id: SimpleNamespace(interaction=None),
        _update_state=MagicMock(),
        fetch_source=MagicMock(),
    )
    secrets = _StubSecrets()
    api_module.init_api(
        executor,
        data_controller=SimpleNamespace(),
        config=_StubConfig(integration),
        auth_manager=SimpleNamespace(),
        secrets_controller=secrets,
        resource_manager=_StubResourceManager([source]),
        integration_manager=SimpleNamespace(),
        settings_manager=None,
        scraper_task_store=store,
    )
    app = FastAPI()
    app.include_router(api_module.router)
    return TestClient(app, base_url="http://127.0.0.1"), store, executor, secrets


def _internal_headers(token: str = _INTERNAL_TOKEN) -> dict[str, str]:
    return {"X-Glanceus-Internal-Token": token}


def test_internal_auth_required_when_token_missing(tmp_path):
    client, _store, _executor, _secrets = _build_client(tmp_path)
    response = client.post(
        "/api/internal/scraper/claim",
        json={"worker_id": "daemon-1", "lease_seconds": 20},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "internal_auth_required"


def test_internal_auth_required_when_token_invalid(tmp_path):
    client, _store, _executor, _secrets = _build_client(tmp_path)
    response = client.post(
        "/api/internal/scraper/claim",
        headers=_internal_headers(token="wrong-token"),
        json={"worker_id": "daemon-1", "lease_seconds": 20},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "internal_auth_required"


def test_internal_claim_and_complete_is_idempotent(tmp_path):
    client, store, executor, secrets = _build_client(tmp_path)
    task = store.upsert_pending_task(
        source_id="source-1",
        step_id="webview",
        url="https://example.com/login",
        script="console.log('x')",
        intercept_api="/api",
        secret_key="webview_data",
    )

    claim = client.post(
        "/api/internal/scraper/claim",
        headers=_internal_headers(),
        json={"worker_id": "daemon-1", "lease_seconds": 30},
    )
    assert claim.status_code == 200
    claimed_task = claim.json()["task"]
    assert claimed_task["task_id"] == task["task_id"]
    assert claimed_task["attempt"] == 1

    complete = client.post(
        "/api/internal/scraper/complete",
        headers=_internal_headers(),
        json={
            "worker_id": "daemon-1",
            "source_id": "source-1",
            "task_id": claimed_task["task_id"],
            "attempt": claimed_task["attempt"],
            "data": {"token": "value"},
        },
    )
    assert complete.status_code == 200
    assert complete.json()["accepted"] is True
    assert complete.json()["idempotent"] is False
    assert secrets.values[("source-1", "webview_data")] == {"token": "value"}
    executor.fetch_source.assert_called_once()

    complete_again = client.post(
        "/api/internal/scraper/complete",
        headers=_internal_headers(),
        json={
            "worker_id": "daemon-1",
            "source_id": "source-1",
            "task_id": claimed_task["task_id"],
            "attempt": claimed_task["attempt"],
            "data": {"token": "value"},
        },
    )
    assert complete_again.status_code == 200
    assert complete_again.json()["accepted"] is True
    assert complete_again.json()["idempotent"] is True
    executor.fetch_source.assert_called_once()


def test_internal_fail_manual_required_suspends_with_webview_interaction(tmp_path):
    client, store, executor, _secrets = _build_client(tmp_path)
    task = store.upsert_pending_task(
        source_id="source-1",
        step_id="webview-step",
        url="https://example.com/login",
        script="",
        intercept_api="/api",
        secret_key="session_capture",
    )
    claimed = store.claim_next_task(worker_id="daemon-1", lease_seconds=10)
    assert claimed is not None

    failed = client.post(
        "/api/internal/scraper/fail",
        headers=_internal_headers(),
        json={
            "worker_id": "daemon-1",
            "source_id": "source-1",
            "task_id": task["task_id"],
            "attempt": claimed["attempt_count"],
            "error": "captcha required",
        },
    )
    assert failed.status_code == 200
    assert failed.json()["accepted"] is True
    assert failed.json()["idempotent"] is False

    executor._update_state.assert_called_once()
    call_args = executor._update_state.call_args
    assert call_args.args[0] == "source-1"
    assert call_args.args[1] == SourceStatus.SUSPENDED
    assert call_args.kwargs["error_code"] == "auth.manual_webview_required"
    interaction = call_args.kwargs["interaction"]
    assert interaction.type == InteractionType.WEBVIEW_SCRAPE
    assert interaction.data is not None
    assert interaction.data["manual_only"] is True
    assert "force_foreground" not in interaction.data
    assert interaction.data["task_id"] == task["task_id"]


def test_internal_fail_uncertain_marks_retryable_runtime_error(tmp_path):
    client, store, executor, _secrets = _build_client(tmp_path)
    task = store.upsert_pending_task(
        source_id="source-1",
        step_id="webview-step",
        url="https://example.com/dashboard",
        script="",
        intercept_api="/api",
        secret_key="session_capture",
    )
    claimed = store.claim_next_task(worker_id="daemon-1", lease_seconds=10)
    assert claimed is not None

    failed = client.post(
        "/api/internal/scraper/fail",
        headers=_internal_headers(),
        json={
            "worker_id": "daemon-1",
            "source_id": "source-1",
            "task_id": task["task_id"],
            "attempt": claimed["attempt_count"],
            "error": "runtime page navigation timeout in hidden window",
        },
    )
    assert failed.status_code == 200
    assert failed.json()["accepted"] is True
    assert failed.json()["idempotent"] is False

    executor._update_state.assert_called_once()
    call_args = executor._update_state.call_args
    assert call_args.args[0] == "source-1"
    assert call_args.args[1] == SourceStatus.ERROR
    assert call_args.args[2] == "runtime page navigation timeout in hidden window"
    assert call_args.kwargs["error_code"] == "runtime.retry_required"
    assert "interaction" not in call_args.kwargs


def test_internal_fail_is_idempotent_for_repeated_attempts(tmp_path):
    client, store, executor, _secrets = _build_client(tmp_path)
    task = store.upsert_pending_task(
        source_id="source-1",
        step_id="webview-step",
        url="https://example.com/dashboard",
        script="",
        intercept_api="/api",
        secret_key="session_capture",
    )
    claimed = store.claim_next_task(worker_id="daemon-1", lease_seconds=10)
    assert claimed is not None

    failed = client.post(
        "/api/internal/scraper/fail",
        headers=_internal_headers(),
        json={
            "worker_id": "daemon-1",
            "source_id": "source-1",
            "task_id": task["task_id"],
            "attempt": claimed["attempt_count"],
            "error": "runtime driver detached unexpectedly",
        },
    )
    assert failed.status_code == 200
    assert failed.json()["accepted"] is True
    assert failed.json()["idempotent"] is False

    failed_again = client.post(
        "/api/internal/scraper/fail",
        headers=_internal_headers(),
        json={
            "worker_id": "daemon-1",
            "source_id": "source-1",
            "task_id": task["task_id"],
            "attempt": claimed["attempt_count"],
            "error": "runtime driver detached unexpectedly",
        },
    )
    assert failed_again.status_code == 200
    assert failed_again.json()["accepted"] is True
    assert failed_again.json()["idempotent"] is True
    executor._update_state.assert_called_once()


def test_internal_complete_rejects_source_mismatch(tmp_path):
    client, store, _executor, _secrets = _build_client(tmp_path)
    task = store.upsert_pending_task(
        source_id="source-1",
        step_id="webview",
        url="https://example.com/login",
        script="",
        intercept_api="/api",
        secret_key="webview_data",
    )
    claimed = store.claim_next_task(worker_id="daemon-1", lease_seconds=10)
    assert claimed is not None

    response = client.post(
        "/api/internal/scraper/complete",
        headers=_internal_headers(),
        json={
            "worker_id": "daemon-1",
            "source_id": "other-source",
            "task_id": task["task_id"],
            "attempt": claimed["attempt_count"],
            "data": {"ok": True},
        },
    )
    assert response.status_code == 409


def test_internal_claim_rejects_non_localhost_client(tmp_path):
    client, _store, _executor, _secrets = _build_client(tmp_path)
    remote_client = TestClient(
        client.app,
        base_url="http://127.0.0.1",
        client=("203.0.113.10", 51234),
    )
    response = remote_client.post(
        "/api/internal/scraper/claim",
        headers=_internal_headers(),
        json={"worker_id": "daemon-1", "lease_seconds": 20},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Internal scraper endpoint is localhost-only"
