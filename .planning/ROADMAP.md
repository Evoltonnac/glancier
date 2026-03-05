# Roadmap: Quota Board

## Overview

This roadmap turns Quota Board's documented architecture into an executable delivery path for a desktop-first, configuration-driven quota dashboard. The phases are derived directly from v1 requirements and progress from foundational contracts, to runtime and security, to API/UI delivery, then deployment topologies.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (if needed later)

- [x] **Phase 1: Configuration Foundation** - Lock platform-agnostic integration contracts and engineering guardrails.
- [x] **Phase 2: Runtime Orchestration** - Deliver scheduler-driven execution with resumable interaction states.
- [x] **Phase 3: Secrets & Settings Security** - Complete encrypted secret handling and settings persistence boundaries.
- [x] **Phase 4: Resource & API Contracts** - Complete source/view/integration API contracts and API-only data access boundaries.
- [x] **Phase 5: View Runtime Architecture** - Deliver shell + widget rendering model with robust degradation behavior.
- [x] **Phase 6: Desktop Secure Acquisition** - Complete desktop-priority secure acquisition and compliance warning UX.
- [x] **Phase 7: Multi-Topology Delivery** - Ship supported deployment combinations and packaging workflows.
- [ ] **Phase 8: UI Refactoring** - Redesign and refactor the user interface for better UX, visual polish, and consistency.

## Phase Details

### Phase 1: Configuration Foundation
**Goal**: Integrations are fully platform-agnostic and defined by stable configuration contracts, not platform-specific backend code.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-CFG-000, REQ-CFG-001, REQ-CFG-002, REQ-CFG-003, REQ-CFG-004, REQ-CFG-005, REQ-CFG-006, REQ-CON-001, REQ-CON-003, REQ-CON-004, REQ-CON-005
**Success Criteria** (what must be TRUE):
1. New platform integrations can be authored via YAML + API resources without adding new Python platform handlers.
2. Flow schema supports all declared step types and resolves variables with documented priority.
3. Authorization headers and secret persistence are explicit in configuration, with no implicit behavior.
4. Core engineering guardrails (dependency policy, core module boundaries, personal-use scope) are documented and enforceable.
**Plans**: 4 plans

Plans:
- [x] 01-01: Normalize integration schema and validation boundaries.
- [x] 01-02: Enforce flow semantics (step support, interpolation, explicit auth/secrets).
- [x] 01-03: Codify architecture and dependency guardrails in checks/docs.

### Phase 2: Runtime Orchestration
**Goal**: Data collection runs on reliable schedules, pauses safely for user interaction, and resumes without manual repair.
**Depends on**: Phase 1
**Requirements**: REQ-EXE-001, REQ-EXE-002, REQ-EXE-003, REQ-EXE-004, REQ-EXE-005, REQ-EXE-006, REQ-EXE-007, REQ-EXE-008, REQ-DATA-003
**Success Criteria** (what must be TRUE):
1. Sources execute on default schedules (30m general, 60m webview/curl) with per-source overrides.
2. Interaction-required flows enter `suspended` state and resume from the exact checkpoint after user input.
3. A failing source does not block other enabled sources from running.
4. Runtime status and latest execution outputs persist reliably across process restarts.
**Plans**: 4 plans

Plans:
- [x] 02-01: Implement scheduling defaults and source-level override behavior.
- [x] 02-02: Harden flow suspend/resume state machine and status persistence.
- [x] 02-03: Implement tool-specific timeout defaults and fault isolation.

### Phase 3: Secrets & Settings Security
**Goal**: Secret material and device settings are securely stored and remain operable across encryption mode changes.
**Depends on**: Phase 2
**Requirements**: REQ-DATA-004, REQ-DATA-005, REQ-DATA-006, REQ-SEC-001, REQ-SEC-002, REQ-SEC-003
**Success Criteria** (what must be TRUE):
1. Secrets are managed through a single controller and encrypted with `ENC:`-prefixed AES-256-GCM payloads when enabled.
2. Encryption toggles and migration flows never break read paths for existing secret entries.
3. Master key export/import works for cross-device manual sync scenarios.
4. v1 keeps current storage model and explicitly defers historical-retention redesign.
**Plans**: 4 plans

Plans:
- [x] 03-01: Finalize SecretsController encryption/decryption/migration lifecycle.
- [x] 03-02: Finalize settings persistence and master key import/export interfaces.
- [x] 03-03: Add regression checks for mixed plaintext/ciphertext compatibility.

### Phase 4: Resource & API Contracts
**Goal**: Backend APIs fully cover source/view/integration lifecycle and enforce API-only data access from frontend.
**Depends on**: Phase 2, Phase 3
**Requirements**: REQ-DATA-001, REQ-DATA-002, REQ-API-001, REQ-API-002, REQ-API-003, REQ-API-004, REQ-API-005, REQ-API-006, REQ-CON-002
**Success Criteria** (what must be TRUE):
1. Users can create/read/update/delete sources and views through stable API endpoints.
2. Integration YAML files can be listed/read/created/updated/deleted via API with safe reload behavior.
3. Config reload marks affected sources as `config_changed` and keeps system state consistent.
4. Frontend workflows consume backend APIs exclusively, with no direct file reads.
**Plans**: 4 plans

Plans:
- [x] 04-01: Complete source/view CRUD and data query contract consistency.
- [x] 04-02: Complete integration-file management and dependent-source lookup APIs.
- [x] 04-03: Complete auth-related interaction and status endpoints.
- [x] 04-04: Enforce API-only frontend access patterns.

### Phase 5: View Runtime Architecture
**Goal**: Dashboard rendering follows the shell + micro-widget architecture with graceful behavior under missing or unhealthy data.
**Depends on**: Phase 4
**Requirements**: REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-004, REQ-UI-005, REQ-UI-006, REQ-UI-007
**Success Criteria** (what must be TRUE):
1. Base Source Card consistently owns system-state overlays and blocks widget rendering when source health is not normal.
2. Widgets remain stateless presentation units and degrade safely (no TypeError/white-screen) on null/missing values.
3. List widgets support filtering, sorting, limiting or pagination as configured.
4. Grid layout and row-span behavior are predictable while spacing remains parent-controlled.
**Plans**: 4 plans

Plans:
- [x] 05-01: Implement source-card shell state gating and health overlay behavior.
- [x] 05-02: Implement widget rendering contracts and graceful fallback handling.
- [x] 05-03: Finalize list/layout behaviors (filter/sort/pagination/grid/row_span).

### Phase 6: Desktop Secure Acquisition
**Goal**: Desktop-first secure scraping/reverse-acquisition paths are production-ready with clear compliance signaling.
**Depends on**: Phase 4, Phase 5
**Requirements**: REQ-CFG-007, REQ-SEC-004, REQ-PLT-002, REQ-PLT-004
**Success Criteria** (what must be TRUE):
1. Tauri desktop mode reliably orchestrates Python sidecar and webview-scraper task flow.
2. UI clearly warns users about compliance risks for `curl` and `webview` integrations.
3. Regression baseline covers API key fetch path, cURL/WebView path, and GitHub OAuth representative path.
**Plans**: 4 plans

Plans:
- [x] 06-01: Stabilize desktop-side scraper orchestration and sidecar lifecycle.
- [x] 06-02: Add compliance warning UX for curl/webview-based integrations.
- [x] 06-03: Build and run representative integration regression suite (OpenRouter/Soniox/GitHub OAuth).

### Phase 7: Multi-Topology Delivery
**Goal**: Supported runtime and deployment combinations are documented, runnable, and packaged for release.
**Depends on**: Phase 5, Phase 6
**Requirements**: REQ-PLT-001, REQ-PLT-003, REQ-PLT-005
**Success Criteria** (what must be TRUE):
1. Web development mode supports concurrent frontend/backend startup and hot reload workflows.
2. Production packaging pipeline produces working desktop artifacts via PyInstaller + Tauri.
3. Four deployment combinations (desktop/local-python, desktop/cloud-python, web/local-python, web/cloud-python) are validated and documented with known capability differences.
**Plans**: 2 plans

Plans:
- [x] 07-01: Validate and document runtime/dev/prod startup and build paths.
- [x] 07-02: Validate four deployment topologies and publish compatibility matrix.

### Phase 8: UI Refactoring
**Goal**: Refactor and redesign the user interface to enhance user experience, visual consistency, and overall polish.
**Depends on**: Phase 7
**Requirements**: REQ-UI-REF-001, REQ-UI-REF-002, REQ-UI-REF-003
**Success Criteria** (what must be TRUE):
1. UI components are consistently styled following a unified design system.
2. The user experience for managing integrations, sources, and views is intuitive and streamlined.
3. Dashboard rendering is visually polished, responsive, and performs well under load.
4. No existing functionality is broken during the refactoring process.
**Plans**: 3 plans

Plans:
- [ ] 08-01-PLAN.md — Establish unified design system and component library guidelines.
- [ ] 08-02-PLAN.md — Refactor core layout, navigation, and settings views.
- [ ] 08-03-PLAN.md — Redesign dashboard widget presentation and source card interactions.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Configuration Foundation | 3/3 | Completed | Yes |
| 2. Runtime Orchestration | 3/3 | Completed | Yes |
| 3. Secrets & Settings Security | 3/3 | Completed | Yes |
| 4. Resource & API Contracts | 4/4 | Completed | Yes |
| 5. View Runtime Architecture | 3/3 | Completed | Yes |
| 6. Desktop Secure Acquisition | 3/3 | Completed | Yes |
| 7. Multi-Topology Delivery | 2/2 | Completed | Yes |
| 8. UI Refactoring | 2/3 | In Progress|  |