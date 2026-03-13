import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { render } from "../../test/render";
import { WidgetRenderer } from "./WidgetRenderer";

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
                        maxLines: 2,
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
});
