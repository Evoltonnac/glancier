import { describe, expect, it } from "vitest";

import {
    ChartAreaSchema,
    ChartBarSchema,
    ChartLineSchema,
    ChartPieSchema,
    ChartTableSchema,
} from "./shared/chartSchemas";
import { validateChartEncoding } from "./shared/chartFieldValidation";

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

const sqlFields = [
    { name: "ts", type: "datetime" },
    { name: "category", type: "text" },
    { name: "amount", type: "float" },
    { name: "label", type: "text" },
    { name: "count", type: "integer" },
];

describe("chart schemas", () => {
    it("Chart.Line requires encoding.x.field and encoding.y.field with deterministic issue paths", () => {
        const missingChannels = ChartLineSchema.safeParse({
            type: "Chart.Line",
            data_source: "sql_response.rows",
            encoding: {
                x: { field: "ts" },
            },
        });

        expect(missingChannels.success).toBe(false);
        expect(missingChannels.error?.issues.map((issue) => issue.path.join("."))).toContain(
            "encoding.y.field",
        );

        const validChart = ChartLineSchema.safeParse({
            type: "Chart.Line",
            data_source: "sql_response.rows",
            title: "Revenue",
            encoding: {
                x: { field: "ts" },
                y: { field: "amount" },
                series: { field: "category" },
            },
        });

        expect(validChart.success).toBe(true);
    });

    it("Chart.Pie requires encoding.label.field and encoding.value.field", () => {
        const missingChannels = ChartPieSchema.safeParse({
            type: "Chart.Pie",
            data_source: "sql_response.rows",
            encoding: {
                label: { field: "label" },
            },
        });

        expect(missingChannels.success).toBe(false);
        expect(missingChannels.error?.issues.map((issue) => issue.path.join("."))).toContain(
            "encoding.value.field",
        );

        const validChart = ChartPieSchema.safeParse({
            type: "Chart.Pie",
            data_source: "sql_response.rows",
            encoding: {
                label: { field: "label" },
                value: { field: "count" },
            },
        });

        expect(validChart.success).toBe(true);
    });

    it("Chart.Table accepts columns entries and rejects unknown field references", () => {
        const validTable = ChartTableSchema.safeParse({
            type: "Chart.Table",
            data_source: "sql_response.rows",
            title: "Top regions",
            columns: [
                { field: "label", title: "Region" },
                { field: "amount", title: "Revenue", format: "currency" },
                { field: "count", format: "integer" },
            ],
            sort_by: "amount",
            sort_order: "desc",
            limit: 3,
        });

        expect(validTable.success).toBe(true);

        const invalidField = validateChartEncoding(
            "Chart.Table",
            {
                columns: [{ field: "missing_field", title: "Missing" }],
            },
            sqlFields,
        );

        expect(invalidField).toEqual({
            ok: false,
            kind: "config_error",
            code: "unknown_field",
            channel: "columns",
            field: "missing_field",
        });
    });

    it("rejects unknown fields and incompatible numeric channels against sql_response.fields", () => {
        expect(
            validateChartEncoding(
                "Chart.Bar",
                {
                    x: { field: "ts" },
                    y: { field: "missing_metric" },
                },
                sqlFields,
            ),
        ).toEqual({
            ok: false,
            kind: "config_error",
            code: "unknown_field",
            channel: "y",
            field: "missing_metric",
        });

        expect(
            validateChartEncoding(
                "Chart.Area",
                {
                    x: { field: "ts" },
                    y: { field: "category" },
                },
                sqlFields,
            ),
        ).toEqual({
            ok: false,
            kind: "config_error",
            code: "invalid_field_type",
            channel: "y",
            field: "category",
        });

        expect(sqlRows).toHaveLength(4);
        expect(ChartAreaSchema.shape.type.value).toBe("Chart.Area");
        expect(ChartBarSchema.shape.type.value).toBe("Chart.Bar");
    });
});
