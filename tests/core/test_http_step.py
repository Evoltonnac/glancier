from __future__ import annotations

from types import SimpleNamespace

import pytest

from core.config_loader import StepType
from core.steps.http_step import execute_http_step
from tests.factories import build_source_config, build_step


class _FakeResponse:
    def __init__(self, payload: dict | None = None):
        self._payload = payload or {"ok": True}
        self.text = '{"ok": true}'
        self.headers = {"content-type": "application/json"}

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


@pytest.mark.asyncio
async def test_http_step_retries_connect_error(monkeypatch: pytest.MonkeyPatch):
    calls = {"count": 0}
    captured_client_kwargs: dict = {}

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            captured_client_kwargs.update(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            _ = (exc_type, exc, tb)
            return None

        async def request(self, method, url, headers=None):
            _ = (method, url, headers)
            calls["count"] += 1
            if calls["count"] == 1:
                import httpx

                raise httpx.ConnectError(
                    "temporary connect failure",
                    request=httpx.Request("GET", "https://example.com"),
                )
            return _FakeResponse()

    import core.steps.http_step as http_step_module

    monkeypatch.setattr(http_step_module.httpx, "AsyncClient", FakeAsyncClient)

    step = build_step(step_id="fetch", use=StepType.HTTP)
    source = build_source_config(source_id="source-http", flow=[step])
    executor = SimpleNamespace(
        _get_proxy_url=lambda: "http://127.0.0.1:7890",
        _classify_http_status_error=lambda source, step, error: error,
    )

    result = await execute_http_step(
        step,
        source,
        {
            "url": "https://example.com",
            "method": "GET",
            "headers": {},
            "retries": 2,
            "retry_backoff_seconds": 0,
        },
        {},
        {},
        executor,
    )

    assert calls["count"] == 2
    assert result["http_response"] == {"ok": True}
    assert captured_client_kwargs["trust_env"] is False
    assert captured_client_kwargs["proxy"] == "http://127.0.0.1:7890"


@pytest.mark.asyncio
async def test_http_step_raises_after_retry_exhausted(monkeypatch: pytest.MonkeyPatch):
    class FakeAsyncClient:
        def __init__(self, **kwargs):
            _ = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            _ = (exc_type, exc, tb)
            return None

        async def request(self, method, url, headers=None):
            _ = (method, url, headers)
            import httpx

            raise httpx.ConnectTimeout(
                "connect timeout",
                request=httpx.Request("GET", "https://example.com"),
            )

    import core.steps.http_step as http_step_module

    monkeypatch.setattr(http_step_module.httpx, "AsyncClient", FakeAsyncClient)

    step = build_step(step_id="fetch", use=StepType.HTTP)
    source = build_source_config(source_id="source-http", flow=[step])
    executor = SimpleNamespace(
        _get_proxy_url=lambda: None,
        _classify_http_status_error=lambda source, step, error: error,
    )

    import httpx

    with pytest.raises(httpx.ConnectTimeout):
        await execute_http_step(
            step,
            source,
            {
                "url": "https://example.com",
                "method": "GET",
                "headers": {},
                "retries": 1,
                "retry_backoff_seconds": 0,
            },
            {},
            {},
            executor,
        )
