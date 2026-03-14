import { evaluateTemplate } from "../../../lib/utils";

const TEMPLATE_PATTERN = /\{[^{}]+\}/;

const SIZE_VALUES = new Set(["sm", "md", "lg", "xl"]);
const SPACING_VALUES = new Set(["none", "sm", "md", "lg"]);
const TONE_VALUES = new Set([
    "default",
    "muted",
    "info",
    "success",
    "warning",
    "danger",
]);
const ALIGN_VALUES = new Set(["start", "center", "end"]);
const LAYOUT_VALUES = new Set(["col", "grid"]);
const SORT_ORDER_VALUES = new Set(["asc", "desc"]);
const WEIGHT_VALUES = new Set(["normal", "medium", "semibold", "bold"]);
const PROGRESS_STYLE_VALUES = new Set(["bar", "ring"]);

const NUMERIC_TEMPLATE_KEYS = new Set([
    "columns",
    "limit",
    "page_size",
    "maxLines",
    "max_lines",
    "width",
    "warning",
    "danger",
]);

const BOOLEAN_TEMPLATE_KEYS = new Set(["pagination", "wrap", "showPercentage"]);

function hasTemplateSyntax(value: unknown): value is string {
    return typeof value === "string" && TEMPLATE_PATTERN.test(value);
}

function normalizeEnumValue(
    rawValue: unknown,
    resolvedValue: unknown,
    allowedValues: Set<string>,
): unknown {
    if (typeof resolvedValue !== "string") {
        return resolvedValue;
    }

    const normalized = resolvedValue.trim().toLowerCase();
    if (allowedValues.has(normalized)) {
        return normalized;
    }

    if (hasTemplateSyntax(rawValue)) {
        return undefined;
    }

    return resolvedValue;
}

function coerceTemplatePrimitive(rawValue: unknown, resolvedValue: unknown, key: string): unknown {
    if (!hasTemplateSyntax(rawValue) || typeof resolvedValue !== "string") {
        return resolvedValue;
    }

    const trimmed = resolvedValue.trim();

    if (NUMERIC_TEMPLATE_KEYS.has(key)) {
        if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
            return Number(trimmed);
        }
        return undefined;
    }

    if (BOOLEAN_TEMPLATE_KEYS.has(key)) {
        if (/^true$/i.test(trimmed)) {
            return true;
        }
        if (/^false$/i.test(trimmed)) {
            return false;
        }
        return undefined;
    }

    return resolvedValue;
}

function normalizeWidgetParam(
    parentType: string | undefined,
    key: string,
    rawValue: unknown,
    resolvedValue: unknown,
): unknown {
    const coerced = coerceTemplatePrimitive(rawValue, resolvedValue, key);

    if (key === "size") {
        return normalizeEnumValue(rawValue, coerced, SIZE_VALUES);
    }

    if (key === "spacing") {
        return normalizeEnumValue(rawValue, coerced, SPACING_VALUES);
    }

    if (key === "tone") {
        return normalizeEnumValue(rawValue, coerced, TONE_VALUES);
    }

    if (key === "align_x" || key === "align_y") {
        return normalizeEnumValue(rawValue, coerced, ALIGN_VALUES);
    }

    if (key === "layout") {
        return normalizeEnumValue(rawValue, coerced, LAYOUT_VALUES);
    }

    if (key === "sort_order") {
        return normalizeEnumValue(rawValue, coerced, SORT_ORDER_VALUES);
    }

    if (key === "weight") {
        return normalizeEnumValue(rawValue, coerced, WEIGHT_VALUES);
    }

    if (parentType === "Progress" && key === "style") {
        return normalizeEnumValue(rawValue, coerced, PROGRESS_STYLE_VALUES);
    }

    return coerced;
}

export function resolveWidgetParams(
    input: unknown,
    data: Record<string, any>,
    parentType?: string,
): unknown {
    if (typeof input === "string") {
        return hasTemplateSyntax(input) ? evaluateTemplate(input, data) : input;
    }

    if (Array.isArray(input)) {
        let nextArray: unknown[] | undefined;

        for (let i = 0; i < input.length; i += 1) {
            const rawItem = input[i];
            const resolvedItem = resolveWidgetParams(rawItem, data, parentType);
            if (resolvedItem !== rawItem) {
                if (!nextArray) {
                    nextArray = input.slice();
                }
                nextArray[i] = resolvedItem;
            }
        }

        return nextArray ?? input;
    }

    if (input && typeof input === "object") {
        const rawRecord = input as Record<string, unknown>;
        const currentType =
            typeof rawRecord.type === "string" ? rawRecord.type : parentType;

        let nextRecord: Record<string, unknown> | undefined;

        for (const [key, rawValue] of Object.entries(rawRecord)) {
            const shouldSkipListRender = currentType === "List" && key === "render";
            const evaluatedValue = shouldSkipListRender
                ? rawValue
                : resolveWidgetParams(rawValue, data, currentType);
            const normalizedValue = normalizeWidgetParam(
                currentType,
                key,
                rawValue,
                evaluatedValue,
            );

            if (normalizedValue !== rawValue) {
                if (!nextRecord) {
                    nextRecord = { ...rawRecord };
                }
                nextRecord[key] = normalizedValue;
            }
        }

        return nextRecord ?? rawRecord;
    }

    return input;
}
