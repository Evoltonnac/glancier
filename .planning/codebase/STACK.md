# Technology Stack

**Analysis Date:** 2026-03-13

## Languages

**Primary:**
- TypeScript 5.7.3 - Frontend UI (React)
- Python 3.x - Backend API and data processing

**Secondary:**
- Rust - Tauri desktop runtime (indirect, via Tauri CLI)

## Runtime

**Environment:**
- Node.js 22.x (via nvm or system) - Frontend dev/build
- Python 3.10+ - Backend execution

**Package Managers:**
- npm 10.x (frontend) - Lockfile: `ui-react/package-lock.json`
- pip/uv (backend) - Lockfile: Not detected (uses requirements.txt)

## Frameworks

**Frontend Core:**
- React 18.3.1 - UI library
- React Router DOM 7.13.0 - Client-side routing
- Zustand 5.0.11 - State management

**Desktop:**
- Tauri 2.10.0 - Desktop application wrapper
- @tauri-apps/api 2.10.0 - Tauri IPC and window control

**Backend Core:**
- FastAPI 0.115+ - REST API framework
- Uvicorn 0.34+ - ASGI server

**Styling:**
- TailwindCSS 3.4.17 - Utility-first CSS framework
- Radix UI - Headless UI primitives (via @radix-ui packages)

**Testing:**
- Vitest 4.0.0 - Frontend unit testing
- Playwright 1.58.2 - Frontend E2E testing
- Pytest 8.3.0 - Backend unit testing
- pytest-asyncio 0.24.0 - Async test support
- pytest-httpx 0.35.0 - HTTP mocking for tests

**Build/Dev:**
- Vite 6.0.11 - Frontend build tool and dev server
- @vitejs/plugin-react 4.3.4 - React Fast Refresh
- concurrently 9.2.1 - Run multiple npm scripts
- PyInstaller 6.0.0 - Python executable bundling

## Key Dependencies

**UI Components & Visualization:**
- @radix-ui/react-* (dialog, dropdown, progress, select, separator, switch, tabs, tooltip, slot) - Accessible UI primitives
- lucide-react 0.468.0 - Icon library
- recharts 2.15.0 - Data visualization charts
- gridstack 12.4.2 - Dashboard grid layout engine
- react-grid-layout 2.2.2 - React grid layout wrapper
- react-resizable 3.1.3 - Resizable panel components

**Code Editor:**
- monaco-editor 0.52.2 - VS Code editor component
- @monaco-editor/react 4.7.0 - Monaco React wrapper
- monaco-yaml 5.4.0 - YAML language support

**Data & Forms:**
- zod 4.3.6 - Schema validation
- swr 2.4.1 - Data fetching and caching
- class-variance-authority 0.7.1 - Tailwind class variance

**Backend Libraries:**
- pydantic 2.10.0 - Data validation
- pydantic-settings 2.7.0 - Settings management
- httpx 0.28.0 - Async HTTP client
- authlib 1.6.0 - OAuth authentication
- tinydb 4.8.0 - Embedded document database
- apscheduler 3.10.4 - Task scheduling
- beautifulsoup4 4.12.0 - HTML parsing
- lxml 5.3.0 - XML/HTML processing
- pyyaml 6.0.2 - YAML parsing
- jsonpath-ng 1.7.0 - JSONPath queries
- browser-cookie3 0.19.1 - Browser cookie extraction
- cryptography 41.0.0 - Encryption (AES-256-GCM for secrets)
- keyring 25.6.0 - System keychain integration

## Configuration

**Frontend Build:**
- `ui-react/vite.config.ts` - Vite build configuration with React plugin
- `ui-react/tsconfig.json` - TypeScript configuration (ES2022 target, strict mode)
- `ui-react/tailwind.config.js` - TailwindCSS with custom theme colors
- `ui-react/postcss.config.js` - PostCSS for Tailwind processing
- `ui-react/eslint.config.js` - ESLint configuration
- `ui-react/vitest.config.ts` - Vitest configuration
- `ui-react/playwright.config.ts` - Playwright E2E configuration

**Desktop:**
- `ui-react/src-tauri/tauri.conf.json` - Tauri app configuration
  - CSP: Strict security policy
  - Windows: 1200x800 default, resizable
  - Updater: Configured for auto-updates (endpoints need configuration)

**Backend:**
- `main.py` - FastAPI app factory with CORS and middleware
- `core/settings_manager.py` - JSON-based settings storage
- `core/secrets_controller.py` - AES-256-GCM encrypted secrets
- `core/data_controller.py` - TinyDB JSON file storage

**Development:**
- `scripts/dev_server.py` - Python dev server with hot reload
- `scripts/build.sh` - Tauri build script
- `Makefile` - Development shortcuts
- `pytest.ini` - Pytest configuration

## Platform Requirements

**Development:**
- Node.js 22.x + npm 10.x
- Python 3.10+ with pip/uv
- Rust toolchain (for Tauri)

**Production:**
- Desktop: macOS 11.0+ (via Tauri DMG), Windows, Linux
- Server: Python 3.10+ with Uvicorn
- Storage: Local filesystem (TinyDB JSON files)

---

*Stack analysis: 2026-03-13*
