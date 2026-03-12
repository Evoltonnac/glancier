# v1.0 Pre-release UAT Checklist: UX Polish

This User Acceptance Testing (UAT) checklist ensures that the UI and interaction polish for v1.0 meets our release-critical quality standards.

## 1. Interaction & Feedback (交互与反馈)
- [x] **Success States:** Successful operations (saving configurations, reloading config, etc.) are indicated clearly without disrupting user flow.
- [x] **Error Visibility:** Form errors (e.g., duplicate IDs, invalid format) are clearly highlighted near the source of the error using inline messages (`InlineError`), not just hidden in global toasts.
- [x] **Long-running Tasks:** Dashboard properly displays transient statuses ("刷新中", "等待") using badges.

## 2. Empty & Loading States (空状态与加载状态)
- [x] **Dashboard Loading:** Refreshing the page shows a centered loading state with a spinner before data loads.
- [x] **Dashboard Empty:** A clear "EmptyState" with an illustration, text, and an "添加第一个组件" (Add first widget) button is visible when no widgets exist.
- [x] **Integrations Empty:** Selecting no integration shows an "EmptyState" prompting the user to create or select an integration.
- [x] **No Sources:** A graceful empty state is shown in the integrations panel when an integration has zero linked sources.

## 3. Keyboard & Navigation (键盘可达与导航)
- [x] **Save Shortcut:** Pressing `Ctrl+S` / `Cmd+S` in the Monaco editor saves the configuration.
- [x] **Tab Navigation:** Users can tab through essential inputs in dialogs (e.g., Create Integration, Add Source).
- [x] **Route Interception (Unsaved Changes):** Modifying an integration's YAML without saving and attempting to leave the page (or clicking another route) correctly triggers the `RouteInterceptor` confirmation dialog.
    - **UAT-14-03 Fix:** Fixed "Leave" button not triggering navigation due to circular interception. (Verified)
- [x] **Dialog Escaping:** Pressing `Esc` correctly closes active dialogs without unexpected side effects.

## 4. Mouse & Hover Interactions (鼠标操作)
- [x] **Tooltips:** Hovering over truncated text, truncated IDs, status badges, or action icons displays native Radix tooltips with full context.
- [x] **Collapsible Sidebars:** Hover states on collapse/expand buttons are clear; sidebar interactions feel smooth.
- [x] **Hover Actions:** Action icons (Delete, More Options) on list items appear or highlight correctly on hover without causing layout shift.

## 5. Error Recovery (错误恢复)
- [x] **Config Reload Failures:** If a YAML edit breaks configuration reload, the editor retains the user's input, explicitly displays backend diagnostic errors inline via `InlineError` and bottom diagnostics panel, and allows further edits.
- [x] **Degraded Components:** Widgets with invalid properties gracefully degrade to fallback views (`WidgetFallbackBoundary`) instead of crashing the whole dashboard.
- [x] **Actionable Errors:** Broken integrations or sources surface a specific "需修复" (Needs fix) action allowing users to take immediate steps.

---

## Plan Status (计划状态更新)

### 14-03: Route Interceptor Fix
- **Issue:** Clicking "Leave" in the unsaved changes dialog would trigger the dialog again, preventing the user from leaving.
- **Root Cause:** `navigate()` call was being intercepted by the same `RouteInterceptor` instance since the "blocking" state was still active.
- **Fix:** Introduced `isBypassing` ref to allow one-time bypass of the navigation interceptor when "Leave" is explicitly clicked.
- **Status:** **RESLOVED & VERIFIED**

### 14-04: SDUI Implementation
- **Issue:** The original plan `14-04-PLAN.md` (micro-components) was based on an older vision.
- **Resolution:** Replaced by the comprehensive `docs/sdui/` design specification and implemented via the new declarative Widget system (Progress, FactSet, TextBlock, etc.).
- **Status:** **SUPERSEDED & COMPLETED**
