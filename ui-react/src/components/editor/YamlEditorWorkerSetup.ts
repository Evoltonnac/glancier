import { configureMonacoYaml } from "monaco-yaml";
import type { IDisposable, editor } from "monaco-editor";
import type * as Monaco from "monaco-editor";
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

// Use Vite's ?worker import syntax for proper worker bundling
// This is the official workaround recommended by monaco-yaml for Vite:
// https://github.com/remcohaszing/monaco-yaml#why-doesnt-it-work-with-vite
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import YamlWorker from "../../workers/yaml.worker?worker";

// Tell @monaco-editor/react to use locally installed monaco-editor instead of CDN
loader.config({ monaco });

export interface IntegrationDiagnostic {
  source: "backend" | "editor";
  message: string;
  code?: string;
  line?: number;
  column?: number;
  fieldPath?: string;
}

type JsonSchema = Record<string, unknown>;

const SCHEMA_PATH = "/config/schemas/integration.schema.json";
const LOCAL_SCHEMA_PATH = new URL(
  "../../../../config/schemas/integration.schema.json",
  import.meta.url,
).toString();
const SCHEMA_URI = "inmemory://schema/integration.schema.json";

const FALLBACK_INTEGRATION_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "IntegrationFile",
  type: "object",
  properties: {
    integrations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          flow: { type: "array" },
          templates: { type: "array" },
        },
        required: ["id", "flow"],
        additionalProperties: false,
      },
    },
  },
  required: ["integrations"],
  additionalProperties: false,
};

let workerInitialized = false;
let yamlConfiguration: IDisposable | null = null;
let schemaCachePromise: Promise<JsonSchema> | null = null;

function ensureMonacoEnvironment() {
  if (workerInitialized) {
    return;
  }

  const targetWindow = window as Window & {
    MonacoEnvironment?: {
      getWorker: (moduleId: string, label: string) => Worker;
    };
  };

  targetWindow.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      if (label === "yaml" || _moduleId.includes("monaco-yaml/yaml.worker")) {
        return new YamlWorker();
      }
      return new EditorWorker();
    },
  };

  workerInitialized = true;
}

async function fetchJson(url: string): Promise<JsonSchema | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    return payload as JsonSchema;
  } catch {
    return null;
  }
}

async function loadSchema(): Promise<JsonSchema> {
  const schema = await fetchJson(SCHEMA_PATH);
  if (schema) {
    return schema;
  }
  const bundledSchema = await fetchJson(LOCAL_SCHEMA_PATH);
  if (bundledSchema) {
    return bundledSchema;
  }
  return schema ?? FALLBACK_INTEGRATION_SCHEMA;
}

function getSchemaCache(): Promise<JsonSchema> {
  if (!schemaCachePromise) {
    schemaCachePromise = loadSchema();
  }
  return schemaCachePromise;
}

export async function setupYamlWorker(
  monaco: typeof Monaco,
  options?: { fileMatch?: string[] },
): Promise<void> {
  ensureMonacoEnvironment();
  const schema = await getSchemaCache();

  if (yamlConfiguration) {
    yamlConfiguration.dispose();
  }

  yamlConfiguration = configureMonacoYaml(monaco, {
    validate: true,
    completion: true,
    hover: true,
    format: true,
    isKubernetes: false,
    enableSchemaRequest: false,
    schemas: [
      {
        uri: SCHEMA_URI,
        fileMatch: options?.fileMatch ?? ["**/*.yaml", "**/*.yml"],
        schema,
      },
    ],
  });
}

export function markersToDiagnostics(
  markers: editor.IMarker[],
): IntegrationDiagnostic[] {
  return markers.map((marker) => ({
    source: "editor",
    message: marker.message,
    code: marker.code ? String(marker.code) : "yaml.validation",
    line: marker.startLineNumber,
    column: marker.startColumn,
  }));
}
