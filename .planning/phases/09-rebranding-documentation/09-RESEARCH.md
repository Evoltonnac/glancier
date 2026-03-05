# Phase 09: 品牌与精神重塑 (Rebranding & Documentation) - Research

**Researched:** 2026-03-05
**Domain:** Documentation, Branding, Terminology, Architecture Semantics
**Confidence:** HIGH

## Summary

The project is evolving from "Quota Board" (a niche API credit monitoring tool) to "Glancier" (a universal Personal Data Aggregator & Hub). The current documentation is heavily coupled to the restrictive "Quota" concept, which misaligns with its actual multimodal fetching and "Bento Grid" rendering capabilities. 

This phase focuses exclusively on resetting the mental model in the documentation layer. By deprecating the term "Quota" and refactoring it into "Metric," "Signal," or "Integration Data," we lay the semantic foundation for Phase 10 (Codebase Semantic Update). All primary documentation (`README.md`, `PROJECT.md`, `ARCHITECTURE.md`, `Agent.md`, `CONFIG.md`) must be rewritten to reflect the new Glancier positioning.

**Primary recommendation:** Replace "Quota" with context-appropriate terms (Metric, Signal) across all `.md` files, firmly establish "Glancier" as the primary identity while retaining "(formerly Quota Board)" for discoverability, and define the "Personal Data Aggregator" architecture.

## Standard Stack

### Documentation Targets (Core)
| File | Current Status | Required Action | Why |
|------|----------------|-----------------|-----|
| `README.md` | "Quota Board" focused | Full rewrite | Main entry point; needs new Glancier positioning and updated feature list. |
| `PROJECT.md` | Partially updated | Terminology scrub | Must align goals with "Data Aggregator" rather than "Quota". |
| `ARCHITECTURE.md`| "Configuration-driven modular monolith" | Terminology update | Needs to reflect "Flow -> Bento Grid" pipeline instead of quotas. |
| `Agent.md` | Mentions Quota Board rules | AI instructions update | The AI assistant needs the new terminology to avoid regenerating old "Quota" terms. |
| `CONFIG.md` | Uses `quota_card`, `quota_bar` | Doc update | Document the transition plan from `quota_bar` to `metric_bar` / `progress_bar`. |
| `docs/*.md` | Multiple "Quota" mentions | Terminology scrub | Ensure all architecture deep-dives align with the new mental model. |

### Supporting Terminology Dictionary
| Old Term | New Term | Context/Usage |
|----------|----------|---------------|
| Quota Board | Glancier | The product name. Always use "Glancier". |
| Quota | Metric | Numeric data points, e.g., "Usage Metric", "Hero Metric". |
| Quota | Signal | Boolean or state data, e.g., "Status Signal". |
| Quota | Integration Data | Generic term for fetched information. |
| Quota Bar | Progress Bar | The UI widget visualizing a capacity or percentage. |
| Quota Card | Base Source Card / Bento Card | The UI component displaying data. |
| `QUOTA_BOARD_ROOT` | `GLANCIER_DATA_DIR` | The environment variable defining the data storage path. |

## Architecture Patterns

### Recommended Rebranding Pattern (Documentation First)
**What:** Define the mental model in `.md` files *before* touching code.
**When to use:** In a major project pivot where terminology creates technical debt.
**Example:**
Instead of describing a flow as "Fetching API quotas," describe it as "Extracting Integration Metrics and Signals."

### Anti-Patterns to Avoid
- **Total Erasure of Old Name:** Completely removing "Quota Board" from the `README.md`. *Instead:* Use "Glancier (formerly Quota Board)" in the main heading for SEO and continuity.
- **Codebase Renaming in Phase 09:** Attempting to rename React components (`QuotaBar.tsx`) or Python variables (`QUOTA_BOARD_ROOT`) in this phase. *Instead:* Only update `.md` files. Phase 10 will handle code.
- **Generic Replace-All:** Running a blind find-and-replace of "Quota" to "Metric". *Instead:* Contextually decide if the data is a Metric (numeric), Signal (boolean/status), or Integration Data (general).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SEO Continuity | A completely new README without old terms | Include "(formerly Quota Board)" | Existing users and search engines will lose track of the project. |
| Component Renaming | Renaming `QuotaBar.tsx` now | Wait for Phase 10 | Mixing doc updates with code updates increases merge conflicts and breaks TDD flows. |

**Key insight:** Documentation changes should strictly establish the *target* state of the system terminology. It acts as the spec for the next phase, preventing semantic confusion during codebase updates.

## Common Pitfalls

### Pitfall 1: Inconsistent Terminology
**What goes wrong:** `README.md` uses "Glancier" but `docs/flow_configuration.md` still refers to "Quota Board".
**Why it happens:** Incomplete search across the `docs/` folder.
**How to avoid:** Perform a global grep search for `Quota` and `quota-board` across all `.md` files before finalizing the PR.
**Warning signs:** AI tools or developers generating new code using the old "Quota" namespace.

### Pitfall 2: Over-using "Metric"
**What goes wrong:** Translating "API Rate Limit Quota" to "API Rate Limit Metric", which sounds unnatural.
**Why it happens:** Rigid adherence to a one-to-one mapping.
**How to avoid:** Use context. An API limit is still a "Limit" or "Capacity". The data fetched is "Integration Data". "Quota" is acceptable *only* when strictly describing a hard API credit limit, but never as the generic term for the data source itself.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API Limit Monitoring | Personal Data Aggregator & Hub | v1.0 Milestone | Broadens the project scope to arbitrary web/API data scraping. |
| Quota-centric Widgets | Bento Grid / Micro-Widgets | v1.0 Milestone | UI is no longer tied to progress bars; can display any data type. |

**Deprecated/outdated:**
- The term `Quota` as a broad catch-all: Replaced by Metric, Signal, or Integration Data to represent a wider variety of scraped information.
- The product name `Quota Board`: Replaced by `Glancier`.

## Open Questions

1. **Handling legacy configurations**
   - What we know: Users have existing `config/integrations/*.yaml` with `quota_bar` and `quota_card` types.
   - What's unclear: Should the docs state these are deprecated or immediately invalid?
   - Recommendation: The docs should state `quota_bar` is deprecated in favor of `progress_bar` (or similar), but backward compatibility will be maintained in the codebase (in Phase 10) for a grace period.

## Sources

### Primary (HIGH confidence)
- `milestone.md` - Confirms the transition to "Glancier" and "Personal Data Aggregator & Hub".
- `.planning/PROJECT.md` - Confirms the current state and "Unfair Advantages" positioning.
- `README.md` - Confirms the extensive current use of "Quota Board" and need for an overhaul.

## Metadata

**Confidence breakdown:**
- Standard stack (Terminology): HIGH - Directly derived from milestone instructions.
- Architecture: HIGH - Documentation strategy is clear and isolated from code changes.
- Pitfalls: HIGH - Common rebranding issues are well understood.

**Research date:** 2026-03-05
**Valid until:** Project completion of v1.0 Milestone
