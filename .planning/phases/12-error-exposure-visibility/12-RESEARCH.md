# Phase 12: Error Surfacing & Visibility - Research

**Researched:** 2026-03-07
**Domain:** Error Handling, Monaco Editor Integration, State Management
**Confidence:** HIGH

## Summary

The objective is to expose runtime failures clearly across Data Source flows and YAML configurations. The central approach relies on **fail-fast mechanisms for flows**, distinct UI error/suspension states, and injecting robust diagnostics into the frontend code editor using `monaco-yaml` and unified JSON Schemas.

Instead of forcing the backend to track exact YAML line and column numbers, the architecture leverages `monaco-yaml`'s language server running locally in the browser for real-time validation. Meanwhile, the Python backend uses the exact same set of JSON Schemas to validate payloads and store detailed error information for API consumers. 

**Primary recommendation:** Chunk JSON Schemas into separate folders by type, use them for both backend validation and client-side `monaco-yaml` real-time validation. For flow execution, implement distinct `suspended` and `error` states for interactive steps (Auth/WebScraper), allowing user intervention via the UI.

<user_constraints>
## User Constraints (from CONTEXT.md & User Feedback)

### Locked Decisions
- **Execution Halt**: Step errors in a Data Source Flow (like Fetch or Script) must halt the entire execution immediately ("Fail Fast").
- **Error Location**: Show an error badge in the side sources panel. Clicking it will reveal the detailed error message.
- **Script Execution Output**: For script operations (CYL/Python), stream standard output and error (`stdout/stderr`) progressively during execution.
- **Persistence**: Store the error UI state persistently (e.g., in frontend state management) so that it remains if the user navigates away and returns.
- **WebScraper Interruptions**: Must robustly detect 403, login redirects, and captchas. On detection, suspend the task so it can be manually triggered by the user. Manual triggers must default to bringing the webview to the foreground (visible).
- **Interactive Step States (OAuth/cURL/APIKey)**: 
  - `suspended`: Missing required information.
  - `error`: Information provided but failed validation/execution.
  - Both states must allow the user to open the form and re-enter information. This rule is a standard for all future interactive steps.
- **Unified JSON Schema**: Use the exact same JSON Schema definitions in Python and React. Python uses them to record and store detailed errors for API callers. The Tauri React frontend uses them directly in Monaco for real-time syntax and schema validation without depending on Python API round-trips.
- **Schema Architecture**: JSON Schemas will grow with flow step tools and widgets. They must be organized into folders, chunked by type, and merged when needed. These chunked schemas will serve as infrastructure for future features like documentation and MCP (Model Context Protocol).
- **Monaco YAML Integration**: Use the `monaco-yaml` plugin. The frontend will define and inject the combined JSON Schema to handle error squiggles, autocompletion, and hover docs with exact line/property positioning, debounced on edit.
- **Raw Stack Traces**: Raw error traces and stack details must be hidden behind a "Show Details" toggle.

### Claude's Discretion
- Schema chunking strategy and folder structure (e.g., `config/schemas/flow_steps/`, `config/schemas/widgets/`).
- Using a backend script to generate these JSON schema chunks from Pydantic models as the source of truth.

### Deferred Ideas (OUT OF SCOPE)
- Full release E2E matrix and release pipeline hardening remain in Phase 13.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `monaco-yaml` | latest | Editor YAML support | Provides language server features directly in browser |
| `@monaco-editor/react` | ^4.7.0 | Editor React component | Already in use, robust integration |
| `pydantic` | >=2.10.0 | Schema Validation | Backend validation & JSON schema generation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Server-Sent Events (SSE) | N/A | Streaming output | Use for progressive script execution output |

## Architecture Patterns

### Recommended Project Structure
```
config/
└── schemas/                      # Unified JSON Schemas
    ├── flow_steps/               # Schemas for each flow step tool
    └── widgets/                  # Schemas for front widgets
ui-react/src/
├── components/editor/
│   └── YamlEditorWorkerSetup.ts  # Vite worker config for monaco-yaml
├── lib/
│   └── schemaMerger.ts           # Utility to fetch/merge schema chunks
└── pages/
    └── Integrations.tsx          # Integration of Monaco Editor
```

### Pattern 1: Unified Chunked JSON Schema Validation
**What:** JSON Schemas are stored in a chunked, folder-based structure. Both Python and React use these. React fetches and merges these chunks to feed into `monaco-yaml` for real-time validation. Python uses the exact same schemas to validate and store detailed error paths.
**When to use:** Managing schema definitions for integrations, flows, and widgets.

### Pattern 2: Differentiated Suspended vs. Error States
**What:** Steps requiring user input (OAuth, APIKey, WebScraper Captcha/Login) emit specific states.
- `SUSPENDED`: Execution halted because required input is missing (e.g. initial setup, or scraper hit a login redirect and needs manual foreground run).
- `ERROR`: Execution halted because provided input failed (e.g. invalid API key).
Both states render UI that allows the user to open a form/webview and provide input.

### Pattern 3: WebScraper Foreground Interruption
**What:** When a WebScraper hits a 403, login page, or captcha, it transitions to `SUSPENDED`. The user must manually resume it from the UI. This manual resumption automatically runs the scraper with the webview in the foreground so the user can interact (solve captcha, log in).
**When to use:** Handling bot mitigations and auth walls in web scrapers.

### Anti-Patterns to Avoid
- **Hand-rolling PyYAML AST Parsers:** Trying to override PyYAML `SafeLoader` to track `__line__` properties. `monaco-yaml` provides standard squiggles for free.
- **Monolithic Schemas:** Storing all schemas in one giant file. They must be chunked by type.
- **Server-dependent Real-time Validation:** Calling a Python API on every keystroke to validate YAML. Use `monaco-yaml` locally instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML Error Line Mapping | Custom PyYAML Loaders with AST mapping | `monaco-yaml` + JSON Schema | PyYAML natively drops line numbers; `monaco-yaml` provides standard squiggles for free. |
| WebScraper Auth Detection | Custom regex scraping for every site | Standard HTTP status (403), URL redirects, and known captcha elements | Robustly classifying these as `SUSPENDED` prevents infinite retry loops. |
| Schema Merging | Hardcoded giant JSON files | Dynamic merging of chunked schema files | Allows scalability for new tools and future MCP/Docs generation. |

## Common Pitfalls

### Pitfall 1: Web Worker Pathing in Vite
**What goes wrong:** `monaco-yaml` silently fails to validate, or throws 404s for `yaml.worker`.
**How to avoid:** Explicitly define `window.MonacoEnvironment` and use `new Worker(new URL('...', import.meta.url))` syntax.

### Pitfall 2: Confusing SUSPENDED and ERROR
**What goes wrong:** A step fails due to bad credentials, but is marked `SUSPENDED`, confusing the user.
**How to avoid:** Enforce strict definitions. `SUSPENDED` = needs missing input. `ERROR` = provided input failed. Both allow re-entry.

## Code Examples

### Vite Web Worker Setup for monaco-yaml
```typescript
import { configureMonacoYaml } from 'monaco-yaml';

window.MonacoEnvironment = {
  getWorker(moduleId, label) {
    if (label === 'yaml') return new Worker(new URL('monaco-yaml/yaml.worker', import.meta.url));
    return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url));
  },
};
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Backend AST validation | Unified Chunked JSON Schema + Client-side Monaco | Instant feedback on invalid YAML. Schemas usable for Docs/MCP. |
| Generic FAILED state | Differentiated SUSPENDED vs ERROR | Users know exactly if they need to provide missing info vs fix bad info. |
| Background scraper fail | Suspended + Foreground manual trigger | Allows users to manually solve captchas and logins easily. |

## Open Questions

1. **Schema Generation Source of Truth**
   - Given Python is typically the source of truth, a build script (`python scripts/generate_schemas.py`) that exports Pydantic models to `config/schemas/` as chunked JSON schema files is recommended. Should this be a pre-commit hook or part of the `build.sh` pipeline?

## Sources
- User feedback directives (2026-03-07).
- Official documentation for `@monaco-editor/react` and `monaco-yaml`.
