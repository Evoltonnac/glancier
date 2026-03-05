---
phase: 08-ui-refactoring
plan: "01"
subsystem: ui
tags: [tailwindcss, css-variables, design-system, dark-mode, react]

# Dependency graph
requires:
  - phase: 07-settings
    provides: theme provider and dark-mode class toggling

provides:
  - Semantic CSS variables in index.css aligned with High-Density Minimalist spec
  - Tailwind soft-elevation boxShadow extension for interactive hover states
  - Removal of legacy qb-header-gradient-* and qb-pulse-gradient CSS artifacts

affects:
  - 08-02-PLAN (TopNav refactoring)
  - 08-03-PLAN (BaseSourceCard and QuotaBar refactoring)
  - all future UI components using bg-surface, text-foreground, border-border

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Semantic token pattern: --background, --surface, --muted, --border, --ring, --brand, --warning, --success, --error mapped in :root and .dark"
    - "Soft elevation via multi-layered box-shadow instead of transform:scale"
    - "Semantic dot status indicator via Tailwind semantic colors replacing gradient header backgrounds"

key-files:
  created: []
  modified:
    - ui-react/src/index.css
    - ui-react/tailwind.config.js
    - ui-react/src/components/BaseSourceCard.tsx

key-decisions:
  - "Use violet 262.1 83.3% 57.8% for both --ring and --brand in both light and dark modes (consistent focus ring color)"
  - "Soft elevation shadow: three-layer box-shadow (4px/8px/16px) for interactive card hover instead of scale transform"
  - "Status indicator replaced from header radial gradient to a small semantic dot (h-1.5 w-1.5) in card header"

patterns-established:
  - "Pattern 1: Semantic CSS variables - use hsl(var(--surface)) via Tailwind bg-surface, never hardcode gray colors"
  - "Pattern 2: Hover feedback - use shadow-soft-elevation on interactive cards, not scale or hard shadows"
  - "Pattern 3: Status semantics - use bg-success/bg-brand/bg-warning/bg-error for status dots, not gradient backgrounds"

requirements-completed: [REQ-UI-REF-001]

# Metrics
duration: 12min
completed: 2026-03-03
---

# Phase 8 Plan 01: Design System Foundation Summary

**CSS variable/token foundation with Violet 600 brand ring, Zinc 950/900 dark mode palette, soft-elevation Tailwind shadow, and removal of legacy gradient CSS**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-03T12:18:39Z
- **Completed:** 2026-03-03T12:30:00Z
- **Tasks:** 2 (+ 1 auto-fix deviation)
- **Files modified:** 3

## Accomplishments
- Updated index.css :root and .dark blocks to match RESEARCH.md spec (Violet brand, Zinc palette, correct muted/border HSL values)
- Added shadow-soft-elevation boxShadow to tailwind.config.js for interactive card hover states
- Removed all qb-header-gradient-* classes and qb-pulse-gradient animation from index.css
- Fixed BaseSourceCard to use new semantic dot status indicator instead of removed gradient classes

## Task Commits

Each task was committed atomically:

1. **Task 1: Define Semantic CSS Variables** - `9d40557` (feat)
2. **Task 2: Configure Tailwind Extensions** - `8a2cf27` (feat)
3. **Deviation Fix: BaseSourceCard gradient class removal** - `145a949` (fix)

## Files Created/Modified
- `ui-react/src/index.css` - Updated semantic CSS variables for both light and dark modes; removed legacy gradient CSS and animation
- `ui-react/tailwind.config.js` - Added soft-elevation boxShadow extension
- `ui-react/src/components/BaseSourceCard.tsx` - Replaced gradient header references with semantic dot status indicator and soft-elevation hover

## Decisions Made
- Kept --ring aligned with --brand (both Violet 262.1 83.3% 57.8%) in both light and dark modes for consistent keyboard focus UX
- Dark mode brand color kept at same violet value (not the old 258 90% 66%) to match RESEARCH.md spec
- Status dot approach: h-1.5 w-1.5 rounded-full in the card header left area - minimal footprint, semantic color

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BaseSourceCard referencing removed CSS gradient classes**
- **Found during:** Task 1 (Define Semantic CSS Variables)
- **Issue:** BaseSourceCard.tsx used statusGradientMap referencing qb-header-gradient-* classes that were deleted from index.css. Would cause broken/invisible card header styling at runtime.
- **Fix:** Replaced statusGradientMap with statusDotColorMap using semantic Tailwind color classes (bg-success, bg-brand animate-pulse, bg-warning, bg-error, bg-muted-foreground). Added shadow-soft-elevation hover to the Card element. Updated header className to remove gradient reference and use bg-surface.
- **Files modified:** ui-react/src/components/BaseSourceCard.tsx
- **Verification:** Build succeeds (npm run build) with no errors
- **Committed in:** 145a949

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required fix for correctness — the component would have rendered broken status headers without it. No scope creep.

## Issues Encountered
None beyond the auto-fixed BaseSourceCard deviation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Design system token foundation is in place; all subsequent component work can reference bg-surface, border-border, text-foreground, shadow-soft-elevation
- BaseSourceCard already consumes soft-elevation hover; TopNav and QuotaBar refactoring (Plans 02-03) can proceed
- No blockers

## Self-Check: PASSED

- FOUND: ui-react/src/index.css
- FOUND: ui-react/tailwind.config.js
- FOUND: ui-react/src/components/BaseSourceCard.tsx
- Commits verified: 9d40557, 8a2cf27, 145a949

---
*Phase: 08-ui-refactoring*
*Completed: 2026-03-03*
