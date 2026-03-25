import { describe, expect, it } from "vitest";

import { classifyChartState } from "./shared/chartState";

const sqlRows = [
    {
        ts: "2026-03-01T00:00:00Z",
        category: "Alpha",
        amount: 12.5,
        label: "North",
        count: 3,
    },
    {
        ts: "2026-03-02T00:00:00Z",
        category: "Beta",
        amount: 18.25,
        label: "South",
        count: 7,
    },
    {
        ts: "2026-03-03T00:00:00Z",
        category: "Alpha",
        amount: 9.75,
        label: "East",
        count: 5,
    },
    {
        ts: "2026-03-04T00:00:00Z",
        category: "Gamma",
        amount: 21.1,
        label: "West",
        count: 11,
    },
];

describe("classifyChartState", () => {
    it("returns loading when source status is refreshing", () => {
        expect(
            classifyChartState({
                sourceStatus: "refreshing",
                rows: sqlRows,
                encodingValidation: { ok: true },
            }),
        ).toEqual({ kind: "loading" });
    });

    it("returns runtime_error when source status is error", () => {
        expect(
            classifyChartState({
                sourceStatus: "error",
                rows: sqlRows,
                encodingValidation: { ok: true },
            }),
        ).toEqual({ kind: "runtime_error" });
    });

    it("returns config_error when encoding validation fails", () => {
        expect(
            classifyChartState({
                sourceStatus: "ready",
                rows: sqlRows,
                encodingValidation: {
                    ok: false,
                    kind: "config_error",
                    code: "unknown_field",
                    channel: "y",
                    field: "missing_metric",
                },
            }),
        ).toEqual({
            kind: "config_error",
            detail: {
                ok: false,
                kind: "config_error",
                code: "unknown_field",
                channel: "y",
                field: "missing_metric",
            },
        });
    });

    it("returns empty when rows are empty", () => {
        expect(
            classifyChartState({
                sourceStatus: "ready",
                rows: [],
                encodingValidation: { ok: true },
            }),
        ).toEqual({ kind: "empty" });
    });

    it("returns ready only when rows and mapping are valid", () => {
        expect(
            classifyChartState({
                sourceStatus: "ready",
                rows: sqlRows,
                encodingValidation: { ok: true },
            }),
        ).toEqual({ kind: "ready" });
    });
});
