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

import httpx
from typing import Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from core.config_loader import StepConfig, SourceConfig
    from core.executor import Executor


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

    proxy_url = executor._get_proxy_url()
    client_kwargs = {}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    async with httpx.AsyncClient(**client_kwargs) as client:
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
