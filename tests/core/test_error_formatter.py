from __future__ import annotations

import pytest

from core.config_loader import StepType
from core.error_formatter import build_error_envelope, format_runtime_error
from core.source_state import SourceStatus
from tests.factories import build_source_config, build_step


class _StructuredRuntimeError(Exception):
    def __init__(self) -> None:
        self.code = "runtime.structured"
        self.summary = "Structured summary"
        self.details = "Structured details"
        self.step_id = "step-1"
        super().__init__(self.summary)


def test_build_error_envelope_normalizes_empty_values() -> None:
    envelope = build_error_envelope(code=" ", summary="", details=None, step_id=" ")
    assert envelope == {
        "code": "runtime.unexpected_error",
        "summary": "Unexpected runtime error",
        "details": "Unexpected runtime error",
    }


def test_format_runtime_error_prefers_structured_exception_fields() -> None:
    formatted = format_runtime_error(_StructuredRuntimeError())
    assert formatted == {
        "code": "runtime.structured",
        "summary": "Structured summary",
        "details": "Structured details",
        "step_id": "step-1",
    }


def test_format_runtime_error_appends_traceback_when_requested() -> None:
    try:
        raise RuntimeError("boom")
    except RuntimeError as exc:
        formatted = format_runtime_error(exc, include_traceback=True)

    assert formatted["summary"] == "boom"
    assert "Raw traceback:" in formatted["details"]


@pytest.mark.asyncio
async def test_executor_persists_formatted_summary_and_details(executor, data_controller) -> None:
    source = build_source_config(
        source_id="format-error-source",
        flow=[
            build_step(
                step_id="script",
                use=StepType.SCRIPT,
                args={"code": "raise RuntimeError('broken-runtime')"},
            ),
        ],
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ERROR
    assert state.message is not None
    assert "broken-runtime" in state.message

    error_calls = [
        call.kwargs
        for call in data_controller.set_state.call_args_list
        if call.kwargs.get("status") == SourceStatus.ERROR.value
    ]
    assert error_calls
    last_error_call = error_calls[-1]
    assert "Flow halted at step 'script': broken-runtime" in last_error_call["error"]
    assert "Raw traceback:" in (last_error_call["message"] or "")
