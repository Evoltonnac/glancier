---
phase: quick
plan: 6
type: execute
wave: 1
depends_on: []
files_modified:
  - ui-react/src/pages/Integrations.tsx
  - core/api.py
autonomous: true
requirements: []
must_haves:
  truths:
    - User sees an error message in frontend form when entering a duplicate integration name.
    - Submit button is disabled when a duplicate integration name is entered.
    - Python API rejects duplicate integration name creation and returns an error.
  artifacts:
    - path: ui-react/src/pages/Integrations.tsx
      provides: Frontend validation logic and UI error state
    - path: core/api.py
      provides: Backend duplicate file check
  key_links: []
---

<objective>
Implement duplicate name checking when creating a new integration.
Purpose: Prevent users from accidentally overwriting existing integrations.
Output: Real-time UI validation and backend protection.
</objective>

<context>
@ui-react/src/pages/Integrations.tsx
@core/api.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add frontend validation for duplicate integration filename</name>
  <files>ui-react/src/pages/Integrations.tsx</files>
  <action>
    - In `IntegrationsPage` component, compute a `isDuplicateFilename` boolean that checks if the `newFilename` (with or without `.yaml` extension) exists in the `integrations` array (case-insensitive check).
    - Under the Integration ID input, display an error paragraph (using `text-destructive` color class) reading "An integration with this filename already exists." if a duplicate is detected.
    - Disable the "Create" button in the `DialogFooter` if `!newFilename.trim() || isDuplicateFilename`.
  </action>
  <verify>
    <automated>npm --prefix ui-react run test -- --run ui-react/src/pages/Integrations.test.tsx</automated>
  </verify>
  <done>Frontend should show error when duplicate is typed and "Create" button should be disabled.</done>
</task>

<task type="auto">
  <name>Task 2: Add backend validation for duplicate integration filename</name>
  <files>core/api.py</files>
  <action>
    - In the `create_integration_file` route (`POST /integrations/files`), check if `normalized_filename` is already in the list returned by `_integration_manager.list_integration_files()`.
    - If it already exists, raise an `HTTPException` with status code `409` (Conflict) and message "Integration {normalized_filename} already exists".
  </action>
  <verify>
    <automated>pytest tests/api/test_integration_files_api.py -v</automated>
  </verify>
  <done>Backend refuses to overwrite existing integrations via the create endpoint and returns 409.</done>
</task>

</tasks>

<verification>
Start backend and frontend servers, open the Create Integration dialog, enter an existing integration name, and verify the frontend shows an error and the Create button is disabled. Bypass frontend (e.g. cURL) to verify the backend returns 409.
</verification>

<success_criteria>
- Frontend form correctly validates and prevents duplicate submission.
- Backend API explicitly checks for existing files and returns 409 Conflict.
</success_criteria>

<output>
After completion, verify tests pass.
</output>
