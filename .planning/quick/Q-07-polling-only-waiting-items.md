# Quick Task: Update source state polling rules

## Objective
Update the polling rules for data sources on the Dashboard. Only sources in a "refreshing" (waiting) state should trigger polling. Sources in determined states (success/active, failed/error, pending action/suspended) should be ignored for polling.

## Tasks
- [x] Update `hasTransient` logic in `ui-react/src/pages/Dashboard.tsx` to only check for `status === "refreshing"`.
- [x] Remove obsolete dependencies (`dataMap`) from the `useEffect` hook.

## Verification
- [x] Verify the UI build passes.

## Summary
The `Dashboard.tsx` data polling logic was simplified. The `hasTransient` flag now exclusively checks whether any source has a status of `"refreshing"`, ignoring determined states like `"suspended"` (pending action), `"error"` (failed), and `"active"` (success). This optimizes the dashboard polling behavior to correctly adhere to the intended rules.