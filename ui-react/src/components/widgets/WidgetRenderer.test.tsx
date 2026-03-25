import { describe, expect, it, vi, beforeAll } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

import { render } from "../../test/render";
import { WidgetRenderer } from "./WidgetRenderer";

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

beforeAll(() => {
    class MockResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        writable: true,
        value: MockResizeObserver,
    });

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        value: 800,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        value: 400,
    });
    Object.defineProperty(SVGElement.prototype, "getBBox", {
        configurable: true,
        value: () => ({ x: 0, y: 0, width: 100, height: 20 }),
    });
});

describe("WidgetRenderer", () => {
    it("renders Progress values from list item templates", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        render(
            <WidgetRenderer
                widget={
                    {
                        type: "List",
                        data_source: [{ name: "Key A", percent: 67 }],
                        item_alias: "key_item",
                        layout: "grid",
                        columns: 2,
                        pagination: true,
                        page_size: 4,
                        render: [
                            {
                                type: "Progress",
                                label: "{key_item.name}",
                                value: "{key_item.percent}",
                                thresholds: {
                                    warning: 75,
                                    danger: 90,
                                },
                            },
                        ],
                    } as any
                }
                data={{
                    keys_list: [{ name: "Key A", percent: 67 }],
                }}
            />,
        );

        expect(screen.getByText("Key A")).toBeInTheDocument();
        expect(screen.getByText("67%")).toBeInTheDocument();
        expect(
            errorSpy.mock.calls.some((call) =>
                String(call[0]).includes("Widget validation failed:"),
            ),
        ).toBe(false);

        errorSpy.mockRestore();
    });

    it("shows validation fallback when Progress value is not numeric", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        render(
            <WidgetRenderer
                widget={
                    {
                        type: "List",
                        data_source: [{ percent: "not-a-number" }],
                        item_alias: "key_item",
                        render: [
                            {
                                type: "Progress",
                                value: "{key_item.percent}",
                            },
                        ],
                    } as any
                }
                data={{
                    keys_list: [{ percent: "not-a-number" }],
                }}
            />,
        );

        expect(
            screen.getByText("Invalid widget configuration: Progress"),
        ).toBeInTheDocument();
        expect(screen.getByText("Path: value")).toBeInTheDocument();
        expect(screen.getByText(/Reason:/)).toBeInTheDocument();
        expect(
            errorSpy.mock.calls.some((call) =>
                String(call[0]).includes("Widget validation failed:"),
            ),
        ).toBe(true);

        errorSpy.mockRestore();
    });

    it("shows pagination controls and switches pages", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "List",
                        data_source: [
                            { name: "Key 1" },
                            { name: "Key 2" },
                            { name: "Key 3" },
                        ],
                        item_alias: "key_item",
                        pagination: true,
                        page_size: 2,
                        render: [
                            {
                                type: "TextBlock",
                                text: "{key_item.name}",
                            },
                        ],
                    } as any
                }
                data={{}}
            />,
        );

        expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();
        expect(screen.getByText("Key 1")).toBeInTheDocument();
        expect(screen.getByText("Key 2")).toBeInTheDocument();
        expect(screen.queryByText("Key 3")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(screen.getByText("Page 2 / 2")).toBeInTheDocument();
        expect(screen.getByText("Key 3")).toBeInTheDocument();
        expect(screen.queryByText("Key 1")).toBeNull();
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

        fireEvent.click(screen.getByRole("button", { name: "Prev" }));
        expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    });

    it("formats decimal display via expression", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "TextBlock",
                        text: "{fixed(value, 2)}",
                    } as any
                }
                data={{ value: 12.3456 }}
            />,
        );

        expect(screen.getByText("12.35")).toBeInTheDocument();
    });

    it("renders primitive result for full expression text", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "TextBlock",
                        text: "{value}",
                    } as any
                }
                data={{ value: 42 }}
            />,
        );

        expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("supports ternary expressions in templates", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "TextBlock",
                        text: "{usage > 80 ? 'High' : 'Normal'}",
                    } as any
                }
                data={{ usage: 91 }}
            />,
        );

        expect(screen.getByText("High")).toBeInTheDocument();
    });

    it("does not re-evaluate escaped template literals in nested widgets", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "ColumnSet",
                        columns: [
                            {
                                type: "Column",
                                items: [
                                    {
                                        type: "TextBlock",
                                        text: "📈$\\{fixed(price, 2)\\}",
                                    },
                                    {
                                        type: "TextBlock",
                                        text: "~ ${fixed(price_per_gram, 2)} per gram",
                                    },
                                ],
                            },
                        ],
                    } as any
                }
                data={{ price: 3123.456, price_per_gram: 100.1234 }}
            />,
        );

        expect(screen.getByText("📈${fixed(price, 2)}")).toBeInTheDocument();
        expect(screen.getByText("~ $100.12 per gram")).toBeInTheDocument();
    });

    it("filters list items with expression engine", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "List",
                        data_source: [
                            { name: "Key 1", active: true, percent: 90 },
                            { name: "Key 2", active: false, percent: 95 },
                            { name: "Key 3", active: true, percent: 70 },
                        ],
                        item_alias: "key_item",
                        filter: "key_item.active && key_item.percent >= 80",
                        render: [
                            {
                                type: "TextBlock",
                                text: "{key_item.name}",
                            },
                        ],
                    } as any
                }
                data={{}}
            />,
        );

        expect(screen.getByText("Key 1")).toBeInTheDocument();
        expect(screen.queryByText("Key 2")).toBeNull();
        expect(screen.queryByText("Key 3")).toBeNull();
    });

    it("applies TextBlock multi-line clamp styles", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "TextBlock",
                        text: "A very long line that should be clamped to two lines in declarative UI rendering.",
                        max_lines: 2,
                    } as any
                }
                data={{}}
            />,
        );

        const text = screen.getByText(
            "A very long line that should be clamped to two lines in declarative UI rendering.",
        );
        expect(text).toHaveStyle({ WebkitLineClamp: "2" });
        expect(text).toHaveStyle({ display: "-webkit-box" });
    });

    it("resolves non-value enum params from templates", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "Container",
                        spacing: "{compact ? 'sm' : 'lg'}",
                        align_y: "{vertical_align}",
                        items: [
                            {
                                type: "TextBlock",
                                text: "Usage",
                                size: "{text_size}",
                                tone: "{text_tone}",
                                align_x: "{horizontal_align}",
                            },
                        ],
                    } as any
                }
                data={{
                    compact: true,
                    vertical_align: "center",
                    text_size: "lg",
                    text_tone: "warning",
                    horizontal_align: "end",
                }}
            />,
        );

        const textBlock = screen.getByText("Usage");
        expect(textBlock).toHaveClass("text-base");
        expect(textBlock).toHaveClass("text-warning");
        expect(textBlock).toHaveClass("text-right");

        const container = textBlock.parentElement;
        expect(container).toHaveClass("qb-gap-2");
        expect(container).toHaveClass("justify-center");
    });

    it("uses larger layout spacing than micro spacing for the same token", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "Container",
                        spacing: "lg",
                        items: [
                            {
                                type: "FactSet",
                                spacing: "lg",
                                facts: [
                                    {
                                        label: "CPU",
                                        value: "68%",
                                    },
                                ],
                            },
                        ],
                    } as any
                }
                data={{}}
            />,
        );

        const factSet = screen.getByText("CPU:").closest("div.flex.flex-col");
        expect(factSet).not.toBeNull();
        expect(factSet).toHaveClass("qb-gap-3");
        expect(factSet?.parentElement).toHaveClass("qb-gap-4");
    });

    it("resolves list layout params from templates", () => {
        render(
            <WidgetRenderer
                widget={
                    {
                        type: "List",
                        data_source: [
                            { name: "Item A" },
                            { name: "Item B" },
                        ],
                        item_alias: "item",
                        layout: "{layout_mode}",
                        columns: "{column_count}",
                        spacing: "{gap_size}",
                        render: [
                            {
                                type: "TextBlock",
                                text: "{item.name}",
                            },
                        ],
                    } as any
                }
                data={{
                    layout_mode: "grid",
                    column_count: 3,
                    gap_size: "lg",
                }}
            />,
        );

        const listGrid = screen.getByText("Item A").closest("div.grid");
        expect(listGrid).not.toBeNull();
        expect(listGrid).toHaveClass("lg:grid-cols-3");
        expect(listGrid).toHaveClass("qb-gap-4");

        const listItem = screen.getByText("Item A").closest("div.rounded-md");
        expect(listItem).not.toBeNull();
        expect(listItem).toHaveClass("border");
        expect(listItem).toHaveClass("border-border/40");
        expect(listItem).toHaveClass("bg-surface/20");
    });

    it("shows validation fallback when templated enum values are invalid", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        render(
            <WidgetRenderer
                widget={
                    {
                        type: "Badge",
                        text: "Template Badge",
                        size: "{badge_size}",
                        tone: "{badge_tone}",
                    } as any
                }
                data={{
                    badge_size: "HUGE",
                    badge_tone: "NEON",
                }}
            />,
        );

        expect(
            screen.getByText("Invalid widget configuration: Badge"),
        ).toBeInTheDocument();
        expect(
            errorSpy.mock.calls.some((call) =>
                String(call[0]).includes("Widget validation failed:"),
            ),
        ).toBe(true);

        errorSpy.mockRestore();
    });

    it("renders chart widget branches and keeps invalid chart fallback details", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const chartData = {
            sql_response: {
                rows: [
                    { ts: "2026-03-01T00:00:00Z", category: "Alpha", amount: 12.5, label: "North", count: 3 },
                    { ts: "2026-03-02T00:00:00Z", category: "Beta", amount: 18.25, label: "South", count: 7 },
                ],
                fields: [
                    { name: "ts", type: "datetime" },
                    { name: "category", type: "text" },
                    { name: "amount", type: "float" },
                    { name: "label", type: "text" },
                    { name: "count", type: "integer" },
                ],
            },
        };

        const { rerender } = render(
            <WidgetRenderer
                widget={
                    {
                        type: "Chart.Line",
                        title: "Template trend",
                        data_source: "{sql_response.rows}",
                        legend: "{showLegend}",
                        encoding: {
                            x: { field: "ts" },
                            y: { field: "amount" },
                            series: { field: "category" },
                        },
                    } as any
                }
                data={{ ...chartData, showLegend: true }}
            />,
        );

        expect(screen.getByText("Template trend")).toBeInTheDocument();
        expect(screen.getByTestId("LineChart")).toBeInTheDocument();

        rerender(
            <WidgetRenderer
                widget={
                    {
                        type: "Chart.Bar",
                        title: "Bars",
                        data_source: "{sql_response.rows}",
                        encoding: {
                            x: { field: "ts" },
                            y: { field: "amount" },
                        },
                    } as any
                }
                data={chartData}
            />,
        );
        expect(screen.getByText("Bars")).toBeInTheDocument();

        rerender(
            <WidgetRenderer
                widget={
                    {
                        type: "Chart.Area",
                        title: "Area",
                        data_source: "{sql_response.rows}",
                        encoding: {
                            x: { field: "ts" },
                            y: { field: "amount" },
                        },
                    } as any
                }
                data={chartData}
            />,
        );
        expect(screen.getByText("Area")).toBeInTheDocument();

        rerender(
            <WidgetRenderer
                widget={
                    {
                        type: "Chart.Pie",
                        title: "Mix",
                        data_source: "{sql_response.rows}",
                        donut: "{useDonut}",
                        encoding: {
                            label: { field: "label" },
                            value: { field: "count" },
                        },
                    } as any
                }
                data={{ ...chartData, useDonut: true }}
            />,
        );
        expect(screen.getByText("Mix")).toBeInTheDocument();

        rerender(
            <WidgetRenderer
                widget={
                    {
                        type: "Chart.Line",
                        data_source: "{sql_response.rows}",
                        encoding: {
                            x: { field: "ts" },
                        },
                    } as any
                }
                data={chartData}
            />,
        );

        expect(
            screen.getByText("Invalid widget configuration: Chart.Line"),
        ).toBeInTheDocument();
        expect(screen.getByText("Path: encoding.y.field")).toBeInTheDocument();
        expect(screen.getByText(/Reason:/)).toBeInTheDocument();

        errorSpy.mockRestore();
    });
});
