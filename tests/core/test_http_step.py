from __future__ import annotations

from types import SimpleNamespace

import pytest

from core.config_loader import StepType
from core.executor import NetworkTimeoutError
from core.network_trust.models import (
    NetworkTargetDeniedError,
    NetworkTargetInvalidError,
    NetworkTrustRequiredError,
    TrustDecision,
    TrustResolution,
)
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
        _classify_http_network_error=lambda source, step, error: error,
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
        _classify_http_network_error=lambda source, step, error: NetworkTimeoutError(
            source_id=source.id,
            step_id=step.id,
            message=str(error),
        ),
    )

    with pytest.raises(NetworkTimeoutError) as exc_info:
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
    assert exc_info.value.code == "runtime.network_timeout"
    assert captured_client_kwargs["trust_env"] is True
    assert "proxy" not in captured_client_kwargs


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("url", "error_type", "expected_code"),
    [
        (
            "http://127.0.0.1:8080/internal",
            NetworkTrustRequiredError,
            "runtime.network_trust_required",
        ),
        (
            "http://169.254.169.254/latest/meta-data",
            NetworkTrustRequiredError,
            "runtime.network_trust_required",
        ),
        ("file:///tmp/a", NetworkTargetInvalidError, "runtime.network_target_invalid"),
    ],
)
async def test_http_step_blocks_unsafe_target_urls(
    monkeypatch: pytest.MonkeyPatch,
    url: str,
    error_type: type[Exception],
    expected_code: str,
):
    class FakeAsyncClient:
        def __init__(self, **kwargs):
            _ = kwargs

        async def __aenter__(self):
            raise AssertionError("AsyncClient should not be initialized for blocked targets")

        async def __aexit__(self, exc_type, exc, tb):
            _ = (exc_type, exc, tb)
            return None

    import core.steps.http_step as http_step_module

    monkeypatch.setattr(http_step_module.httpx, "AsyncClient", FakeAsyncClient)

    step = build_step(step_id="fetch", use=StepType.HTTP)
    source = build_source_config(source_id="source-http", flow=[step])
    executor = SimpleNamespace(
        _get_proxy_url=lambda: None,
        _classify_http_status_error=lambda source, step, error: error,
        _classify_http_network_error=lambda source, step, error: error,
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.PROMPT,
                reason="default",
            )
        ),
    )

    with pytest.raises(error_type) as exc_info:
        await execute_http_step(
            step,
            source,
            {
                "url": url,
                "method": "GET",
                "headers": {},
            },
            {},
            {},
            executor,
        )
    assert getattr(exc_info.value, "code", "") == expected_code


@pytest.mark.asyncio
async def test_http_step_denies_private_target_when_policy_denies(monkeypatch: pytest.MonkeyPatch):
    class FakeAsyncClient:
        def __init__(self, **kwargs):
            _ = kwargs

        async def __aenter__(self):
            raise AssertionError("AsyncClient should not be initialized for denied private targets")

        async def __aexit__(self, exc_type, exc, tb):
            _ = (exc_type, exc, tb)
            return None

    import core.steps.http_step as http_step_module

    monkeypatch.setattr(http_step_module.httpx, "AsyncClient", FakeAsyncClient)

    step = build_step(step_id="fetch", use=StepType.HTTP)
    source = build_source_config(source_id="source-http", flow=[step])
    executor = SimpleNamespace(
        _get_proxy_url=lambda: None,
        _classify_http_status_error=lambda source, step, error: error,
        _classify_http_network_error=lambda source, step, error: error,
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.DENY,
                reason="source_rule",
            )
        ),
    )

    with pytest.raises(NetworkTargetDeniedError) as exc_info:
        await execute_http_step(
            step,
            source,
            {
                "url": "http://127.0.0.1:8080/internal",
                "method": "GET",
                "headers": {},
            },
            {},
            {},
            executor,
        )

    assert exc_info.value.code == "runtime.network_target_denied"


@pytest.mark.asyncio
async def test_http_step_allows_private_target_when_policy_allows(monkeypatch: pytest.MonkeyPatch):
    calls = {"count": 0}

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
            calls["count"] += 1
            return _FakeResponse({"allowed": True})

    import core.steps.http_step as http_step_module

    monkeypatch.setattr(http_step_module.httpx, "AsyncClient", FakeAsyncClient)

    step = build_step(step_id="fetch", use=StepType.HTTP)
    source = build_source_config(source_id="source-http", flow=[step])
    executor = SimpleNamespace(
        _get_proxy_url=lambda: None,
        _classify_http_status_error=lambda source, step, error: error,
        _classify_http_network_error=lambda source, step, error: error,
        _network_trust_policy=SimpleNamespace(
            evaluate=lambda **_kwargs: TrustResolution(
                decision=TrustDecision.ALLOW,
                reason="source_rule",
            )
        ),
    )

    result = await execute_http_step(
        step,
        source,
        {
            "url": "http://127.0.0.1:8080/internal",
            "method": "GET",
            "headers": {},
        },
        {},
        {},
        executor,
    )

    assert calls["count"] == 1
    assert result["http_response"] == {"allowed": True}
