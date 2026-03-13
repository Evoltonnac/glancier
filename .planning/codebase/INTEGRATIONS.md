# External Integrations

**Analysis Date:** 2026-03-13

## APIs & External Services

**OAuth Providers:**
- GitHub - OAuth authorization code flow with PKCE
  - SDK: authlib (Python backend)
  - API: `https://api.github.com/`
  - Auth: `https://github.com/login/oauth/authorize`
  - Integration: `config/integrations/Github_PKCE.yaml`, `config/integrations/Github.yaml`
- GitLab - OAuth with PKCE
  - SDK: authlib (Python backend)
  - Integration: `config/integrations/Gitlab_PKCE.yaml`
- Twitch - OAuth for media streaming data
  - Integration: `config/integrations/twitch_media_oauth.yaml`

**REST API Integrations:**
- OpenRouter - AI API key management
  - API: `https://openrouter.ai/api/v1/keys`
  - Auth: Bearer token (API key)
  - Integration: `config/integrations/openrouter_tools.yaml`
- GitHub API - User data, repositories
  - API: `https://api.github.com/`
  - Auth: OAuth token

**Web Scraping:**
- Dev.to (OpenBlog) - Developer community posts
  - Integration: `config/integrations/devto_opensource.yaml`
- iCloud - iCloud Web data (bookmarks, photos)
  - Integration: `config/integrations/icloud_webscraper.yaml`
  - Auth: Browser cookie-based

**HTTP-Based Data Sources:**
- Gold Price / Market Data - Generic HTTP fetching
  - Integration: `config/integrations/gold_price_market.yaml`

## Data Storage

**Primary Database:**
- TinyDB 4.8.0 - Embedded NoSQL document database
  - Storage format: JSON files
  - Location: `{data_root}/data/` directory
  - Tables: sources, views, settings, snapshots
  - Migration: Supports legacy TinyDB layout migration

**Settings Storage:**
- JSON files via pydantic-settings
  - Location: `{data_root}/data/settings.json`
  - Format: Plain JSON with Pydantic validation

**Secrets Storage:**
- AES-256-GCM encrypted JSON files
  - Location: `{data_root}/secrets/` directory
  - Key derivation: PBKDF2 with system keyring
  - Uses: `keyring` package for master key storage

**Cache:**
- SWR (frontend) - HTTP response caching
  - In-memory with deduping
  - No server-side cache detected

**File Storage:**
- Local filesystem
  - Integration YAML files: `config/integrations/*.yaml`
  - Presets: `config/presets/`
  - User data: `{data_root}/`

## Authentication & Identity

**Auth Provider:**
- Custom OAuth implementation using authlib
  - Supported flows: Authorization Code, PKCE, Device Code, Client Credentials
  - Token refresh: Automatic retry with refresh token

**OAuth Implementation:**
- `core/auth/oauth_auth.py` - OAuth handler
- `core/auth/device_flow.py` - Device flow support
- Secrets stored encrypted, accessed via SecretsController
- Integration config via YAML flow definitions

**Desktop Auth:**
- Tauri shell plugin for opening OAuth URLs
- Local callback handling: `http://localhost:5173/oauth/callback`

## Monitoring & Observability

**Error Tracking:**
- Not detected - No external error tracking service

**Logs:**
- Python: Standard logging (structlog-style)
  - Output: Console + file
  - Levels: DEBUG, INFO, WARNING, ERROR
- Frontend: console.log/warn/error
  - Tauri IPC for backend log access

**Health Checks:**
- FastAPI `/health` endpoint
- Source lifecycle status tracking

## CI/CD & Deployment

**Hosting:**
- Desktop: Tauri builds for macOS (.dmg), Windows (.exe/.msi), Linux (.deb/.AppImage)
- Server: Self-hosted Python FastAPI

**CI Pipeline:**
- Not detected - No GitHub Actions or CI configuration found

**Build Artifacts:**
- Frontend: `ui-react/dist/` (Vite production build)
- Desktop: `ui-react/src-tauri/target/release/bundle/`
- Python: PyInstaller executable (optional)

## Environment Configuration

**Required env vars:**
- Not typically required - configuration via files

**Secrets location:**
- `{data_root}/secrets/` - Encrypted JSON
- System keyring - Master encryption key
- Integration configs - API keys (placeholders in YAML)

**Configuration hierarchy:**
1. Default values (code)
2. Settings JSON file
3. Encrypted secrets file

## Webhooks & Callbacks

**Incoming:**
- OAuth callback: `http://localhost:5173/oauth/callback` (dev)
- OAuth callback: `http://localhost:8400/api/oauth/callback` (backend proxy)
- No external webhooks detected

**Outgoing:**
- Tauri auto-updater endpoints (configurable)
  - Default: `https://example.com/glancier/releases/{{target}}/{{arch}}/{{current_version}}`

---

*Integration audit: 2026-03-13*
