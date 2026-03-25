export type ChartTableFormat = "number" | "percent" | "datetime" | "text";

const numberFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});

function formatNumber(value: unknown): string {
    if (typeof value === "number" && Number.isFinite(value)) {
        return numberFormatter.format(value);
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return numberFormatter.format(parsed);
        }
    }

    return String(value ?? "");
}

function formatPercent(value: unknown): string {
    if (typeof value === "number" && Number.isFinite(value)) {
        return `${percentFormatter.format(value * 100)}%`;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return `${percentFormatter.format(parsed * 100)}%`;
        }
    }

    return String(value ?? "");
}

function formatDatetime(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }

    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
    }

    return String(value ?? "");
}

function formatText(value: unknown): string {
    return String(value ?? "");
}

export const chartFormatters: Record<ChartTableFormat, (value: unknown) => string> = {
    number: formatNumber,
    percent: formatPercent,
    datetime: formatDatetime,
    text: formatText,
};

export function formatChartTableValue(value: unknown, format?: string): string {
    const formatter = format ? chartFormatters[format as ChartTableFormat] : undefined;
    return formatter ? formatter(value) : formatText(value);
}
