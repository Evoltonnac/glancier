"""
Script Step Module.

This module handles the execution of arbitrary Python scripts within a source flow.
It redirects stdout and stderr to capture runtime logs and updates the source state
with these logs during execution.

Args Schema:
    code (str): The Python code to execute.

Return Structure:
    dict: Any variables defined in `step.outputs` or `step.context` that were set
          within the script's local environment during execution.
"""

import logging
from contextlib import redirect_stderr, redirect_stdout
from typing import Dict, Any, TYPE_CHECKING
from core.log_redaction import sanitize_log_reason
from core.source_state import SourceStatus

if TYPE_CHECKING:
    from core.config_loader import StepConfig, SourceConfig
    from core.executor import Executor

logger = logging.getLogger(__name__)
_MISSING = object()


def _resolve_script_path(local_env: Dict[str, Any], source_path: str) -> Any:
    if source_path in local_env:
        return local_env[source_path]

    if "." not in source_path:
        return _MISSING

    current: Any = local_env
    for segment in source_path.split("."):
        if isinstance(current, dict) and segment in current:
            current = current[segment]
            continue
        return _MISSING
    return current


async def execute_script_step(
    step: "StepConfig",
    source: "SourceConfig",
    args: Dict[str, Any],
    context: Dict[str, Any],
    outputs: Dict[str, Any],
    executor: "Executor",
) -> Dict[str, Any]:
    """
    Executes a script step.
    
    Returns:
        Dict[str, Any]: output dictionary with the script results.
    """
    # Import locally
    from core.executor import _RuntimeStreamRelay

    script_code = args.get("code")
    if not isinstance(script_code, str) or not script_code:
        raise ValueError(f"Step {step.id} has use=script but no 'code' argument provided.")
    
    local_env = {**context, **outputs}
    execution_logs: list[str] = []

    try:
        def on_script_stream(stream: str, chunk: str):
            executor._append_runtime_logs(execution_logs, step.id, stream, chunk)
            executor._update_state(
                source.id,
                SourceStatus.ACTIVE,
                executor._build_runtime_message(step.id, execution_logs),
            )

        stdout_relay = _RuntimeStreamRelay(
            lambda text: on_script_stream("stdout", text),
        )
        stderr_relay = _RuntimeStreamRelay(
            lambda text: on_script_stream("stderr", text),
        )

        with redirect_stdout(stdout_relay), redirect_stderr(stderr_relay):
            compiled = compile(script_code, f"<step_{step.id}>", "exec")
            exec(compiled, {}, local_env)
        
        output = {}
        if step.outputs:
            for _target_var, source_path in step.outputs.items():
                resolved = _resolve_script_path(local_env, source_path)
                if resolved is not _MISSING:
                    output[source_path] = resolved
        if getattr(step, 'context', None):
            for _target_var, source_path in step.context.items():
                resolved = _resolve_script_path(local_env, source_path)
                if resolved is not _MISSING:
                    output[source_path] = resolved
                    
        return output
    except Exception as script_e:
        logger.error(
            "Script step failed source_id=%s step_id=%s reason=%s",
            source.id,
            step.id,
            sanitize_log_reason(script_e),
        )
        raise
