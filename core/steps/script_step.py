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
import signal
import threading
import builtins
import ast
from contextlib import redirect_stderr, redirect_stdout
from typing import Dict, Any, TYPE_CHECKING
from core.log_redaction import sanitize_log_reason
from core.source_state import SourceStatus

if TYPE_CHECKING:
    from core.config_loader import StepConfig, SourceConfig
    from core.executor import Executor

logger = logging.getLogger(__name__)
_MISSING = object()
_DEFAULT_SCRIPT_TIMEOUT_SECONDS = 10
_MIN_SCRIPT_TIMEOUT_SECONDS = 1
_MAX_SCRIPT_TIMEOUT_SECONDS = 120
_BLOCKED_IMPORT_ROOTS = {"os", "subprocess", "socket", "pathlib"}
_ALLOWED_IMPORT_ROOTS = {
    "base64",
    "bisect",
    "calendar",
    "collections",
    "csv",
    "datetime",
    "decimal",
    "functools",
    "hashlib",
    "heapq",
    "hmac",
    "itertools",
    "json",
    "math",
    "operator",
    "pprint",
    "random",
    "re",
    "statistics",
    "string",
    "time",
    "textwrap",
    "unicodedata",
    "uuid",
}
_BLOCKED_BUILTIN_CALLS = {"open", "exec", "eval", "compile", "__import__"}
_ALLOWED_BUILTINS = {
    "abs",
    "all",
    "any",
    "bool",
    "dict",
    "enumerate",
    "filter",
    "float",
    "getattr",
    "hasattr",
    "int",
    "isinstance",
    "len",
    "list",
    "map",
    "max",
    "min",
    "pow",
    "print",
    "range",
    "reversed",
    "round",
    "set",
    "sorted",
    "str",
    "sum",
    "tuple",
    "zip",
    "Exception",
    "ValueError",
    "TypeError",
    "KeyError",
    "IndexError",
}


class ScriptTimeoutExceededError(Exception):
    def __init__(self, *, step_id: str, timeout_seconds: int):
        message = (
            f"Script step '{step_id}' exceeded timeout of "
            f"{timeout_seconds} second(s)"
        )
        self.code = "script_timeout_exceeded"
        self.summary = message
        self.details = message
        self.step_id = step_id
        super().__init__(message)


class ScriptSandboxBlockedError(Exception):
    def __init__(self, *, step_id: str, reason: str):
        message = f"Script sandbox blocked step '{step_id}': {reason}"
        self.code = "script_sandbox_blocked"
        self.summary = message
        self.details = message
        self.step_id = step_id
        super().__init__(message)


class _ScriptTimeoutGuard:
    def __init__(self, *, timeout_seconds: int, step_id: str):
        self._timeout_seconds = timeout_seconds
        self._step_id = step_id
        self._enabled = False
        self._previous_handler = None

    def _handle_timeout(self, _signum, _frame):
        raise ScriptTimeoutExceededError(
            step_id=self._step_id,
            timeout_seconds=self._timeout_seconds,
        )

    def __enter__(self):
        if (
            self._timeout_seconds <= 0
            or not hasattr(signal, "SIGALRM")
            or not hasattr(signal, "setitimer")
            or threading.current_thread() is not threading.main_thread()
        ):
            return self

        self._enabled = True
        self._previous_handler = signal.getsignal(signal.SIGALRM)
        signal.signal(signal.SIGALRM, self._handle_timeout)
        signal.setitimer(signal.ITIMER_REAL, float(self._timeout_seconds))
        return self

    def __exit__(self, _exc_type, _exc_val, _exc_tb):
        if not self._enabled:
            return False
        signal.setitimer(signal.ITIMER_REAL, 0.0)
        signal.signal(signal.SIGALRM, self._previous_handler)
        return False


def _resolve_script_runtime_controls(executor: "Executor") -> tuple[bool, int]:
    settings_manager = getattr(executor, "_settings_manager", None)
    if settings_manager is None:
        return False, _DEFAULT_SCRIPT_TIMEOUT_SECONDS
    try:
        settings = settings_manager.load_settings()
    except Exception:
        return False, _DEFAULT_SCRIPT_TIMEOUT_SECONDS

    sandbox_enabled = bool(getattr(settings, "script_sandbox_enabled", False))
    raw_timeout = getattr(settings, "script_timeout_seconds", _DEFAULT_SCRIPT_TIMEOUT_SECONDS)
    try:
        timeout_seconds = int(raw_timeout)
    except (TypeError, ValueError):
        timeout_seconds = _DEFAULT_SCRIPT_TIMEOUT_SECONDS
    if timeout_seconds < _MIN_SCRIPT_TIMEOUT_SECONDS or timeout_seconds > _MAX_SCRIPT_TIMEOUT_SECONDS:
        timeout_seconds = _DEFAULT_SCRIPT_TIMEOUT_SECONDS
    return sandbox_enabled, timeout_seconds


def _validate_script_sandbox(step_id: str, script_code: str) -> None:
    try:
        tree = ast.parse(script_code)
    except SyntaxError:
        return

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in _BLOCKED_IMPORT_ROOTS:
                    raise ScriptSandboxBlockedError(
                        step_id=step_id,
                        reason=f"import '{root}' is blocked",
                    )
                if root not in _ALLOWED_IMPORT_ROOTS:
                    raise ScriptSandboxBlockedError(
                        step_id=step_id,
                        reason=f"import '{root}' is not allowed",
                    )
        if isinstance(node, ast.ImportFrom):
            module_name = node.module or ""
            root = module_name.split(".")[0] if module_name else ""
            if root in _BLOCKED_IMPORT_ROOTS:
                raise ScriptSandboxBlockedError(
                    step_id=step_id,
                    reason=f"import '{root}' is blocked",
                )
            if root and root not in _ALLOWED_IMPORT_ROOTS:
                raise ScriptSandboxBlockedError(
                    step_id=step_id,
                    reason=f"import '{root}' is not allowed",
                )
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in _BLOCKED_BUILTIN_CALLS:
                raise ScriptSandboxBlockedError(
                    step_id=step_id,
                    reason=f"builtin '{node.func.id}' is blocked",
                )


def _build_sandbox_builtins(step_id: str) -> dict[str, Any]:
    safe_builtins: dict[str, Any] = {
        name: getattr(builtins, name)
        for name in _ALLOWED_BUILTINS
    }

    def _sandbox_import(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: A002
        root = str(name).split(".")[0]
        if root in _BLOCKED_IMPORT_ROOTS or root not in _ALLOWED_IMPORT_ROOTS:
            raise ScriptSandboxBlockedError(
                step_id=step_id,
                reason=f"import '{root}' is not allowed",
            )
        return builtins.__import__(name, globals, locals, fromlist, level)

    safe_builtins["__import__"] = _sandbox_import
    return safe_builtins


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
    
    sandbox_enabled, timeout_seconds = _resolve_script_runtime_controls(executor)
    execution_env = {**context, **outputs}
    execution_logs: list[str] = []
    if sandbox_enabled:
        _validate_script_sandbox(step.id, script_code)
        execution_env["__builtins__"] = _build_sandbox_builtins(step.id)

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

        with (
            redirect_stdout(stdout_relay),
            redirect_stderr(stderr_relay),
            _ScriptTimeoutGuard(timeout_seconds=timeout_seconds, step_id=step.id),
        ):
            compiled = compile(script_code, f"<step_{step.id}>", "exec")
            exec(compiled, execution_env, execution_env)
        
        output = {}
        if step.outputs:
            for _target_var, source_path in step.outputs.items():
                resolved = _resolve_script_path(execution_env, source_path)
                if resolved is not _MISSING:
                    output[source_path] = resolved
        if getattr(step, 'context', None):
            for _target_var, source_path in step.context.items():
                resolved = _resolve_script_path(execution_env, source_path)
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
