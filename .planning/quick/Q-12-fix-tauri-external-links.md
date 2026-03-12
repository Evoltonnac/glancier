# Quick Task: Fix External Link Opening in Tauri

## Goal
Enable opening external links (OAuth, action.openurl, Monaco editor links) in the user's default browser from the Tauri app.

## Context
Currently, clicking links or triggering actions that should open a web page does nothing in the Tauri environment.

## Tasks
- [x] Research Tauri `shell` configuration in `tauri.conf.json`.
- [x] Check if `@tauri-apps/api/shell` is used or needed in the frontend.
- [x] Implement a global handler or update existing action handlers to use Tauri's `open` API.
- [x] Verify fix by testing OAuth flow and Monaco editor links.

## Verification Criteria
- [x] OAuth links open in default browser.
- [x] `action.openurl` triggers browser.
- [x] Monaco editor links (Cmd+Click) open in browser.
