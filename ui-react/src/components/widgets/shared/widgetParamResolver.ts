import { evaluateTemplate } from "../../../lib/utils";

const TEMPLATE_PATTERN = /\{[^{}]+\}/;

function hasTemplateSyntax(value: unknown): value is string {
    return typeof value === "string" && TEMPLATE_PATTERN.test(value);
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

            if (evaluatedValue !== rawValue) {
                if (!nextRecord) {
                    nextRecord = { ...rawRecord };
                }
                nextRecord[key] = evaluatedValue;
            }
        }

        return nextRecord ?? rawRecord;
    }

    return input;
}
