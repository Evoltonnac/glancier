export type SqlFieldMetadata = {
    name: string;
    type?: string | null;
};

export type ChartEncodingChannel = {
    field: string;
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
      };

const NUMERIC_TYPES = new Set(["integer", "float", "decimal", "number"]);
const TEMPORAL_TYPES = new Set(["datetime", "date", "timestamp"]);
const CATEGORICAL_TYPES = new Set(["text", "string", "boolean"]);

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
            };
        }
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
            };
        }
    }

    for (const column of safeEncoding.columns ?? []) {
        if (!fieldIndex.has(column.field)) {
            return {
                ok: false,
                kind: "config_error",
                code: "unknown_field",
                channel: "columns",
                field: column.field,
            };
        }
    }

    return { ok: true };
}
