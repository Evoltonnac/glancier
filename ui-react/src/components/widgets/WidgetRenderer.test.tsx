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
        expect(container).toHaveClass("qb-gap-1");
        expect(container).toHaveClass("justify-center");
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
        expect(listGrid).toHaveClass("qb-gap-3");
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

    it("shows nested validation path for field-level errors", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        render(
            <WidgetRenderer
                widget={
                    {
                        type: "FactSet",
                        facts: [
                            {
                                label: "CPU",
                                value: { bad: true },
                            },
                        ],
                    } as any
                }
                data={{}}
            />,
        );

        expect(
            screen.getByText("Invalid widget configuration: FactSet"),
        ).toBeInTheDocument();
        expect(screen.getByText("Path: facts[0].value")).toBeInTheDocument();

        errorSpy.mockRestore();
    });
});
