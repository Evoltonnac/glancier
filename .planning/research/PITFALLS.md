# Pitfalls Research

**Domain:** Config-first SQL connector steps and chart widgets for a local-first personal data hub  
**Researched:** 2026-03-23  
**Confidence:** MEDIUM

Phase naming used below (for risk ownership):
- **Phase S1:** SQL Step Contract and Safety Guardrails
- **Phase S2:** SQL Runtime Integration and Data Normalization
- **Phase V1:** Chart Widget Contract and Renderer Integration
- **Phase V2:** Usability, Diagnostics, and Accessibility Hardening
- **Phase V3:** Cross-layer Performance and Scale Hardening

## Critical Pitfalls

### Pitfall 1: SQL Interpolation Through Flow Templates

**What goes wrong:**  
SQL is assembled with string interpolation (`{var}`, f-strings, concat) and user/runtime values are injected directly into query text.

**Why it happens:**  
Glanceus already supports template substitution in step args, so teams reuse that mechanism for SQL values and even table/column names.

**How to avoid:**  
Define SQL step contract as `query` + typed `params`; values must always be bound parameters. For dynamic identifiers, only allow pre-declared allowlist keys mapped to fixed SQL identifiers.

**Warning signs:**  
- Query strings contain concatenation/f-string patterns in YAML.
- Runtime query errors include broken quoted fragments from user input.
- Integration examples accept raw table names from form/input.

**Phase to address:**  
**Phase S1**

---

### Pitfall 2: Cross-Driver Placeholder Mismatch

**What goes wrong:**  
A query works for one driver but fails for another (`%s` vs `?` vs `:name`) with binding count/syntax errors.

**Why it happens:**  
DB-API placeholder styles differ by driver; a config-first system magnifies this because templates are reused across connectors.

**How to avoid:**  
Use one canonical placeholder style in integration YAML (recommended: named params), then compile/translate to driver-specific `paramstyle` in backend adapter layer. Reject invalid placeholder style at validation time.

**Warning signs:**  
- `Incorrect number of bindings supplied` or near-`%` syntax errors.
- Connector-specific query variants start appearing in templates.
- Same integration fails only after switching database engine.

**Phase to address:**  
**Phase S1**

---

### Pitfall 3: Credential Leakage Into Integration Data or Error Surfaces

**What goes wrong:**  
DB credentials/DSN fragments leak into plaintext runtime payloads, UI messages, or logs.

**Why it happens:**  
Developers map connection material into `outputs`/`context` during debugging or include full connection URI in exception text.

**How to avoid:**  
Force credential fields to resolve from `secrets` only. Add SQL-step-specific redaction for DSN, password, token, and parameter values in runtime errors/logs. Keep deterministic `error_code` but sanitize details.

**Warning signs:**  
- Password-like substrings found in `runtime_latest.payload_json`.
- UI error toast includes full connection URI.
- Step examples store connection strings in non-secret channels.

**Phase to address:**  
**Phase S1**

---

### Pitfall 4: Blocking SQL Calls Starve Async Flow Execution

**What goes wrong:**  
One slow query blocks the async executor loop, delaying unrelated source refreshes.

**Why it happens:**  
Sync DB clients are called directly from async flow execution without thread offload or async driver path, and timeout/cancel handling is not enforced.

**How to avoid:**  
Standardize execution path per connector: async driver where available, otherwise bounded threadpool execution with per-step timeout and cancel semantics mapped to deterministic `error_code`.

**Warning signs:**  
- Multiple sources stall when one SQL source hangs.
- Scheduler backlog grows during long queries.
- Cancellation from UI does not shorten query runtime.

**Phase to address:**  
**Phase S2**

---

### Pitfall 5: Connection Pool Exhaustion and Stale Connections

**What goes wrong:**  
SQL steps intermittently fail under parallel refresh with acquire timeouts or dead/stale connections after idle periods.

**Why it happens:**  
Pool sizing/recycle policies are skipped; new connectors open ad-hoc connections per run; stale sockets are reused without pre-check.

**How to avoid:**  
Create one connector-manager path with explicit pool sizing, acquire timeout, recycle/health-check (`pre_ping` style), and cleanup rules on suspend/error.

**Warning signs:**  
- Timeouts waiting for connection under moderate concurrency.
- First query after idle often fails, retry succeeds.
- Open connection count keeps growing across refresh cycles.

**Phase to address:**  
**Phase S2**

---

### Pitfall 6: Unbounded Query Results Break Local Runtime and UI

**What goes wrong:**  
Large result sets are fully materialized and persisted; local storage grows quickly and chart/cards become sluggish or unusable.

**Why it happens:**  
Early versions allow raw `SELECT *` + full persistence into Integration Data without row limits or shaping.

**How to avoid:**  
Enforce default guards (`max_rows`, timeout) at SQL-step level. Require explicit projection columns. Normalize to chart-friendly compact payload (`rows` + `fields`) and support chunked fetch/stream for large reads.

**Warning signs:**  
- `storage.db` size spikes after refresh.
- Dashboard render time increases with each sync.
- Slow writes in runtime persistence after SQL steps.

**Phase to address:**  
**Phase S2** (guardrails) and **Phase V3** (scale tuning)

---

### Pitfall 7: Type and Timezone Drift Between SQL Output and Charts

**What goes wrong:**  
Charts show wrong ordering or wrong day/hour buckets; some values disappear because types are not normalized consistently.

**Why it happens:**  
Raw DB types (timestamp variants, decimals, nullable fields) are passed through without a strict normalization contract before widget rendering.

**How to avoid:**  
Define SQL output contract with typed field metadata (`number`, `time`, `string`, `boolean`, `nullability`) and UTC-normalized timestamp policy. Validate chart axis bindings against this schema before render.

**Warning signs:**  
- Time series axis appears unsorted despite sorted query.
- Values shift around DST/day boundaries.
- Same query renders differently across DB engines.

**Phase to address:**  
**Phase S2** (normalization) and **Phase V1** (binding validation)

---

### Pitfall 8: Chart Schema Drift Against Current SDUI Contracts

**What goes wrong:**  
New chart config cannot render because frontend schema/renderer/docs diverge; cards show invalid-widget fallback or empty state.

**Why it happens:**  
Legacy chart names (`line_chart`, `bar_chart`) still exist in historical types while current SDUI taxonomy excludes them; teams update only one layer (schema or renderer) instead of all contracts.

**How to avoid:**  
Introduce chart widgets via one coordinated change set: config schema, frontend zod schemas, renderer switch, docs (`01/02/03` SDUI docs), and regression tests.

**Warning signs:**  
- `Invalid widget configuration` messages in WidgetRenderer tests/runtime.
- Docs list chart widgets not recognized by renderer.
- TypeScript unions and runtime zod schemas disagree.

**Phase to address:**  
**Phase V1**

---

### Pitfall 9: Recharts Version/Container Assumptions Cause Invisible Charts

**What goes wrong:**  
Charts intermittently render at zero size or fail to resize correctly in Bento Cards.

**Why it happens:**  
Docs for newer Recharts are followed while project is on `recharts@2.15.0`; parent container sizing and responsive strategy mismatch.

**How to avoid:**  
Use `ResponsiveContainer`-based pattern compatible with Recharts 2.x and enforce explicit parent width/height contracts in widget container components. Add snapshot + resize interaction tests.

**Warning signs:**  
- Chart appears only after window resize.
- Chart disappears in certain grid/card sizes.
- Resize-triggered re-render storms.

**Phase to address:**  
**Phase V1**

---

### Pitfall 10: Usability Layer Breaks Deterministic Diagnostics and i18n

**What goes wrong:**  
SQL/chart setup feels opaque; users see generic errors, untranslated copy, and unclear mapping failures.

**Why it happens:**  
Preview and mapping flows are added quickly with hardcoded text and generic catch-all errors, bypassing existing `error_code` and i18n contracts.

**How to avoid:**  
Add stage-specific error taxonomy (`sql.connection_failed`, `sql.query_timeout`, `chart.schema_mismatch`, etc.), keep code visible in diagnostics, and wire all new copy through `en/zh` message catalogs.

**Warning signs:**  
- UI strings appear only in one language.
- Different failures collapse into identical message text.
- Support reports cannot identify failure stage.

**Phase to address:**  
**Phase V2**

---

### Pitfall 11: Dashboard State Loops from New SQL/Chart Filters

**What goes wrong:**  
Adding filter controls for SQL-backed charts introduces repeated renders/request loops and unstable tab state.

**Why it happens:**  
Filter synchronization logic is duplicated between component effects and Zustand store, violating existing single-owner/idempotent sync contracts.

**How to avoid:**  
Keep `useViewTabsState` as canonical interaction owner; treat SWR-to-store sync as one idempotent path; add no-op equality guards in store actions and regression tests for unchanged data references.

**Warning signs:**  
- Repeated network calls when filter value is unchanged.
- Dashboard mode/tab state resets after refresh.
- High CPU with no visible user action.

**Phase to address:**  
**Phase V2**

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Allow raw SQL string interpolation | Faster first demo | High security risk + hard-to-audit query paths | Never |
| Support every DB dialect in first release | Marketing breadth | Exploding adapter/test matrix | Only with explicit allowlist and contract tests per engine |
| Persist full raw query result blobs | Easy debugging | Storage bloat + chart slowdown | Temporary behind debug flag, not default |
| Add chart types before schema hardening | Faster feature count | Renderer/schema drift and runtime breakage | Never before V1 contract lands |
| Hardcode preview/mapping text in components | Quick UI iteration | i18n regressions and inconsistent UX | Never in milestone deliverables |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PostgreSQL | Ignore timezone semantics and mix local/UTC timestamps in chart axis | Normalize to UTC output contract; require explicit time field type and timezone policy |
| SQLite source | Assume infinite concurrent writes/reads without lock handling | Respect lock timeout and bounded retries; avoid long transactions in refresh path |
| SQLAlchemy-backed connectors | No disconnect health checks, default pool settings under concurrency | Configure pool size/overflow/timeout and enable connection liveness checks |
| Recharts in Bento grid | Assume chart auto-resizes without stable parent dimensions | Enforce parent width/height contract and use ResponsiveContainer pattern for 2.x |
| SQL parameter mapping | Pass table/column names as query parameters | Restrict identifiers to allowlist mapping; only bind values as params |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full result materialization (`fetchall` + persist all rows) | Memory spikes, slow writes, frozen chart interactions | Chunk/stream reads, `max_rows`, narrow column projection, summarize before storage | Usually visible at 10k+ rows per refresh or wide rows |
| Recomputing chart props/callbacks every render | Hover lag and high React commit count | Memoize data transforms/callbacks, stable references, throttle resize handlers | 6+ chart cards with 1s refresh or frequent drag/resize |
| Rendering unnormalized time series | Axis jitter, extra parse cost, wrong ordering | Pre-sort by time, emit normalized datasets, disable unnecessary parsing where supported | 2k+ points/series or multi-series cards |
| Pool starvation under parallel scheduler runs | Random timeout/failure at peak refresh windows | Bound concurrency + pool capacity planning + backpressure | As source count approaches semaphore/pool limits |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| String-building SQL from runtime/user values | SQL injection or unintended data access | Prepared/bound parameters only; enforce through step schema and validation |
| Over-privileged DB credentials | High blast radius if query path abused | Read-only DB role, least privilege, schema/table allowlist |
| Surfacing raw query/DSN errors to UI | Secret leakage in diagnostics and logs | Redact sensitive fragments and keep stable `error_code` for supportability |
| Allowing mutation SQL in refresh flows | Data corruption + non-idempotent scheduler behavior | Enforce read-only query policy in v1.2 contract |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No schema-guided field mapping for charts | Trial-and-error setup; users cannot map Metric/Signal quickly | Show typed preview metadata and suggested x/y/series bindings |
| Generic error messages for all SQL/chart failures | Users cannot recover without external debugging | Stage-specific localized guidance + stable `error_code` |
| Missing empty/invalid-data state design | Cards look broken or blank | Explicit empty/error skeleton states in chart widgets |
| Filters mutate dashboard state unexpectedly | Loss of trust in management mode and tabs | Single state owner with idempotent sync and deterministic persistence path |

## "Looks Done But Isn't" Checklist

- [ ] **SQL step contract:** Query params are typed and bound; no string interpolation path remains.
- [ ] **Connector support:** Each supported engine has contract tests for placeholder translation, timeout, and error mapping.
- [ ] **Normalization:** SQL output includes typed field metadata and timezone-normalized time values.
- [ ] **Chart widgets:** Runtime schema validation + graceful fallback paths are covered by tests.
- [ ] **Responsive behavior:** Charts render correctly across Bento resize, drag, and different panel sizes.
- [ ] **Diagnostics:** New SQL/chart failures expose deterministic `error_code` and localized user copy.
- [ ] **i18n:** All new usability strings exist in both `en` and `zh` catalogs.
- [ ] **Performance:** Guardrails (`max_rows`, timeout) are enforced and verified under representative data size.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SQL interpolation shipped | HIGH | Freeze new connectors, patch parser to reject unsafe query patterns, rotate DB creds, add regression tests |
| Pool exhaustion in production | MEDIUM | Apply conservative pool/concurrency caps, enable liveness checks, add load test and tune limits |
| Oversized Integration Data payloads | MEDIUM | Backfill query limits, trim persisted payload shape, migrate/compact runtime rows |
| Chart schema drift | MEDIUM | Align schema + renderer + docs in one patch, add compatibility tests for legacy templates |
| i18n/error-code regressions | LOW | Restore key-based copy mapping, add snapshot tests for deterministic error surfaces |
| Filter state loops | MEDIUM | Centralize reconciliation in store action, remove duplicate effect writes, add loop regression tests |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SQL interpolation and unsafe identifiers | Phase S1 | Unit tests reject unsafe patterns; security tests verify bound params only |
| Cross-driver placeholder mismatch | Phase S1 | Contract tests per engine pass with same canonical SQL template |
| Secret leakage through runtime/error channels | Phase S1 | Redaction tests + scan persisted runtime payloads for secret tokens |
| Blocking SQL execution in async flow | Phase S2 | Concurrency test shows unrelated sources keep refreshing during slow SQL query |
| Pool exhaustion/stale connections | Phase S2 | Load test with parallel sources shows no acquire timeout/stale reconnect flake |
| Unbounded result persistence | Phase S2 / V3 | Query guardrail tests enforce row/timeout limits; runtime DB size trend remains bounded |
| Type/timezone normalization drift | Phase S2 / V1 | Snapshot tests verify stable typed schema and expected chart ordering across engines |
| Chart schema drift with SDUI contracts | Phase V1 | Renderer + zod + docs updated together; invalid schema degrades gracefully |
| Recharts version/container mismatch | Phase V1 | Resize tests confirm non-zero render and stable behavior in grid/card contexts |
| Diagnostics/i18n regressions | Phase V2 | UI tests verify `error_code` visibility and en/zh key coverage for new flows |
| Dashboard filter sync loops | Phase V2 | No-op sync tests prove no repeated renders/network calls on unchanged data |

## Sources

- Glanceus docs (project contracts):  
  - `.planning/PROJECT.md`  
  - `docs/flow/01_architecture_and_orchestration.md`  
  - `docs/flow/02_step_reference.md`  
  - `docs/sdui/01_architecture_and_guidelines.md`  
  - `docs/sdui/02_component_map_and_categories.md`  
  - `docs/frontend/01_engineering_guide.md`
- OWASP SQL Injection Prevention Cheat Sheet (prepared statements, allowlist validation, least privilege):  
  - https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- Psycopg3 parameter binding and SQL composition guidance:  
  - https://www.psycopg.org/psycopg3/docs/basic/params.html  
  - https://www.psycopg.org/psycopg3/docs/api/sql.html
- Python `sqlite3` docs (parameter substitution, lock timeout behavior):  
  - https://docs.python.org/3.11/library/sqlite3.html
- SQLAlchemy pooling and large-result handling docs:  
  - https://docs.sqlalchemy.org/en/21/core/pooling.html  
  - https://docs.sqlalchemy.org/21/orm/queryguide/api.html
- PostgreSQL datetime/timezone semantics:  
  - https://www.postgresql.org/docs/current/datatype-datetime.html
- Recharts guidance (performance, responsive behavior, accessibility layer):  
  - https://recharts.github.io/en-US/guide/performance/  
  - https://recharts.github.io/en-US/guide/sizes/  
  - https://recharts.github.io/en-US/api/AreaChart/
- Chart accessibility baseline reference (canvas fallback constraints):  
  - https://www.chartjs.org/docs/latest/general/accessibility.html

---
*Pitfalls research for: SQL database steps + chart widget + usability expansion (Glanceus v1.2)*
*Researched: 2026-03-23*
