"""Proxy policy utilities for outbound HTTP clients."""

from __future__ import annotations

from typing import Any


def resolve_proxy_url(settings_manager: Any | None) -> str | None:
    """Resolve normalized proxy URL from settings; return None when unset."""
    if settings_manager is None:
        return None
    try:
        settings = settings_manager.load_settings()
    except Exception:
        return None

    raw_proxy = getattr(settings, "proxy", "")
    if not isinstance(raw_proxy, str):
        return None

    proxy = raw_proxy.strip()
    return proxy or None


def build_httpx_proxy_kwargs(
    *,
    settings_manager: Any | None,
    timeout: float | None = None,
) -> dict[str, Any]:
    """
    Build httpx client kwargs with a consistent proxy policy.

    Policy:
    - If proxy is configured in app settings, enforce it and disable env proxy lookup.
    - If proxy is not configured, allow httpx to use system/env proxy settings.
    """
    kwargs: dict[str, Any] = {}
    if timeout is not None:
        kwargs["timeout"] = timeout

    proxy_url = resolve_proxy_url(settings_manager)
    if proxy_url:
        kwargs["trust_env"] = False
        kwargs["proxy"] = proxy_url
    else:
        kwargs["trust_env"] = True

    return kwargs
