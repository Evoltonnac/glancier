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
];

const COMPAT_WIDGET_DEF_EXPORTS = [
    "Container",
    "ColumnSet",
    "Column",
    "List",
    "TextBlock",
    "FactSet",
    "Image",
    "Badge",
    "Progress",
    "ActionSet",
    "Action.OpenUrl",
    "Action.Copy",
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

    const schemaPostProcessHelper = `
const TEMPLATE_SYNTAX_PATTERN = "^\\\\{.*\\\\}$";
const TEMPLATE_DEF_REF = "#/$defs/templatedString";
const SHARED_ENUM_VALUES = {
  spacingValue: ["none", "sm", "md", "lg"],
  sizeValue: ["sm", "md", "lg", "xl"],
  toneValue: ["default", "muted", "info", "success", "warning", "danger"],
  alignValue: ["start", "center", "end"],
};
const ENUM_ANNOTATION_KEYS = [
  "default",
  "title",
  "description",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
];

function isTemplatePatternSchema(node) {
  return (
    node &&
    typeof node === "object" &&
    node.type === "string" &&
    node.pattern === TEMPLATE_SYNTAX_PATTERN
  );
}

function isTemplateRefSchema(node) {
  return (
    node &&
    typeof node === "object" &&
    node.$ref === TEMPLATE_DEF_REF
  );
}

function hasTemplateFallback(node) {
  if (!node || typeof node !== "object" || !Array.isArray(node.anyOf)) {
    return false;
  }

  return node.anyOf.some(
    (item) => isTemplatePatternSchema(item) || isTemplateRefSchema(item)
  );
}

function isPlainStringSchema(node) {
  if (!node || typeof node !== "object" || node.type !== "string") {
    return false;
  }

  return (
    !Array.isArray(node.enum) &&
    node.const === undefined &&
    node.pattern === undefined
  );
}

function wrapPropertySchemaForTemplate(node) {
  if (!node || typeof node !== "object") {
    return node;
  }

  if (hasTemplateFallback(node) || isPlainStringSchema(node)) {
    return node;
  }

  return {
    anyOf: [
      node,
      { type: "string", pattern: TEMPLATE_SYNTAX_PATTERN }
    ],
  };
}

function walkSchema(schema, onNode) {
  const stack = [schema];
  const processed = new WeakSet();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") {
      continue;
    }

    if (processed.has(node)) {
      continue;
    }
    processed.add(node);
    onNode(node);

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
}

function rewriteRootRefs(schema, targetRef) {
  walkSchema(schema, (node) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && value === "#") {
        node[key] = targetRef;
      } else if (key === "$schema") {
        delete node[key];
      }
    }
  });
  return schema;
}

function replaceTemplateFallbackWithDefRef(schema) {
  walkSchema(schema, (node) => {
    if (!Array.isArray(node.anyOf)) {
      return;
    }

    node.anyOf = node.anyOf.map((item) =>
      isTemplatePatternSchema(item) || isTemplateRefSchema(item)
        ? { $ref: TEMPLATE_DEF_REF }
        : item,
    );
  });
  return schema;
}

function hasExactStringEnum(node, values) {
  return (
    node &&
    typeof node === "object" &&
    node.type === "string" &&
    Array.isArray(node.enum) &&
    node.enum.length === values.length &&
    node.enum.every((item, index) => item === values[index])
  );
}

function createEnumRefBranch(refName, schemaNode) {
  const refBranch = {
    $ref: "#/$defs/" + refName,
  };
  for (const key of ENUM_ANNOTATION_KEYS) {
    if (schemaNode[key] !== undefined) {
      refBranch[key] = schemaNode[key];
    }
  }
  return refBranch;
}

function extractNonTemplateBranch(schemaNode) {
  if (!schemaNode || typeof schemaNode !== "object") {
    return null;
  }
  if (!Array.isArray(schemaNode.anyOf)) {
    return schemaNode;
  }
  for (const branch of schemaNode.anyOf) {
    if (!isTemplatePatternSchema(branch) && !isTemplateRefSchema(branch)) {
      return branch;
    }
  }
  return null;
}

function applySharedEnumReferences(schema) {
  walkSchema(schema, (node) => {
    if (!Array.isArray(node.anyOf) || node.anyOf.length !== 2) {
      return;
    }

    const templateIndex = node.anyOf.findIndex(
      (item) => isTemplatePatternSchema(item) || isTemplateRefSchema(item),
    );
    if (templateIndex === -1) {
      return;
    }

    const valueIndex = templateIndex === 0 ? 1 : 0;
    const valueBranch = node.anyOf[valueIndex];
    const enumRefName = Object.entries(SHARED_ENUM_VALUES).find(([, enumValues]) =>
      hasExactStringEnum(valueBranch, enumValues),
    )?.[0];

    if (!enumRefName) {
      return;
    }

    node.anyOf[valueIndex] = createEnumRefBranch(enumRefName, valueBranch);
    node.anyOf[templateIndex] = { $ref: TEMPLATE_DEF_REF };
  });
  return schema;
}

function getWidgetTypeName(widgetSchema) {
  const typeSchema = widgetSchema?.properties?.type;
  if (!typeSchema || typeof typeSchema !== "object") {
    return null;
  }

  if (typeof typeSchema.const === "string") {
    return typeSchema.const;
  }

  if (Array.isArray(typeSchema.anyOf)) {
    const literalSchema = typeSchema.anyOf.find(
      (branch) =>
        branch &&
        typeof branch === "object" &&
        typeof branch.const === "string",
    );
    return literalSchema?.const ?? null;
  }

  return null;
}

function cloneSchema(schema) {
  return JSON.parse(JSON.stringify(schema));
}

function extractWidgetDefinitions(widgetTreeSchema) {
  const definitions = {};
  const oneOf = Array.isArray(widgetTreeSchema.oneOf) ? widgetTreeSchema.oneOf : [];

  for (const widgetSchema of oneOf) {
    const typeName = getWidgetTypeName(widgetSchema);
    if (!typeName) {
      continue;
    }
    definitions[typeName] = cloneSchema(widgetSchema);
  }

  const columnSetSchema = definitions.ColumnSet;
  const columnsSchema = extractNonTemplateBranch(columnSetSchema?.properties?.columns);
  const columnItemSchema =
    columnsSchema &&
    typeof columnsSchema === "object" &&
    columnsSchema.items &&
    typeof columnsSchema.items === "object"
      ? columnsSchema.items
      : null;

  if (columnItemSchema) {
    definitions.Column = cloneSchema(columnItemSchema);
  }

  return definitions;
}

function buildRefOneOf(definitionNames, allowedNames) {
  return {
    oneOf: definitionNames
      .filter((name) => allowedNames.has(name))
      .map((name) => ({ $ref: "#/$defs/" + name })),
  };
}

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

    if (node.type === "object" && node.properties && typeof node.properties === "object") {
      for (const [propertyKey, propertySchema] of Object.entries(node.properties)) {
        if (!propertySchema || typeof propertySchema !== "object") {
          continue;
        }
        node.properties[propertyKey] = wrapPropertySchemaForTemplate(propertySchema);
      }
    }

    if (
      node.type === "object" &&
      node.additionalProperties &&
      typeof node.additionalProperties === "object"
    ) {
      node.additionalProperties = wrapPropertySchemaForTemplate(node.additionalProperties);
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

    return `${importLines.join("\n")}

${schemaPostProcessHelper}

export function buildSduiSchemaFragment() {
  const widgetTreeSchema = finalizeSchemaForEditor(
    z.toJSONSchema(WidgetSchema, { target: "draft-2020-12", io: "input" }),
  );
  rewriteRootRefs(widgetTreeSchema, "#/$defs/Widget");
  replaceTemplateFallbackWithDefRef(widgetTreeSchema);

  const widgetDefinitions = extractWidgetDefinitions(widgetTreeSchema);
  for (const schema of Object.values(widgetDefinitions)) {
    replaceTemplateFallbackWithDefRef(schema);
    applySharedEnumReferences(schema);
  }

  const definitionNames = new Set(Object.keys(widgetDefinitions));
  const defs = {
    templatedString: {
      type: "string",
      pattern: TEMPLATE_SYNTAX_PATTERN,
    },
    spacingValue: {
      type: "string",
      enum: SHARED_ENUM_VALUES.spacingValue,
    },
    sizeValue: {
      type: "string",
      enum: SHARED_ENUM_VALUES.sizeValue,
    },
    toneValue: {
      type: "string",
      enum: SHARED_ENUM_VALUES.toneValue,
    },
    alignValue: {
      type: "string",
      enum: SHARED_ENUM_VALUES.alignValue,
    },
    ...widgetDefinitions,
    ContainerWidget: buildRefOneOf(
      ["Container", "ColumnSet", "List"],
      definitionNames,
    ),
    PrimitiveWidget: buildRefOneOf(
      [
        "TextBlock",
        "FactSet",
        "Image",
        "Badge",
        "Progress",
        "ActionSet",
        "Action.OpenUrl",
        "Action.Copy",
        "Chart.Line",
        "Chart.Bar",
        "Chart.Area",
        "Chart.Pie",
        "Chart.Table",
      ],
      definitionNames,
    ),
    Widget: {
      oneOf: [
        { $ref: "#/$defs/ContainerWidget" },
        { $ref: "#/$defs/PrimitiveWidget" },
      ],
    },
  };

  for (const schema of Object.values(defs)) {
    if (schema && typeof schema === "object") {
      replaceTemplateFallbackWithDefRef(schema);
      applySharedEnumReferences(schema);
    }
  }

  const widgetDefs = {};
  for (const name of ${JSON.stringify(COMPAT_WIDGET_DEF_EXPORTS)}) {
    if (definitionNames.has(name)) {
      widgetDefs[name] = { $ref: "#/$defs/" + name };
    }
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Glanceus React SDUI Fragment",
    description: "Generated from React SDUI zod schemas.",
    $defs: defs,
    widget_tree: { $ref: "#/$defs/Widget" },
    widget_defs: widgetDefs,
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
