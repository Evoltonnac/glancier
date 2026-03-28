export type SqlFieldMetadata = {
    name: string;
    type?: string | null;
};

export type ChartEncodingChannel = {
    field?: string;
};

export type ChartEncoding = Partial<{
    x: ChartEncodingChannel;
    y: ChartEncodingChannel;
    series: ChartEncodingChannel;
    value: ChartEncodingChannel;
    label: ChartEncodingChannel;
    columns: Array<{ field: string; title?: string; format?: string }>;
}>;

export type ChartEncodingValidationResult =
    | { ok: true }
    | {
          ok: false;
          kind: "config_error";
          code:
              | "missing_required_channel"
              | "unknown_field"
              | "invalid_field_type";
          channel: string;
          field?: string;
          path?: string;
      };

const NUMERIC_TYPES = new Set(["integer", "float", "decimal", "number"]);
const TEMPORAL_TYPES = new Set(["datetime", "date", "timestamp"]);
const CATEGORICAL_TYPES = new Set(["text", "string", "boolean"]);

function isNumericLike(value: unknown): boolean {
    if (typeof value === "number") {
        return Number.isFinite(value);
    }

    if (typeof value !== "string") {
        return false;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return false;
    }

    return !Number.isNaN(Number(trimmed));
}

function inferFieldType(values: unknown[]): string | null {
    const nonNullValues = values.filter((value) => value != null);
    if (nonNullValues.length === 0) {
        return null;
    }

    if (nonNullValues.every((value) => isNumericLike(value))) {
        return "number";
    }

    if (nonNullValues.every((value) => typeof value === "boolean")) {
        return "boolean";
    }

    if (
        nonNullValues.every(
            (value) =>
                typeof value === "string" && !Number.isNaN(new Date(value).getTime()),
        )
    ) {
        return "datetime";
    }

    return "string";
}

export function deriveSqlFieldsFromRows(
    rows: Array<Record<string, unknown>> | undefined,
): SqlFieldMetadata[] {
    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }

    const fieldNames = Array.from(
        new Set(rows.flatMap((row) => Object.keys(row ?? {}))),
    );

    return fieldNames.map((name) => ({
        name,
        type: inferFieldType(rows.map((row) => row?.[name])),
    }));
}

function normalizeFieldType(type?: string | null): string {
    return String(type ?? "").trim().toLowerCase();
}

function requiredChannelsFor(chartType: string): string[] {
    switch (chartType) {
        case "Chart.Line":
        case "Chart.Bar":
        case "Chart.Area":
            return ["x", "y"];
        case "Chart.Pie":
            return ["label", "value"];
        default:
            return [];
    }
}

function channelAllowsType(channel: string, normalizedType: string): boolean {
    if (channel === "x") {
        return TEMPORAL_TYPES.has(normalizedType) || CATEGORICAL_TYPES.has(normalizedType);
    }

    if (channel === "y" || channel === "value") {
        return NUMERIC_TYPES.has(normalizedType);
    }

    if (channel === "series" || channel === "label") {
        return TEMPORAL_TYPES.has(normalizedType) || CATEGORICAL_TYPES.has(normalizedType);
    }

    return true;
}

export function validateChartEncoding(
    chartType: string,
    encoding: ChartEncoding | undefined,
    sqlFields: SqlFieldMetadata[] | undefined,
): ChartEncodingValidationResult {
    const fieldIndex = new Map((sqlFields ?? []).map((field) => [field.name, field]));
    const safeEncoding = encoding ?? {};

    for (const channel of requiredChannelsFor(chartType)) {
        const selected = safeEncoding[channel as keyof ChartEncoding] as ChartEncodingChannel | undefined;
        if (!selected?.field) {
            return {
                ok: false,
                kind: "config_error",
                code: "missing_required_channel",
                channel,
                path: `encoding.${channel}.field`,
            };
        }
    }

    if (chartType === "Chart.Table" && fieldIndex.size === 0) {
        return { ok: true };
    }

    for (const channel of ["x", "y", "series", "value", "label"] as const) {
        const selected = safeEncoding[channel];
        if (!selected?.field) {
            continue;
        }

        const matchedField = fieldIndex.get(selected.field);
        if (!matchedField) {
            return {
                ok: false,
                kind: "config_error",
                code: "unknown_field",
                channel,
                field: selected.field,
                path: `encoding.${channel}.field`,
            };
        }

        const normalizedType = normalizeFieldType(matchedField.type);
        if (!channelAllowsType(channel, normalizedType)) {
            return {
                ok: false,
                kind: "config_error",
                code: "invalid_field_type",
                channel,
                field: selected.field,
                path: `encoding.${channel}.field`,
            };
        }
    }

    for (const [index, column] of (safeEncoding.columns ?? []).entries()) {
        if (!fieldIndex.has(column.field)) {
            return {
                ok: false,
                kind: "config_error",
                code: "unknown_field",
                channel: "columns",
                field: column.field,
                path: `encoding.columns[${index}].field`,
            };
        }
    }

    return { ok: true };
}
