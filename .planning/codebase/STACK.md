# Technology Stack

**Analysis Date:** 2026-02-28

## Languages

**Primary:**
- Python (3.10+ inferred from `|` union type syntax) - backend API and execution engine in `main.py`, `core/*.py`, `scripts/*.py`
- TypeScript/TSX - frontend app and UI in `ui-react/src/**/*.ts` and `ui-react/src/**/*.tsx`

**Secondary:**
- Rust (edition 2021, rust-version 1.77.2) - desktop shell and scraper bridge in `ui-react/src-tauri/src/*.rs`, `ui-react/src-tauri/Cargo.toml`
- YAML - integration definitions in `config/integrations/*.yaml`
- JSON - persisted runtime data in `data/*.json`

## Runtime

**Environment:**
- Python runtime for FastAPI service started by `python main.py` in `main.py`
- Node.js runtime for Vite dev/build from `ui-react/package.json`
- Rust/Tauri runtime for desktop build in `ui-react/src-tauri/Cargo.toml`

**Package Manager:**
- Python: pip with `requirements.txt` (lockfile missing)
- Node: npm with lockfile present at `ui-react/package-lock.json`
- Rust: cargo with lockfile present at `ui-react/src-tauri/Cargo.lock`

## Frameworks

**Core:**
- FastAPI (`fastapi>=0.115.0`) - REST API in `main.py`, `core/api.py`
- React (`react^18.3.1`) - UI rendering in `ui-react/src/main.tsx`, `ui-react/src/App.tsx`
- Tauri (`tauri=2.10.0`) - desktop app shell in `ui-react/src-tauri/src/lib.rs`

**Testing:**
- No dedicated test framework configured in repo root (no `pytest.ini`, `pyproject.toml`, Jest/Vitest config)
- Ad-hoc Python interaction verification script in `tests/verify_interactions.py`

**Build/Dev:**
- Uvicorn (`uvicorn[standard]>=0.34.0`) - ASGI server in `main.py`
- Vite (`vite^6.0.11`) - frontend bundling/dev server in `ui-react/vite.config.ts`
- TailwindCSS (`tailwindcss^3.4.17`) - styling tokens in `ui-react/tailwind.config.js`, `ui-react/src/index.css`
- PyInstaller (`pyinstaller>=6.0.0`) - backend sidecar packaging in `scripts/build.sh`
- Watchdog (`watchdog>=6.0.0`) - backend autoreload in `scripts/dev_server.py`

## Key Dependencies

**Critical:**
- `httpx` - outbound HTTP/OAuth requests in `core/executor.py`, `core/auth/oauth_auth.py`
- `pydantic` - schema and config validation in `core/config_loader.py`, `core/models.py`, `core/source_state.py`
- `tinydb` - persisted latest/history state in `core/data_controller.py`
- `jsonpath-ng` - extraction stage in `core/executor.py` and parser utilities in `core/parser.py`

**Infrastructure:**
- `cryptography` - AES-GCM secret encryption in `core/encryption.py`
- `browser-cookie3` - browser cookie auth in `core/auth/browser_auth.py`
- `@tauri-apps/api` / `@tauri-apps/plugin-shell` - frontend-native bridge in `ui-react/src/App.tsx`, `ui-react/src/pages/Settings.tsx`
- `gridstack` - dashboard drag/resize layout in `ui-react/src/App.tsx`

## Configuration

**Environment:**
- Config root resolved via `QUOTA_BOARD_ROOT` in `core/config_loader.py`, `core/data_controller.py`, `core/secrets_controller.py`, `core/settings_manager.py`
- API key placeholders support `${ENV_VAR}` via `core/auth/apikey_auth.py`

**Build:**
- Frontend build config in `ui-react/vite.config.ts`, `ui-react/tsconfig.json`, `ui-react/postcss.config.js`
- Desktop build config in `ui-react/src-tauri/tauri.conf.json`, `ui-react/src-tauri/Cargo.toml`
- Packaging flow in `scripts/build.sh`

## Platform Requirements

**Development:**
- Python + pip (`requirements.txt`)
- Node + npm (`ui-react/package.json`)
- Rust + cargo for desktop mode (`ui-react/src-tauri/Cargo.toml`)

**Production:**
- Tauri desktop bundle with Python sidecar binary from `scripts/build.sh`
- Local writable filesystem for app state in `data/` (`core/resource_manager.py`, `core/data_controller.py`, `core/secrets_controller.py`)

---

*Stack analysis: 2026-02-28*
