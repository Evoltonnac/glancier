# External Integrations

**Analysis Date:** 2026-02-28

## APIs & External Services

**Provider APIs:**
- OpenRouter - keys/credits endpoints configured in `config/integrations/openrouter_keys_apikey.yaml`
  - SDK/Client: `httpx` via flow execution in `core/executor.py`
  - Auth: API key/OAuth secrets handled by `core/secrets_controller.py`, `core/auth/oauth_auth.py`
- Soniox - dashboard/API and webview scrape targets configured in `config/integrations/soniox_dashboard.yaml` and `config/integrations/soniox_dashboard_webview.yaml`
  - SDK/Client: `httpx` and Tauri WebView bridge via `core/executor.py`, `ui-react/src-tauri/src/scraper.rs`
  - Auth: browser cookie / flow interactions via `core/auth/browser_auth.py` and `core/source_state.py`

**Desktop Platform Services:**
- Tauri native bridge (autostart, event bus, hidden webview scraper) in `ui-react/src-tauri/src/lib.rs` and `ui-react/src-tauri/src/scraper.rs`
  - SDK/Client: `@tauri-apps/api` in `ui-react/src/App.tsx` and `ui-react/src/pages/Settings.tsx`
  - Auth: Not applicable

## Data Storage

**Databases:**
- TinyDB local JSON database in `data/data.json`
  - Connection: filesystem path from `GLANCIER_DATA_DIR` in `core/data_controller.py`
  - Client: `tinydb` in `core/data_controller.py`

**File Storage:**
- Local filesystem only (`data/sources.json`, `data/views.json`, `data/secrets.json`, `data/settings.json`) managed by `core/resource_manager.py`, `core/secrets_controller.py`, `core/settings_manager.py`

**Caching:**
- None detected; only in-memory runtime state map in `core/executor.py`

## Authentication & Identity

**Auth Provider:**
- Custom multi-mode auth (`api_key`, `oauth`, `browser`, interactive flow) in `core/auth/manager.py` and `core/source_state.py`
  - Implementation: Source-scoped credentials persisted in `data/secrets.json` through `core/secrets_controller.py`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry/Datadog integration)

**Logs:**
- Python `logging` in `main.py`, `core/*.py`
- Frontend `console.*` in `ui-react/src/App.tsx`, `ui-react/src/pages/*.tsx`
- Tauri log plugin (debug mode) in `ui-react/src-tauri/src/lib.rs`

## CI/CD & Deployment

**Hosting:**
- Desktop bundle target via Tauri in `ui-react/src-tauri/tauri.conf.json`

**CI Pipeline:**
- None detected (`.github/`, `.gitlab/`, `.circleci/` not present)

## Environment Configuration

**Required env vars:**
- `GLANCIER_DATA_DIR` - base path override used by `core/config_loader.py`, `core/data_controller.py`, `core/secrets_controller.py`, `core/settings_manager.py`
- Provider key env vars referenced via `${ENV_VAR}` resolution in `core/auth/apikey_auth.py` and examples in `README.md`

**Secrets location:**
- Persistent secret store at `data/secrets.json` via `core/secrets_controller.py`
- Optional encryption key in `data/settings.json` via `core/settings_manager.py`

## Webhooks & Callbacks

**Incoming:**
- OAuth browser callback route `/oauth/callback` in `ui-react/src/App.tsx` and `ui-react/src/components/auth/OAuthCallback.tsx`
- Tauri event callbacks `scraper_result` and `scraper_auth_required` in `ui-react/src/App.tsx`

**Outgoing:**
- REST calls from frontend to backend `/api/*` in `ui-react/src/api/client.ts`
- Backend outbound provider requests via `httpx` in `core/executor.py` and `core/auth/oauth_auth.py`

---

*Integration audit: 2026-02-28*
