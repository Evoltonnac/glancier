"""
HTTP Step Module.

This module handles the execution of HTTP requests within a source flow.
It performs the HTTP request using the specified method, URL, and headers,
respects proxy configurations if set, and correctly classifies any HTTP status
errors that occur during the request.

Args Schema:
    url (str): The destination URL.
    method (str, optional): The HTTP method (e.g., GET, POST). Defaults to 'GET'.
    headers (dict, optional): HTTP headers to include in the request.

Return Structure:
    dict: A dictionary containing:
        - http_response (dict): The parsed JSON response body (if valid JSON).
        - raw_data (str): The raw response text.
        - headers (dict): The response headers.
"""

import asyncio
import httpx
import ipaddress
from urllib.parse import urlsplit
from typing import Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from core.config_loader import StepConfig, SourceConfig
    from core.executor import Executor

_RETRYABLE_NETWORK_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
    httpx.RemoteProtocolError,
)

_ALLOWED_HTTP_SCHEMES = {"http", "https"}


def _sanitize_url_host(url: str) -> str:
    try:
        parsed = urlsplit(url)
    except Exception:
        return ""
    return (parsed.hostname or "").strip().lower()


def _is_private_target_host(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        target_ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    if target_ip.is_loopback or target_ip.is_link_local:
        return True
    if isinstance(target_ip, ipaddress.IPv4Address) and target_ip.is_private:
        return True
    return False


def _validate_http_target_url(url: str) -> None:
    parsed = urlsplit(url or "")
    scheme = (parsed.scheme or "").strip().lower()
    host = _sanitize_url_host(url)

    if scheme not in _ALLOWED_HTTP_SCHEMES:
        raise RuntimeError(f"http_target_blocked_scheme:{host}")
    if not host:
        raise RuntimeError("http_target_blocked_scheme:")
    if _is_private_target_host(host):
        raise RuntimeError(f"http_target_blocked_private:{host}")


async def execute_http_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: Dict[str, Any],
    context: Dict[str, Any],
    outputs: Dict[str, Any],
    executor: "Executor",
) -> Dict[str, Any]:
    """
    Executes an HTTP request step.

    Returns:
        Dict[str, Any]: output dictionary with http_response, raw_data, and headers.
    """
    url = args.get("url")
    method = args.get("method", "GET")
    headers = args.get("headers", {}).copy()
    timeout_seconds = float(args.get("timeout", 30.0))
    retries = int(args.get("retries", 2))
    backoff_seconds = float(args.get("retry_backoff_seconds", 0.5))
    retries = max(0, retries)
    backoff_seconds = max(0.0, backoff_seconds)
    _validate_http_target_url(str(url or ""))

    proxy_url = executor._get_proxy_url()
    client_kwargs: Dict[str, Any] = {
        "timeout": timeout_seconds,
    }
    if proxy_url:
        # Explicit proxy in app settings has highest priority.
        client_kwargs["trust_env"] = False
        client_kwargs["proxy"] = proxy_url
    else:
        # Fallback to system/env proxy settings when app proxy is unset.
        client_kwargs["trust_env"] = True

    async with httpx.AsyncClient(**client_kwargs) as client:
        for attempt in range(retries + 1):
            try:
                response = await client.request(method, url, headers=headers)
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as http_status_error:
                    classified_error = executor._classify_http_status_error(
                        source=source,
                        step=step,
                        error=http_status_error,
                    )
                    raise classified_error from http_status_error

                # Let the caller handle output mapping based on step.outputs
                # The executor's _run_flow logic maps keys from this dict to outputs.
                # However, for 'http_response', we might encounter JSON decode errors if it's not JSON.
                # We can try/except it.
                try:
                    json_resp = response.json()
                except Exception:
                    json_resp = None

                return {
                    "http_response": json_resp,
                    "raw_data": response.text,
                    "headers": dict(response.headers),
                }
            except _RETRYABLE_NETWORK_ERRORS as network_error:
                if attempt >= retries:
                    classified_error = executor._classify_http_network_error(
                        source=source,
                        step=step,
                        error=network_error,
                    )
                    raise classified_error from network_error
                if backoff_seconds > 0:
                    await asyncio.sleep(backoff_seconds * (2**attempt))
