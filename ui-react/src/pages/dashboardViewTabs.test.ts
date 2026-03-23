import { describe, expect, it } from "vitest";

import {
    buildReorderedViewIds,
    normalizeViewNameInput,
    resolveActiveViewId,
    splitVisibleAndOverflowViewIds,
} from "./dashboardViewTabs";

import type { StoredView } from "../types/config";

function makeView(id: string, name: string): StoredView {
    return {
        id,
        name,
        layout_columns: 12,
        items: [],
    };
}

describe("dashboardViewTabs helpers", () => {
    it("resolveActiveViewId keeps persisted id when present and falls back deterministically", () => {
        const views = [makeView("view-a", "A"), makeView("view-b", "B")];

        expect(resolveActiveViewId(views, "view-b")).toBe("view-b");
        expect(resolveActiveViewId(views, "missing-id")).toBe("view-a");
        expect(resolveActiveViewId([], "view-b")).toBeNull();
    });

    it("splitVisibleAndOverflowViewIds uses cap 6 and preserves order", () => {
        const orderedIds = [
            "view-1",
            "view-2",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
            "view-8",
        ];

        expect(splitVisibleAndOverflowViewIds(orderedIds)).toEqual({
            visibleViewIds: ["view-1", "view-2", "view-3", "view-4", "view-5", "view-6"],
            overflowViewIds: ["view-7", "view-8"],
        });
    });

    it("buildReorderedViewIds supports cross-zone moves and visible drop pushes visible tail into overflow", () => {
        const orderedIds = [
            "view-1",
            "view-2",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
            "view-8",
        ];

        expect(
            buildReorderedViewIds({
                orderedViewIds: orderedIds,
                draggedViewId: "view-8",
                dropTargetViewId: "view-2",
                dropZone: "visible",
                dropIndex: 1,
            }),
        ).toEqual([
            "view-1",
            "view-8",
            "view-2",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
        ]);

        expect(
            buildReorderedViewIds({
                orderedViewIds: orderedIds,
                draggedViewId: "view-2",
                dropTargetViewId: null,
                dropZone: "overflow",
                dropIndex: 0,
            }),
        ).toEqual([
            "view-1",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
            "view-2",
            "view-8",
        ]);
    });

    it("normalizeViewNameInput trims and collapses internal whitespace", () => {
        expect(normalizeViewNameInput("  My   View  ")).toBe("My View");
    });
});
