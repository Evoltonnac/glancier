---
phase: 10
slug: sql-chart-widgets-and-sdui-rendering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.0 in repo + Testing Library React |
| **Config file** | `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/vitest.config.ts` |
| **Quick run command** | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/WidgetRenderer.test.tsx --run` |
| **Full suite command** | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test:core` |
| **Estimated runtime** | ~45-60 seconds (target focused checks <45s) |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/WidgetRenderer.test.tsx --run`
- **After every plan wave:** Run `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test:core`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** <60 seconds (target 45 seconds with focused task commands)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | CHART-01 | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartWidgets.test.tsx --run -t "renders line chart from sql_response rows"` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | CHART-02 | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartWidgets.test.tsx --run -t "renders bar chart from sql_response rows"` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | CHART-03 | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartWidgets.test.tsx --run -t "renders area chart from sql_response rows"` | ❌ W0 | ⬜ pending |
| 10-01-04 | 01 | 1 | CHART-04 | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartWidgets.test.tsx --run -t "renders pie chart from sql_response rows"` | ❌ W0 | ⬜ pending |
| 10-01-05 | 01 | 1 | CHART-05 | component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartTable.test.tsx --run` | ❌ W0 | ⬜ pending |
| 10-01-06 | 01 | 1 | CHART-06 | component + unit | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/ChartState.test.tsx --run` | ❌ W0 | ⬜ pending |
| 10-01-07 | 01 | 1 | CHART-07 | unit + component | `npm --prefix /Users/xingminghua/Coding/evoltonnac/glanceus/ui-react run test -- src/components/widgets/chartSchemas.test.ts src/components/widgets/ChartWidgets.test.tsx --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/ChartWidgets.test.tsx` — chart render/fallback coverage for CHART-01..04 and CHART-06
- [ ] `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/ChartTable.test.tsx` — table sorting/limit/column coverage for CHART-05
- [ ] `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/chartSchemas.test.ts` — encoding validation coverage for CHART-07
- [ ] `/Users/xingminghua/Coding/evoltonnac/glanceus/ui-react/src/components/widgets/chartState.test.ts` — deterministic state classifier coverage for CHART-06
- [ ] Add chart widgets to existing `WidgetRenderer.test.tsx` regression path once registry wiring lands

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
