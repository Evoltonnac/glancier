import { configureMonacoYaml } from "monaco-yaml";
import type { IDisposable, editor } from "monaco-editor";
import type * as Monaco from "monaco-editor";
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

// Use Vite's ?worker import syntax for proper worker bundling
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import YamlWorker from "../../workers/yaml.worker?worker";

// Import schema directly to let Vite bundle it
import bundledSchema from "../../../../config/schemas/integration.schema.json";

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

const SCHEMA_URI = "inmemory://schema/integration.schema.json";

const FALLBACK_INTEGRATION_SCHEMA: JsonSchema = bundledSchema || {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Integration",
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    flow: { type: "array" },
    templates: { type: "array" },
  },
  required: ["flow"],
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

function getSchemaCache(): Promise<JsonSchema> {
  if (!schemaCachePromise) {
    schemaCachePromise = Promise.resolve(FALLBACK_INTEGRATION_SCHEMA);
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
