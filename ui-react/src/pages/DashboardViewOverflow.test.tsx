import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ViewTabsBar from "../components/dashboard/ViewTabsBar";
import { render } from "../test/render";
import type { StoredView } from "../types/config";
import { splitVisibleAndOverflowViewIds } from "./dashboardViewTabs";

function makeView(id: string): StoredView {
    return {
        id,
        name: id,
        layout_columns: 12,
        items: [],
    };
}

describe("Dashboard overflow behavior", () => {
    it("splits fixed-cap tabs into 6 visible and remaining overflow", () => {
        const orderedViewIds = [
            "view-1",
            "view-2",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
            "view-8",
            "view-9",
        ];
        const cap = 6;

        const { visibleViewIds, overflowViewIds } =
            splitVisibleAndOverflowViewIds(orderedViewIds, cap);

        expect(visibleViewIds).toEqual([
            "view-1",
            "view-2",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
        ]);
        expect(overflowViewIds).toEqual(["view-7", "view-8", "view-9"]);
    });

    it("updates +N overflow trigger as the overflow count changes", () => {
        const onSelectView = vi.fn();
        const onRenameView = vi.fn();
        const onCreateView = vi.fn();
        const onAddWidget = vi.fn();
        const views = Array.from({ length: 9 }, (_, index) =>
            makeView(`view-${index + 1}`),
        );
        const firstSplit = splitVisibleAndOverflowViewIds(
            views.map((view) => view.id),
            6,
        );

        const { rerender } = render(
            <ViewTabsBar
                views={views}
                activeViewId="view-1"
                visibleViewIds={firstSplit.visibleViewIds}
                overflowViewIds={firstSplit.overflowViewIds}
                onSelectView={onSelectView}
                onRenameView={onRenameView}
                onCreateView={onCreateView}
                onAddWidget={onAddWidget}
                addWidgetLabel="Add Widget"
                overflowLabel="+N"
                renamePlaceholder="Rename view"
                overflowPanel={<div>Overflow Panel</div>}
            />,
        );

        expect(screen.getByTestId("dashboard-tab-overflow-trigger")).toHaveTextContent(
            "+3",
        );

        const reduced = views.slice(0, 7);
        const secondSplit = splitVisibleAndOverflowViewIds(
            reduced.map((view) => view.id),
            6,
        );
        rerender(
            <ViewTabsBar
                views={reduced}
                activeViewId="view-1"
                visibleViewIds={secondSplit.visibleViewIds}
                overflowViewIds={secondSplit.overflowViewIds}
                onSelectView={onSelectView}
                onRenameView={onRenameView}
                onCreateView={onCreateView}
                onAddWidget={onAddWidget}
                addWidgetLabel="Add Widget"
                overflowLabel="+N"
                renamePlaceholder="Rename view"
                overflowPanel={<div>Overflow Panel</div>}
            />,
        );

        expect(screen.getByTestId("dashboard-tab-overflow-trigger")).toHaveTextContent(
            "+1",
        );

        const capped = views.slice(0, 6);
        const thirdSplit = splitVisibleAndOverflowViewIds(
            capped.map((view) => view.id),
            6,
        );
        rerender(
            <ViewTabsBar
                views={capped}
                activeViewId="view-1"
                visibleViewIds={thirdSplit.visibleViewIds}
                overflowViewIds={thirdSplit.overflowViewIds}
                onSelectView={onSelectView}
                onRenameView={onRenameView}
                onCreateView={onCreateView}
                onAddWidget={onAddWidget}
                addWidgetLabel="Add Widget"
                overflowLabel="+N"
                renamePlaceholder="Rename view"
                overflowPanel={<div>Overflow Panel</div>}
            />,
        );

        expect(
            screen.queryByTestId("dashboard-tab-overflow-trigger"),
        ).not.toBeInTheDocument();
    });
});
