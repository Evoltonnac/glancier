from __future__ import annotations

import asyncio
import gc
import weakref
from collections import defaultdict
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from core.executor import Executor
from tests.factories import build_source_config


_tracked_test_clients: "weakref.WeakSet[TestClient]" = weakref.WeakSet()
_original_test_client_init = TestClient.__init__


def _tracking_test_client_init(self, *args, **kwargs):
    _original_test_client_init(self, *args, **kwargs)
    _tracked_test_clients.add(self)


TestClient.__init__ = _tracking_test_client_init


class InMemorySecrets:
    def __init__(self) -> None:
        self._store: dict[str, dict[str, object]] = defaultdict(dict)

    def get_secret(self, source_id: str, key: str):
        return self._store.get(source_id, {}).get(key)

    def set_secret(self, source_id: str, key: str, value):
        self._store[source_id][key] = value

    def delete_secret(self, source_id: str, key: str):
        self._store.get(source_id, {}).pop(key, None)

    def get_secrets(self, source_id: str):
        return dict(self._store.get(source_id, {}))

    def set_secrets(self, source_id: str, values: dict):
        self._store[source_id].update(values)


@pytest.fixture
def data_controller():
    controller = MagicMock()
    controller.set_state = MagicMock()
    controller.upsert = MagicMock()
    controller.get_latest = MagicMock(return_value=None)
    return controller


@pytest.fixture
def secrets_controller():
    return InMemorySecrets()


@pytest.fixture
def executor(data_controller, secrets_controller):
    return Executor(data_controller, secrets_controller)


@pytest.fixture
def source_builder():
    return build_source_config


@pytest.fixture(autouse=True)
def cleanup_test_clients():
    yield
    for client in list(_tracked_test_clients):
        try:
            client.close()
        except Exception:
            continue

    # Close any default loop created implicitly by sync code paths.
    try:
        loop = asyncio.get_event_loop_policy().get_event_loop()
    except RuntimeError:
        loop = None
    if loop is not None and not loop.is_running() and not loop.is_closed():
        loop.close()
        asyncio.set_event_loop(None)

    gc.collect()
