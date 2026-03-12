# Phase 13: Build & Release Context

This document captures the implementation decisions for Phase 13 to guide downstream planning and execution.

## 1. E2E Testing & Verification Scope
*   **Testing Strategy:**
    *   **Backend / Logic:** Continue strengthening the existing `pytest` suite for full flow and FastAPI coverage (fast TDD feedback).
    *   **Frontend UI:** Use Playwright (Frontend only) for testing all micro-components and page logic (fast UI TDD).
    *   **Integration Smoke (E2E):** Use Playwright + Tauri for 2-3 core End-to-End cases to verify the JS <-> Rust <-> Python pipeline.
        *   *Core E2E Cases:* Integration creation -> Source creation -> Auto-load -> Success. OAuth redirect flow. Webview scraper background execution.
*   **External Dependencies:** Use Mock External Services during CI tests to prevent flakiness and credential leakage.
*   **CI OS Target for E2E Tests:** macOS Only.

## 2. CI/CD Pipeline & Release Assets
*   **Release Platforms:** Produce release binaries for macOS and Windows.
*   **Release Trigger:** Manual workflow dispatch from the GitHub UI (`workflow_dispatch`).
*   **Code Signing / Notarization:** Skipped for now. For macOS, a DMG background will include instructional text (e.g., right-click to open).
*   **Auto-Updater:** Enable Tauri's built-in updater.

## 3. Performance & Security Audit
*   **Performance Metrics:** Set lenient/baseline indicators based on current project performance.
    *   App bundle size target: Lenient (< 150MB).
*   **Security Audit Scope (Full Stack v1.0 Audit):**
    *   **IPC:** Strict allowlist in `tauri.conf.json`, audit all `#[tauri::command]` arguments to prevent path traversal/illegal calls.
    *   **WebView Isolation:** Strict CSP to isolate Scraper from the main UI (prevent XSS).
    *   **Data Security:** Ensure `.env` and local credentials use AES/Fernet encryption, prioritizing system-level keychain where possible.
    *   **Supply Chain:** Run `cargo audit` and `npm audit` to clear known CVEs.
    *   **Tooling:** Standard linters and audits.

## 4. E2E Polish & UX Finalization
*   **Onboarding / First Launch:**
    *   Auto-insert an example integration, source, and widget using a public, unauthenticated data source (e.g., a common OpenAPI or a public webpage for scraping).
*   **Integration Creation Presets:**
    *   Provide predefined presets during Integration creation (e.g., OpenRouter for API Key, GitHub for OAuth, a public API for cURL, and a public page for webview scraping).
    *   UI: Display presets as square cards with an icon and name.
    *   Action: Selecting a preset auto-fills the YAML editor with necessary comments.
*   **Crash Reporting:** Manual Bug Report Link (e.g., "Report Bug" button that directs the user to open a GitHub issue).
*   **App Metadata & Branding:** Comprehensive branding (new app icon, DMG backgrounds, clear versioning).

## Deferred Ideas (Out of Scope for Phase 13)
*   Automated macOS code signing and notarization via Apple Developer Program (deferred in favor of DMG instructional background).
*   Cross-platform (Linux) release builds.

## Code Context
*   `.github/workflows/ci.yml` - Current CI workflow, needs expanding for E2E and releases.
*   `scripts/build.sh` - Custom bundling script for PyInstaller + Tauri.
*   `ui-react/src-tauri/tauri.conf.json` - Requires updates for IPC allowlist, CSP headers, and Updater configuration.
*   `tests/` & `ui-react/tests/` - Existing pytest and frontend test directories.
