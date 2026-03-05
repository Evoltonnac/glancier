# 10-CONTEXT: Codebase Semantic Update

## Overview
This document captures implementation decisions for Phase 10. Downstream agents must use these decisions to guide research and planning without asking the user again. The overarching principle is that since there are no released versions, we can prioritize strict correctness and technical debt reduction over backward compatibility.

## Decisions

### 1. Legacy Data & Environments
Since there is no released version, we are dropping support for all legacy configurations and paths.
- **Data Directories:** Ignore the old `~/.quota-board` directory completely. The app will solely rely on `~/.glancier` (or `GLANCIER_DATA_DIR`).
- **Environment Variables:** Drop support for `QUOTA_BOARD_ROOT` entirely. If both are set, just use `GLANCIER_DATA_DIR`.
- **Migration:** No automatic migration or backup of old user data is required.

### 2. YAML Config Schema
We are strictly enforcing the new terminology in configuration schemas.
- **Key Renaming:** Require strict usage of new keys (`source_card`, `progress_bar`). Drop Pydantic aliases for old keys.
- **Validation:** If a user loads an old YAML with invalid/old keys, fail startup and throw a validation error.

### 3. App.tsx Refactoring
The refactoring of the monolithic `App.tsx` will introduce better state management and component boundaries.
- **State Management:** Introduce **Zustand** (or equivalent lightweight global state manager) to handle state extracted into the Sidebar and Scraper hooks, eliminating prop drilling.
- **Type Organization:** Adopt a **mixed** approach. Move globally shared types/interfaces to a central `src/types/` directory, while keeping component-specific types colocated within the same file as the component.

### 4. Sidecar Binary & IPC Renaming
A comprehensive replacement of branding artifacts across the stack.
- **Binary Handling:** `glancier-server` is the new sidecar binary. The build process can leave any old `quota-board-server` binaries untouched. No symlinks or aliases will be provided for existing custom scripts; users must forcefully update their setups.
- **IPC & String Replacement:** Comprehensively search and replace all instances of "quota-board" and "quota_board" in Rust, Tauri IPC events, and TypeScript code.
- **CLI Args:** All CLI arguments and default config paths associated with the sidecar must be renamed to reflect "glancier".

## Code Context
- **Configurations:** `core/config_loader.py`, `core/models.py` (Pydantic models need aliases removed and keys updated).
- **Environment:** `main.py`, `core/settings_manager.py` (Env var updates).
- **UI & State:** `ui-react/src/App.tsx` (to be split), `ui-react/src/components/`, `ui-react/src/types/`, `ui-react/package.json` (to add Zustand).
- **Tauri & Sidecar:** `scripts/build.sh`, `ui-react/src-tauri/tauri.conf.json`, `ui-react/src-tauri/src/main.rs`, `ui-react/src-tauri/src/lib.rs`.

## Deferred Ideas
None identified during this context gathering phase. Any feature requests or scope expansions encountered during execution should be logged rather than implemented.
