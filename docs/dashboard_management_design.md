# Dashboard Management Design and Implementation Summary (Phase 06)

## Purpose

This document records the finalized dashboard management design shipped in Phase 06, and the implementation choices used in `ui-react`.

Goal:
- Provide a clear, low-friction workflow for switching between dashboards, managing dashboard lifecycle, and preserving deterministic local state behavior.

## User Experience Model

Phase 06 introduces a dual-mode dashboard experience:

- `single` mode:
  - The main dashboard canvas renders the active dashboard's widgets.
  - Users can switch visible tabs directly and access overflowed dashboards from a management panel.
- `management` mode:
  - Users see all dashboards as cards for overview-level operations.
  - Supports create, rename, delete, reorder, and jump-to-dashboard flows.

## Core Interaction Features

1. Dashboard tab lifecycle:
- Persisted active dashboard and ordered dashboard ids.
- Deterministic name generation for new dashboards.
- Rename validation (empty/duplicate constraints).

2. Overflow and management entry:
- Browser-like tab row (`ChromeTab`) with overflow popover.
- Unified management actions exposed from `ViewTabsBar` + `ViewManagementPanel`.

3. Dashboard CRUD:
- Create dashboard dialog.
- Rename dialog.
- Delete confirmation dialog.
- Card-based management operations for quick maintenance.

4. Reorder behavior:
- Drag-drop reorder support in visible and overflow tab zones.
- Dashboard card reorder support in management mode.

## Architecture and State Contracts

State ownership:
- `useViews()` remains the canonical remote source.
- `useViewTabsState` owns frontend tab/dashboard interaction state (`viewMode`, active id, ordered ids, selected dashboard id).

Sync strategy:
- SWR -> Zustand sync is idempotent and guarded to avoid update loops.
- No-op branches must return previous state when derived data is semantically unchanged.

Persistence strategy:
- Dashboard layout updates are queued through `viewSaveQueue`.
- Optimistic updates are applied for responsive UX, followed by `invalidateViews()` reconciliation.

## Component Surface Added/Updated

Primary components:
- `DashboardThumbnail`
- `DashboardCard`
- `DashboardGrid`
- `DashboardSwiper`
- `ViewTabsBar`
- `ViewManagementPanel`
- `CreateDashboardDialog`
- `RenameDialog`
- `DeleteConfirmDialog`
- `ChromeTab`

Primary page/store files:
- `ui-react/src/pages/Dashboard.tsx`
- `ui-react/src/store/viewTabsState.ts`
- `ui-react/src/pages/dashboardViewTabs.ts`

## I18N and Copy Contracts

Dashboard management copy uses stable translation keys under:
- `dashboard.tabs.*`
- `dashboard.management.*`

Any future copy updates must keep `en` and `zh` catalogs synchronized.

## Test Coverage Expectations

Phase 06 adds and updates coverage for:
- Tab helper contracts and persisted tab store behavior.
- Dashboard tab lifecycle and overflow rendering.
- Reorder and drag interaction paths.
- UI tab behavior after chrome/overflow refactor.
- View save queue behavior and SWR sync safety.

## Maintenance Notes

When extending dashboard management:
- Keep reconciliation logic centralized in store actions.
- Avoid adding secondary synchronization writes in page effects.
- Preserve `error_code` and i18n key stability.
- Keep docs and tests updated in the same delivery.
