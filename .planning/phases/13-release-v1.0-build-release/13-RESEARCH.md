# Phase 13: Build & Release Research

## 1. Goal and Requirements
- End-to-end polish and verification of the client pipeline (JS <-> Rust <-> Python).
- Create reliable CI/CD release pipeline with GitHub Actions.
- Ensure security best practices (IPC allowlist, CSP, secret handling) and perform audits.
- Polish onboarding (auto-inserts of examples) and integration preset UI.
- Deliver DMG/Exe builds via automated actions.

## 2. Codebase Context
- `.github/workflows/ci.yml` exists but needs full E2E, code signing bypass (DMG backdrop), and Tauri auto-updater configuration.
- `scripts/build.sh` currently builds the app, needs alignment with CI workflows.
- `ui-react/src-tauri/tauri.conf.json`:
  - Needs strict IPC allowlist.
  - CSP must isolate Scraper from the UI.
  - Updater config needs to be enabled.
- `tests/` and `ui-react/tests/`: TDD is being used. E2E tests should be added with Playwright + Tauri.

## 3. Implementation Strategy
1. **Security & Audit:** Review `tauri.conf.json` for IPC endpoints. Enforce strict CSP. Run `cargo audit` and `npm audit`.
2. **E2E Testing Setup:** Add Playwright testing suite for Tauri. Create mock services for CI to prevent network failures or credential usage.
3. **UX Polish:** Implement integration presets (OpenRouter, GitHub, etc.) with auto-filled YAML in the integration editor and onboarding defaults.
4. **CI/CD Pipeline:** Enhance `ci.yml` for macOS/Windows builds, configure manual `workflow_dispatch`, and create instructions for DMG distribution.

## 4. Validation Architecture
- E2E tests must pass locally and in CI (macOS).
- The final DMG must open without crash, connecting to the Python backend correctly.
- Pre-filled presets must correctly render and populate the editor.
- Security tests/audits must return 0 vulnerabilities for production dependencies.