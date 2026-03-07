# 12-CONTEXT: Error Surfacing & Visibility

## Overview
This document captures the scope and implementation boundary for Phase 12. The focus is to make runtime failures visible, attributable, and actionable across critical flows before release hardening.

## Decisions

### 1. Flow Error UI
- **Execution Halt**: Step errors in a Data Source Flow (like Fetch or Script) must halt the entire execution immediately ("Fail Fast").
- **Error Location**: Show an error badge in the side sources panel. Clicking it will reveal the detailed error message.
- **Script Execution Output**: For script operations (CYL/Python), stream standard output and error (`stdout/stderr`) progressively during execution.
- **Persistence**: Store the error UI state persistently (e.g., in frontend state management) so that it remains if the user navigates away and returns.

### 2. Actionable Auth Errors
- **Scraper Failures**: When a WebScraper returns a 403, hits a login page, or times out, the task should be removed from the queue and a simple error message recorded. The user can then manually start the scraper task from the frontend to log in or investigate.
- **Auth Recovery**: For OAuth, API Key, and cURL step failures, display the flow handler in a "suspended" status to prompt user action.
- **cURL/CYL Authorization**: Proactively intercept non-authenticated state calls before they execute, rather than relying on parsing script output.
- **Raw Stack Traces**: Raw error traces and stack details from underlying tools must be hidden behind a toggle (e.g., "Show Details") rather than displayed by default.

### 3. YAML Error Mapping (Integration Editor)
- **Validation Approach**: Combine JSON schema specifications for validation. Rely on the frontend editor for precise schema validation.
- **Monaco YAML Integration**: Use the `monaco-yaml` plugin (backed by Red Hat's `yaml-language-server`). The frontend will define and inject a JSON Schema via `setDiagnosticsOptions` to automatically handle error squiggles, autocompletion, and hover docs with exact line/property positioning.
- **Debounce Editing**: Check and validate on edit with a debounce mechanism to clear or update markers instantly.
- **Backend Role**: The backend will simply return a generic structural error message on reload failure, leaving precise syntax and schema location to the frontend's Monaco-yaml integration.

## Code Context
- Backend runtime and flow execution:
  - `core/executor.py`
  - `core/source_state.py`
  - `core/api.py`
- Auth and integration-related components:
  - `ui-react/src/pages/Integrations.tsx`
  - `ui-react/src/api/client.ts`
  - related auth/scraper hooks and widgets in `ui-react/src/`
- Integration Schema Definition:
  - Add logic to serve or export JSON Schema for Monaco.
- Diagnostics baseline quick plan:
  - `.planning/quick/1-integration-editor/1-PLAN.md`

## Deferred Ideas
- Full release E2E matrix and release pipeline hardening remain in Phase 13.
