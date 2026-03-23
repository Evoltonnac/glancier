from __future__ import annotations

from types import SimpleNamespace

from core.network_proxy import build_httpx_proxy_kwargs, resolve_proxy_url


class _StubSettingsManager:
    def __init__(self, proxy: str):
        self._proxy = proxy

    def load_settings(self):
        return SimpleNamespace(proxy=self._proxy)


def test_resolve_proxy_url_trims_and_returns_none_for_blank():
    assert resolve_proxy_url(_StubSettingsManager("  ")) is None
    assert resolve_proxy_url(_StubSettingsManager(" http://127.0.0.1:7890 ")) == "http://127.0.0.1:7890"


def test_build_httpx_proxy_kwargs_prefers_settings_proxy():
    kwargs = build_httpx_proxy_kwargs(
        settings_manager=_StubSettingsManager("http://127.0.0.1:7890"),
        timeout=12,
    )

    assert kwargs["timeout"] == 12
    assert kwargs["trust_env"] is False
    assert kwargs["proxy"] == "http://127.0.0.1:7890"


def test_build_httpx_proxy_kwargs_falls_back_to_system_proxy():
    kwargs = build_httpx_proxy_kwargs(
        settings_manager=_StubSettingsManager(""),
        timeout=12,
    )

    assert kwargs["timeout"] == 12
    assert kwargs["trust_env"] is True
    assert "proxy" not in kwargs
