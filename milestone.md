# Milestone 1.0: Glancier Public Release Plan

## 1. Milestone Objective
Position Glancier as a config-first personal data hub for power users.
The milestone targets a stable and demonstrable `v1.0` release through rebranding,
documentation cleanup, semantic code alignment, and strict TDD enforcement.

## 2. Problem and Solution

### 2.1 Core Problem: Platform Fatigue
In a fragmented SaaS/API ecosystem, users face:
- Credential sprawl across many platforms.
- Friction from constant tab switching and repeated auth flows.
- Data silos when services expose no API or block scraping heavily.

### 2.2 Solution: Glancier
Glancier uses a headless execution engine plus a high-density client UI.
It offloads auth/fetch/parse complexity to background workflows so the user can
consume key signals quickly.

### 2.3 Key Advantages
- Multi-modal fetching: HTTP, OAuth refresh, and WebView-assisted capture.
- AI-first normalization: convert heterogeneous source data into stable structures.
- Local-first Bento UI: encrypted local storage and dense, customizable card layouts.
- Configuration as Code: ship new integrations by YAML/templates without backend rewrites.

## 3. Task Breakdown

### Phase 1: Rebranding and Documentation
Goal: unify terminology and narrative across the project.
- Update glossary to standard terms: `Metric`, `Signal`, `Integration Data`.
- Rewrite architecture docs, `PROJECT.md`, and `README.md`.

### Phase 2: Semantic Codebase Update
Goal: align code and naming with product direction.
- Complete rebrand updates (name/icon/color).
- Standardize namespaces and env/storage keys under `GLANCIER_`.
- Refactor UI component naming toward reusable abstractions.

### Phase 3: Test Coverage and TDD
Goal: establish release-grade quality gates.
- Enforce Red -> Green -> Refactor workflow.
- Add backend tests for executor/state/encryption/auth paths.
- Add frontend tests for critical rendering and interaction flows.

### Phase 4: Build and Release
Goal: produce a shippable public `v1.0` desktop release.
- Validate end-to-end paths with representative integrations.
- Configure CI/CD packaging for Tauri targets.
- Run security and performance hardening checks.
