"""
Browser Step Module.

This module handles the execution of WEBVIEW steps, leveraging the underlying
Tauri/Rust webview scraper. It relies on the secrets manager to retrieve scraped
data and, if absent, triggers an InteractionRequest to start the background
scraping process.

Args Schema:
    url (str): The starting URL for the webview scraper.
    script (str, optional): JavaScript snippet to execute on the page.
    intercept_api (str, optional): API endpoint or pattern to intercept.

Return Structure:
    dict: A dictionary containing the scraped data. If `webview_data` is a mapping,
          its keys are merged into the top-level result.
          - webview_data (Any): the raw scraped object/data.
"""

from typing import Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from core.config_loader import StepConfig, SourceConfig
    from core.executor import Executor


def _secret_name_for_source(step: "StepConfig", source_path: str, default: str) -> str:
    if not step.secrets:
        return default
    for secret_name, mapped_path in step.secrets.items():
        if mapped_path == source_path:
            return secret_name
    return default


async def execute_browser_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: Dict[str, Any],
    context: Dict[str, Any],
    outputs: Dict[str, Any],
    executor: "Executor",
) -> Dict[str, Any]:
    """
    Executes a webview (browser) step.
    
    Checks if the scraper has already produced data for this step (stored in secrets).
    If not, it raises a RequiredSecretMissing to request a scraper run.
    Once read, it deletes the data from secrets so the next run triggers a fresh scrape.

    Returns:
        Dict[str, Any]: output dictionary with the webview data.
    """
    # Import locally to avoid circular dependencies
    from core.executor import RequiredSecretMissing
    from core.source_state import InteractionType

    secret_key = _secret_name_for_source(step, "webview_data", "webview_data")
    webview_data = executor._secrets.get_secret(source.id, secret_key)
    
    if not webview_data:
        url = args.get("url")
        script = args.get("script")
        intercept_api = args.get("intercept_api")
        
        if not url:
            raise ValueError(f"Step {step.id} has use=webview but no 'url' argument provided.")

        task = executor.upsert_scraper_task(
            source=source,
            step=step,
            args=args,
            secret_key=secret_key,
        )
        task_id = task.get("task_id") if isinstance(task, dict) else None
        
        raise RequiredSecretMissing(
            source_id=source.id,
            step_id=step.id,
            interaction_type=InteractionType.WEBVIEW_SCRAPE,
            fields=[],
            title=args.get("title"),
            description=args.get("description"),
            message=args.get("message"),
            warning_message=args.get("warning_message"),
            code="auth.manual_webview_required",
            data={
                "task_id": task_id,
                "url": url,
                "script": script,
                "intercept_api": intercept_api,
                "secret_key": secret_key
            }
        )
    
    output = {"webview_data": webview_data}
    if isinstance(webview_data, dict):
        for k, v in webview_data.items():
            output[k] = v

    # Clear webview data from secrets immediately so that
    # the next fetch (e.g. manual refresh) will prompt a new webview scrape
    executor._secrets.delete_secret(source.id, secret_key)
    
    return output
