---
created: 2026-03-18T07:30:00Z
title: windows-sidecar-process-lifecycle
area: desktop
files:
  - ui-react/src-tauri/src/lib.rs
  - .github/workflows/ci.yml
---

## Problem

On Windows release builds installed via NSIS, the app may crash on launch after upgrade/reinstall because `glanceus-server.exe` remains running from a previous app instance. The installer can close the main Tauri process but does not reliably terminate the sidecar process. The next launch may fail during backend runtime extraction or startup, resulting in immediate app exit.

## Solution

1. Add Windows-specific sidecar lifecycle hardening in `ui-react/src-tauri/src/lib.rs`, including startup cleanup for stale `glanceus-server.exe` processes.
2. Introduce a stronger parent-child process binding strategy (for example, Job Object `KILL_ON_JOB_CLOSE`) so sidecar exits when app exits unexpectedly.
3. Add resilient startup behavior for backend runtime directory replacement (retry/fallback path) to avoid hard-fail on locked files.
4. Add release validation checklist for upgrade path in CI/UAT: install old version -> run app -> install new version -> verify no stale sidecar and no launch crash.
