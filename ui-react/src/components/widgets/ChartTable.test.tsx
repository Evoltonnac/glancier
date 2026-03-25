import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { render } from "../../test/render";
import { ChartFrame } from "./charts/ChartFrame";

const sqlResponse = {
    rows: [
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
    ],
    fields: [
        { name: "ts", type: "datetime" },
        { name: "category", type: "text" },
        { name: "amount", type: "float" },
        { name: "label", type: "text" },
        { name: "count", type: "integer" },
    ],
};

describe("Chart.Table fixtures", () => {
    it("includes sorting, limiting, column selection, and title override coverage", () => {
        const sortedLimitedRows = [...sqlResponse.rows]
            .sort((left, right) => right.amount - left.amount)
            .slice(0, 2)
            .map((row) => ({ Region: row.label, Revenue: row.amount }));

        render(
            <ChartFrame type="Chart.Table" state={{ kind: "ready" }} title="Top regions">
                <table>
                    <thead>
                        <tr>
                            <th>Region</th>
                            <th>Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedLimitedRows.map((row) => (
                            <tr key={row.Region}>
                                <td>{row.Region}</td>
                                <td>{row.Revenue}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ChartFrame>,
        );

        expect(screen.getByText("Top regions")).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Region" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
        expect(screen.getByText("West")).toBeInTheDocument();
        expect(screen.getByText("21.1")).toBeInTheDocument();
        expect(screen.getByText("South")).toBeInTheDocument();
        expect(screen.queryByText("North")).toBeNull();
        expect(sqlResponse.fields.map((field) => field.name)).toEqual([
            "ts",
            "category",
            "amount",
            "label",
            "count",
        ]);
    });
});
