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

describe("chart widget foundations", () => {
    it("renders line chart from sql_response rows", () => {
        render(
            <ChartFrame type="Chart.Line" state={{ kind: "ready" }} title="Revenue trend">
                <div data-testid="chart-ready">{sqlResponse.rows.length} points</div>
            </ChartFrame>,
        );

        expect(screen.getByText("Revenue trend")).toBeInTheDocument();
        expect(screen.getByTestId("chart-ready")).toHaveTextContent("4 points");
    });

    it("renders bar chart from sql_response rows", () => {
        render(
            <ChartFrame type="Chart.Bar" state={{ kind: "ready" }} title="Revenue by category">
                <div data-testid="chart-ready">{sqlResponse.rows[0]?.category}</div>
            </ChartFrame>,
        );

        expect(screen.getByText("Revenue by category")).toBeInTheDocument();
        expect(screen.getByTestId("chart-ready")).toHaveTextContent("Alpha");
    });

    it("renders area chart from sql_response rows", () => {
        render(
            <ChartFrame type="Chart.Area" state={{ kind: "ready" }} title="Area coverage">
                <div data-testid="chart-ready">{sqlResponse.fields[2]?.name}</div>
            </ChartFrame>,
        );

        expect(screen.getByText("Area coverage")).toBeInTheDocument();
        expect(screen.getByTestId("chart-ready")).toHaveTextContent("amount");
    });

    it("renders pie chart from sql_response rows", () => {
        render(
            <ChartFrame type="Chart.Pie" state={{ kind: "ready" }} title="Regional mix">
                <div data-testid="chart-ready">{sqlResponse.rows[1]?.label}</div>
            </ChartFrame>,
        );

        expect(screen.getByText("Regional mix")).toBeInTheDocument();
        expect(screen.getByTestId("chart-ready")).toHaveTextContent("South");
    });

    it("renders fallback state assertions for empty, config error, runtime error, and loading", () => {
        const { rerender } = render(
            <ChartFrame type="Chart.Line" state={{ kind: "loading" }} title="Fallback demo" />,
        );

        expect(screen.getByText(/loading/i)).toBeInTheDocument();

        rerender(<ChartFrame type="Chart.Line" state={{ kind: "empty" }} title="Fallback demo" />);
        expect(screen.getByText("No chart data available")).toBeInTheDocument();

        rerender(
            <ChartFrame
                type="Chart.Line"
                state={{
                    kind: "config_error",
                    detail: {
                        ok: false,
                        kind: "config_error",
                        code: "unknown_field",
                        channel: "y",
                        field: "missing_metric",
                    },
                }}
                title="Fallback demo"
            />,
        );
        expect(screen.getByText("Invalid chart configuration")).toBeInTheDocument();

        rerender(
            <ChartFrame type="Chart.Line" state={{ kind: "runtime_error" }} title="Fallback demo" />,
        );
        expect(screen.getByText(/This chart cannot be shown right now\./)).toBeInTheDocument();
    });
});
