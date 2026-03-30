# Deferred Items

## Out-of-scope pre-existing failures

1. `tests/core/test_executor_errors.py::test_script_stdout_and_stderr_are_captured_in_error_details`
- Discovery context: running `python -m pytest tests/core/test_sql_step.py tests/core/test_executor_errors.py -q` for plan `08-02`.
- Observed behavior: flow error details do not include script stdout/stderr lines.
- Scope reason: unrelated to SQL step runtime work in `08-02`.
