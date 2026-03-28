import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";

import { render } from "../../test/render";
import { ChartTable } from "./charts/ChartTable";

describe("ChartTable", () => {
    const baseWidget = {
        type: "Chart.Table" as const,
        data_source: [
            {
                region: "West",
                revenue: 200.123,
                conversion_rate: 0.2345,
                created_at: "2026-03-25T10:30:00.000Z",
            },
            {
                region: "East",
                revenue: 310.4,
                conversion_rate: 0.125,
                created_at: "2026-03-24T09:00:00.000Z",
            },
            {
                region: "North",
                revenue: 150,
                conversion_rate: 0.5,
                created_at: "2026-03-23T08:15:00.000Z",
            },
        ],
        encoding: {
            columns: [
                { field: "region", title: "Region Name", format: "text" },
                { field: "revenue", title: "Revenue", format: "number" },
                { field: "conversion_rate", title: "Conversion", format: "percent" },
                { field: "created_at", title: "Created", format: "datetime" },
            ],
        },
        title: "Regional performance",
        description: "Dense SQL result inspection",
    };

    it("renders selected columns in declared order with title overrides", () => {
        render(
            <ChartTable
                widget={baseWidget}
                data={{}}
            />,
        );

        const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
        expect(headers).toEqual(["Region Name", "Revenue", "Conversion", "Created"]);
    });

    it("sorts rows deterministically using sort_by and sort_order", () => {
        render(
            <ChartTable
                widget={{
                    ...baseWidget,
                    sort_by: "revenue",
                    sort_order: "desc",
                }}
                data={{}}
            />,
        );

        const rows = screen.getAllByRole("row").slice(1);
        const firstCells = rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent);
        expect(firstCells).toEqual(["East", "West", "North"]);
    });

    it("applies limit after sorting and before render", () => {
        render(
            <ChartTable
                widget={{
                    ...baseWidget,
                    sort_by: "revenue",
                    sort_order: "desc",
                    limit: 2,
                }}
                data={{}}
            />,
        );

        const rows = screen.getAllByRole("row").slice(1);
        expect(rows).toHaveLength(2);
        const firstCells = rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent);
        expect(firstCells).toEqual(["East", "West"]);
    });

    it("formats number, percent, datetime, and text values deterministically", () => {
        render(
            <ChartTable
                widget={baseWidget}
                data={{}}
            />,
        );

        const rows = screen.getAllByRole("row").slice(1);
        const firstRowCells = within(rows[0]!).getAllByRole("cell").map((cell) => cell.textContent);

        expect(firstRowCells[0]).toBe("West");
        expect(firstRowCells[1]).toBe("200.12");
        expect(firstRowCells[2]).toBe("23.5%");
        expect(firstRowCells[3]).toBe("2026-03-25T10:30:00.000Z");
    });
});
