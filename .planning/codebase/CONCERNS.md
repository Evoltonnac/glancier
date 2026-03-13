# Codebase Concerns

**Analysis Date:** 2026-03-13

## Tech Debt

**Bare Exception Handling:**
- Issue: Silent exception swallowing in argument resolution
- Files: `core/executor.py:399-400`
- Impact: Template string resolution failures are silently ignored, potentially causing data to be used without proper substitution
- Fix approach: Replace bare `except:` with specific exception handling (e.g., `except Exception as e: logger.warning(...)`)

**TODO - Dynamic Step ID:**
- Issue: Auth check step uses hardcoded ID instead of dynamic generation
- Files: `core/executor.py:758`
- Impact: Multiple auth flows may conflict if they share the same step_id
- Fix approach: Generate unique step_id based on source_id and auth type

**Empty Return Patterns:**
- Issue: Multiple methods return empty collections on error instead of raising exceptions
- Files:
  - `core/secrets_controller.py:60,66` - returns `{}` on file read/save errors
  - `core/resource_manager.py:37,44,93,100,143` - returns `[]` on load failures
  - `core/integration_manager.py:113,121,129,137` - returns `[]` on various errors
  - `core/api.py:981,985,1212` - returns `[]` on errors
- Impact: Errors are silently absorbed; downstream code may not detect failures
- Fix approach: Either propagate exceptions or use Result types to distinguish empty from error

**Extensive use of `any` TypeScript Type:**
- Issue: Over 40 instances of `any` type in React codebase
- Files: `ui-react/src/api/client.ts`, `ui-react/src/pages/Integrations.tsx`, `ui-react/src/components/widgets/WidgetRenderer.tsx`, `ui-react/src/lib/templateExpression.ts`
- Impact: Type safety is compromised; refactoring errors may go undetected
- Fix approach: Define proper interfaces for API responses and widget data structures

## Known Bugs

**OAuth Preset to Device Flow Wiring:**
- Symptoms: OAuth device flow may not trigger correctly when preset is configured
- Files: `core/api.py`, `core/auth/oauth_auth.py`
- Trigger: Using `oauth2` preset with device flow configuration
- Workaround: Configure device flow explicitly in source config

**Secrets File Corruption Recovery:**
- Issue: JSON decode errors return empty dict, losing all secrets
- Files: `core/secrets_controller.py:64-66`
- Trigger: Manual edits to secrets.json causing invalid JSON
- Workaround: Backup secrets.json before manual edits

## Security Considerations

**Plaintext Secrets Storage:**
- Risk: If encryption is disabled or master key unavailable, secrets stored in plaintext
- Files: `core/secrets_controller.py:68-74`
- Current mitigation: Encryption is opt-in via settings; warns on keychain failures
- Recommendations:
  - Consider making encryption mandatory for production
  - Add backup/restore mechanism for encrypted secrets

**Hardcoded API Port:**
- Risk: Development port 18640 is exposed in source
- Files: `ui-react/src/api/client.ts:11`
- Current mitigation: Only used in Tauri context
- Recommendations: Use environment variable for port configuration

**Template Expression Security:**
- Risk: Template expressions allow function access via context
- Files: `ui-react/src/lib/templateExpression.ts:430`
- Current mitigation: Only exposes limited utility functions
- Recommendations: Audit allowed function list; consider sandboxing

## Performance Bottlenecks

**Large Python Modules:**
- Problem: Monolithic files cause slow imports and poor maintainability
- Files:
  - `core/api.py` (1290 lines)
  - `core/executor.py` (885 lines)
  - `core/config_loader.py` (502 lines)
- Cause: All functionality accumulated in single files
- Improvement path: Split into smaller modules by responsibility

**State Persistence on Every Update:**
- Problem: Database write on each source state change
- Files: `core/executor.py:91-99`
- Cause: No batching or debouncing of state updates
- Improvement path: Implement state change debouncing or batch persistence

## Fragile Areas

**Executor Argument Resolution:**
- Files: `core/executor.py:380-405`
- Why fragile: Complex recursive function with bare except; hard to debug resolution failures
- Safe modification: Add logging for resolution failures; test with various input types
- Test coverage: Partial - test_flow_output_resolution.py exists but limited cases

**Template Expression Evaluation:**
- Files: `ui-react/src/lib/templateExpression.ts`
- Why fragile: Dynamic evaluation with many edge cases; complex recursion
- Safe modification: Add comprehensive test cases for edge conditions
- Test coverage: Minimal - no dedicated test file found

**OAuth Authentication State Machine:**
- Files: `core/auth/oauth_auth.py`, `core/auth/manager.py`
- Why fragile: Complex async flows with many failure modes; token refresh logic intricate
- Safe modification: Add state machine validation; extensive error case testing
- Test coverage: Good - multiple OAuth test files exist

## Scaling Limits

**File-Based Storage:**
- Current capacity: Single secrets.json and data.json; reasonable for <100 sources
- Limit: JSON file operations become slow with large datasets; no concurrent access control
- Scaling path: Migrate to SQLite for data storage; implement secrets in dedicated database

**In-Memory Source States:**
- Current capacity: All SourceState objects kept in memory (executor._states dict)
- Limit: Memory usage grows linearly with source count
- Scaling path: Implement LRU cache with database persistence; load states on-demand

## Dependencies at Risk

**httpx:**
- Risk: HTTP client used extensively; security vulnerabilities in older versions
- Impact: API requests, OAuth flows, extraction could be compromised
- Migration plan: Keep updated; monitor security advisories

**Pydantic (implied by model_dump):**
- Risk: Used for serialization; version compatibility issues
- Impact: State persistence, API responses could break
- Migration plan: Pin to stable version; test serialization extensively

## Missing Critical Features

**Frontend Request Deduplication:**
- Problem: UI may issue duplicate requests on rapid interactions
- Files: `ui-react/src/api/client.ts`, `ui-react/src/hooks/useScraper.ts`
- Blocks: Reliable automation; potential rate limiting issues

**Missing integrationPresets.ts:**
- Problem: Documentation references file that doesn't exist
- Files: Expected by integration docs but implemented via API hook
- Blocks: Developer onboarding; expected file structure clarity

## Test Coverage Gaps

**React Component Testing:**
- What's not tested: Most UI components; widget rendering; page-level flows
- Files: `ui-react/src/pages/*.tsx`, `ui-react/src/components/**/*.tsx`
- Risk: UI regressions undetected; edge cases in rendering
- Priority: High

**Integration/End-to-End Flows:**
- What's not tested: Full user workflows (create source → authenticate → extract → view)
- Files: Missing E2E test suite
- Risk: Cross-component failures undetected
- Priority: High

**Error Path Testing:**
- What's not tested: Network failures, auth token expiry, malformed config handling
- Files: Throughout `core/` modules
- Risk: Production error handling unpredictable
- Priority: Medium

---

*Concerns audit: 2026-03-13*
