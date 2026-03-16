---
phase: quick
plan: 11
status: completed
owner: codex
created_at: 2026-03-16
commit: c0e201f
---

## Objective
Bundle the `skills` prompt into the frontend and add an AI helper flow in the integration creation dialog for prompt copy + GitHub skills navigation.

## What Changed
- Added bundled client prompt constant:
  - `ui-react/src/constants/integrationSkillPrompt.ts`
  - Contains the full prompt content from `skills/PROMPT.md`
- Enhanced integration create dialog UX:
  - `ui-react/src/pages/Integrations.tsx`
  - Added bright icon-only AI sparkles button in dialog header
  - Clicking sparkles replaces dialog body with a new AI helper view
  - AI helper view includes two actions:
    - Copy full prompt to clipboard
    - Open GitHub `skills` directory (`https://github.com/Evoltonnac/glancier/tree/main/skills`)
- Added frontend coverage for the new AI dialog flow:
  - `ui-react/src/pages/Integrations.test.tsx`
  - Verifies modal switch, prompt copy, and GitHub link action
- Added skill usage guide for repository users:
  - `skills/README.md`

## Validation
- `npm --prefix ui-react test -- src/pages/Integrations.test.tsx`
  - Passed (`4` tests)
- `make test-frontend`
  - Passed (`31` tests)
- `make test-typecheck`
  - Passed (`31` tests + TypeScript check)

## Scope Boundary
- No backend runtime behavior changed.
- No API contracts changed.
