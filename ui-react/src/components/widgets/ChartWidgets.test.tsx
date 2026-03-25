import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

import { render } from "../../test/render";
import { ChartFrame } from "./charts/ChartFrame";
import {
    renderAreaChart,
    renderBarChart,
    renderLineChart,
    renderPieChart,
} from "./charts/adapters/rechartsAdapter";

function mockChartComponent(name: string) {
    return function MockChartComponent({
        children,
        ...props
    }: {
        children?: ReactNode;
        [key: string]: unknown;
    }) {
        return createElement(
            "div",
            {
                "data-testid": name,
                "data-props": JSON.stringify(props),
            },
            children,
        );
    };
}

vi.mock("recharts", () => ({
    ResponsiveContainer: mockChartComponent("ResponsiveContainer"),
    LineChart: mockChartComponent("LineChart"),
    Line: mockChartComponent("Line"),
    BarChart: mockChartComponent("BarChart"),
    Bar: mockChartComponent("Bar"),
    AreaChart: mockChartComponent("AreaChart"),
    Area: mockChartComponent("Area"),
    PieChart: mockChartComponent("PieChart"),
    Pie: mockChartComponent("Pie"),
    Cell: mockChartComponent("Cell"),
    XAxis: mockChartComponent("XAxis"),
    YAxis: mockChartComponent("YAxis"),
    CartesianGrid: mockChartComponent("CartesianGrid"),
    Tooltip: mockChartComponent("Tooltip"),
    Legend: mockChartComponent("Legend"),
}));

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
            renderLineChart({
                rows: sqlResponse.rows,
                encoding: {
                    x: { field: "ts" },
                    y: { field: "amount" },
                    series: { field: "category" },
                },
                legend: true,
            }),
        );

        expect(screen.getByTestId("ResponsiveContainer")).toBeInTheDocument();
        expect(screen.getByTestId("LineChart")).toHaveAttribute(
            "data-props",
            expect.stringContaining('"data"'),
        );
        expect(screen.getAllByTestId("Line")).toHaveLength(3);
        expect(screen.getByTestId("XAxis")).toHaveAttribute(
            "data-props",
            expect.stringContaining('"dataKey":"ts"'),
        );
        expect(screen.getAllByTestId("Line")[0]).toHaveAttribute(
            "data-props",
            expect.stringContaining('"stroke":"blue"'),
        );
    });

    it("renders bar chart from sql_response rows", () => {
        render(
            renderBarChart({
                rows: sqlResponse.rows,
                encoding: {
                    x: { field: "ts" },
                    y: { field: "amount" },
                },
                legend: false,
                colors: ["#123456"],
            }),
        );

        expect(screen.getByTestId("BarChart")).toBeInTheDocument();
        expect(screen.getByTestId("Bar")).toHaveAttribute(
            "data-props",
            expect.stringContaining('"fill":"#123456"'),
        );
    });

    it("renders area chart from sql_response rows", () => {
        render(
            renderAreaChart({
                rows: sqlResponse.rows,
                encoding: {
                    x: { field: "ts" },
                    y: { field: "amount" },
                },
                legend: false,
            }),
        );

        expect(screen.getByTestId("AreaChart")).toBeInTheDocument();
        expect(screen.getByTestId("Area")).toHaveAttribute(
            "data-props",
            expect.stringContaining('"dataKey":"amount"'),
        );
    });

    it("renders pie chart from sql_response rows", () => {
        render(
            renderPieChart({
                rows: [
                    ...sqlResponse.rows,
                    { ts: "2026-03-05T00:00:00Z", category: "Delta", amount: 4, label: "Central", count: 2 },
                    { ts: "2026-03-06T00:00:00Z", category: "Epsilon", amount: 6, label: "Northwest", count: 4 },
                    { ts: "2026-03-07T00:00:00Z", category: "Zeta", amount: 8, label: "Southeast", count: 6 },
                ],
                encoding: {
                    label: { field: "label" },
                    value: { field: "count" },
                },
                legend: true,
                donut: true,
            }),
        );

        expect(screen.getByTestId("PieChart")).toBeInTheDocument();
        expect(screen.getByTestId("Pie")).toHaveAttribute(
            "data-props",
            expect.stringContaining('"nameKey":"label"'),
        );
        expect(screen.getByTestId("Pie")).toHaveAttribute(
            "data-props",
            expect.stringContaining('"dataKey":"count"'),
        );
        expect(screen.getByTestId("Pie")).toHaveAttribute(
            "data-props",
            expect.stringContaining('"innerRadius":48'),
        );
        expect(screen.getAllByTestId("Cell")[6]).toHaveAttribute(
            "data-props",
            expect.stringContaining('"fill":"slate"'),
        );
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
