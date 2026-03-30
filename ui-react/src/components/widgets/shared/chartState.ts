import type { ChartEncodingValidationResult } from "./chartFieldValidation";

export type ChartState =
    | { kind: "loading" }
    | { kind: "runtime_error" }
    | { kind: "config_error"; detail: Exclude<ChartEncodingValidationResult, { ok: true }> }
    | { kind: "empty" }
    | { kind: "ready" };

export type ChartSourceStatus = "idle" | "ready" | "refreshing" | "error" | "suspended";

export interface ClassifyChartStateInput {
    sourceStatus?: ChartSourceStatus;
    rows?: unknown[] | null;
    runtimeError?: unknown;
    encodingValidation: ChartEncodingValidationResult;
}

export function classifyChartState({
    sourceStatus,
    rows,
    runtimeError,
    encodingValidation,
}: ClassifyChartStateInput): ChartState {
    if (sourceStatus === "refreshing") {
        return { kind: "loading" };
    }

    if (sourceStatus === "error" || runtimeError) {
        return { kind: "runtime_error" };
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        return { kind: "empty" };
    }

    if (!encodingValidation.ok) {
        return { kind: "config_error", detail: encodingValidation };
    }

    return { kind: "ready" };
}
