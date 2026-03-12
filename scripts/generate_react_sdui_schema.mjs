#!/usr/bin/env node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const UI_ROOT = path.join(REPO_ROOT, "ui-react");
const ESBUILD_MAIN = path.join(
    UI_ROOT,
    "node_modules",
    "esbuild",
    "lib",
    "main.js",
);

const WIDGET_SCHEMA_IMPORTS = [
    ["WidgetSchema", "src/components/widgets/WidgetRenderer.tsx"],
    ["ContainerSchema", "src/components/widgets/layouts/Container.tsx"],
    ["ColumnSetSchema", "src/components/widgets/layouts/ColumnSet.tsx"],
    ["ColumnSchema", "src/components/widgets/layouts/Column.tsx"],
    ["ListSchema", "src/components/widgets/containers/List.tsx"],
    ["TextBlockSchema", "src/components/widgets/elements/TextBlock.tsx"],
    ["FactSetSchema", "src/components/widgets/elements/FactSet.tsx"],
    ["ImageSchema", "src/components/widgets/elements/Image.tsx"],
    ["BadgeSchema", "src/components/widgets/elements/Badge.tsx"],
    ["ProgressSchema", "src/components/widgets/visualizations/Progress.tsx"],
    ["ActionSetSchema", "src/components/widgets/actions/ActionSet.tsx"],
    ["ActionOpenUrlSchema", "src/components/widgets/actions/ActionOpenUrl.tsx"],
    ["ActionCopySchema", "src/components/widgets/actions/ActionCopy.tsx"],
];

function parseArgs() {
    const [, , outputPath] = process.argv;
    if (!outputPath) {
        throw new Error(
            "Usage: node scripts/generate_react_sdui_schema.mjs <output_path>",
        );
    }
    return { outputPath: path.resolve(outputPath) };
}

function buildEntrySource() {
    const importLines = [
        `import { z } from "zod";`,
        ...WIDGET_SCHEMA_IMPORTS.map(([symbol, sourcePath]) => {
            const fullPath = path.join(UI_ROOT, sourcePath);
            return `import { ${symbol} } from ${JSON.stringify(fullPath)};`;
        }),
    ];

    const widgetDefs = [
        ["Container", "ContainerSchema"],
        ["ColumnSet", "ColumnSetSchema"],
        ["Column", "ColumnSchema"],
        ["List", "ListSchema"],
        ["TextBlock", "TextBlockSchema"],
        ["FactSet", "FactSetSchema"],
        ["Image", "ImageSchema"],
        ["Badge", "BadgeSchema"],
        ["Progress", "ProgressSchema"],
        ["ActionSet", "ActionSetSchema"],
        ["Action.OpenUrl", "ActionOpenUrlSchema"],
        ["Action.Copy", "ActionCopySchema"],
    ];

    const schemaPostProcessHelper = `
function finalizeSchemaForEditor(schema) {
  const stack = [schema];
  const processed = new WeakSet();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") {
      continue;
    }

    if (processed.has(node)) continue;
    processed.add(node);

    if (node.type === "object" && node.properties && node.additionalProperties === undefined) {
      node.additionalProperties = false;
    }

    if (Array.isArray(node.required) && node.required.length === 0) {
      delete node.required;
    }

    if (typeof node.type === "string" && ["number", "integer", "boolean"].includes(node.type)) {
      const originalType = node.type;
      const primitiveDef = { type: originalType };
      processed.add(primitiveDef);
      
      const constraints = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"];
      for (const c of constraints) {
        if (node[c] !== undefined) {
          primitiveDef[c] = node[c];
          delete node[c];
        }
      }
      delete node.type;
      node.anyOf = [
        primitiveDef,
        { type: "string", pattern: "^\\\\{.*\\\\}$" }
      ];
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            stack.push(item);
          }
        }
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }
  return schema;
}
`;

    const defLines = widgetDefs.map(
        ([name, symbol]) =>
            `${JSON.stringify(name)}: finalizeSchemaForEditor(z.toJSONSchema(${symbol}, { target: "draft-2020-12", io: "input" })),`,
    );

    return `${importLines.join("\n")}

${schemaPostProcessHelper}

export function buildSduiSchemaFragment() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Glancier React SDUI Fragment",
    description: "Generated from React SDUI zod schemas.",
    widget_tree: finalizeSchemaForEditor(z.toJSONSchema(WidgetSchema, { target: "draft-2020-12", io: "input" })),
    widget_defs: {
      ${defLines.join("\n      ")}
    },
  };
}
`;
}

async function loadEsbuild() {
    const moduleUrl = pathToFileURL(ESBUILD_MAIN).href;
    return import(moduleUrl);
}

async function generateSduiFragment(outputPath) {
    const { build } = await loadEsbuild();

    const tempRoot = await mkdtemp(path.join(tmpdir(), "react-sdui-schema-"));
    const entryPath = path.join(tempRoot, "entry.ts");
    const bundlePath = path.join(tempRoot, "bundle.mjs");

    try {
        await writeFile(entryPath, buildEntrySource(), "utf-8");

        await build({
            entryPoints: [entryPath],
            outfile: bundlePath,
            bundle: true,
            format: "esm",
            platform: "node",
            absWorkingDir: UI_ROOT,
            nodePaths: [path.join(UI_ROOT, "node_modules")],
            logLevel: "silent",
        });

        const moduleUrl = `${pathToFileURL(bundlePath).href}?t=${Date.now()}`;
        const { buildSduiSchemaFragment } = await import(moduleUrl);
        const fragment = buildSduiSchemaFragment();

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(
            outputPath,
            `${JSON.stringify(fragment, null, 2)}\n`,
            "utf-8",
        );
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}

async function main() {
    const { outputPath } = parseArgs();
    await generateSduiFragment(outputPath);
    process.stdout.write(
        `Generated React SDUI schema fragment: ${outputPath}\n`,
    );
}

main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
});
