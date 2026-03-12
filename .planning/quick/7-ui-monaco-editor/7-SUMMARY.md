---
phase: quick
plan: 7
subsystem: ui
tags:
  - ui
  - css
  - design-system
dependency_graph:
  requires: []
  provides:
    - global native scrollbar hiding policy
    - monaco scrollbar exception
  affects:
    - ui-react/src/index.css
    - docs/custom_design_prompt.md
tech_stack:
  added: []
  patterns:
    - global CSS policy
    - Monaco-specific exception rule
key_files:
  created: []
  modified:
    - ui-react/src/index.css
    - docs/custom_design_prompt.md
key_decisions:
  - "Hide native scrollbars globally at the CSS base layer."
  - "Keep Monaco editor scrollbars usable with explicit override selectors."
metrics:
  duration: 15m
  completed_at: "2026-03-09T03:52:00Z"
---

# Phase quick Plan 7: Global scrollbar policy (Monaco exception) Summary

Implemented a global native scrollbar hiding policy for the UI, while preserving Monaco Editor scrollbar usability, and documented the same rule in the design specification.

## Implementation Details

- **Global CSS rule**: Added cross-browser scrollbar hiding rules (`scrollbar-width`, `-ms-overflow-style`, `::-webkit-scrollbar`) in `ui-react/src/index.css` for the whole UI surface.
- **Monaco exception**: Added explicit `.monaco-editor` override rules to keep Monaco scrollbar behavior available.
- **Design spec update**: Added a `Scrollbar Policy` rule in `docs/custom_design_prompt.md` under Interaction Design Policy to enforce this convention.

## Verification

- `npm --prefix ui-react run typecheck` failed due to a pre-existing issue: `src/pages/Integrations.tsx(51,5): 'Info' is declared but its value is never read.`
- No new type errors were introduced by the scrollbar/doc changes in this task.

## Deviations from Plan

- None for scope and files.
- Automated verification is partially blocked by the existing unrelated typecheck error.

## Self-Check: PASSED (with existing baseline typecheck blocker)
FOUND: 6b43a78
