import { describe, expect, it } from "vitest";

import { buildReorderedViewIds } from "./dashboardViewTabs";

describe("Dashboard cross-zone reorder", () => {
    const seedOrderedIds = [
        "view-1",
        "view-2",
        "view-3",
        "view-4",
        "view-5",
        "view-6",
        "view-7",
        "view-8",
    ];

    it("cross-zone reorder updates visible order when dragging a visible tab into visible area", () => {
        const nextOrderedIds = buildReorderedViewIds({
            orderedViewIds: seedOrderedIds,
            draggedViewId: "view-3",
            dropTargetViewId: "view-2",
            dropZone: "visible",
            dropIndex: 1,
        });

        expect(nextOrderedIds).toEqual([
            "view-1",
            "view-3",
            "view-2",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
            "view-8",
        ]);
        expect(new Set(nextOrderedIds).size).toBe(nextOrderedIds.length);
    });

    it("cross-zone reorder keeps visible cap by pushing visible tail to overflow when dragging overflow into visible", () => {
        const nextOrderedIds = buildReorderedViewIds({
            orderedViewIds: seedOrderedIds,
            draggedViewId: "view-8",
            dropTargetViewId: "view-2",
            dropZone: "visible",
            dropIndex: 1,
        });

        expect(nextOrderedIds).toEqual([
            "view-1",
            "view-8",
            "view-2",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
        ]);
        expect(new Set(nextOrderedIds).size).toBe(nextOrderedIds.length);
    });

    it("cross-zone reorder moves visible tab into overflow area with no duplicates", () => {
        const nextOrderedIds = buildReorderedViewIds({
            orderedViewIds: seedOrderedIds,
            draggedViewId: "view-2",
            dropTargetViewId: "view-8",
            dropZone: "overflow",
            dropIndex: 1,
        });

        expect(nextOrderedIds).toEqual([
            "view-1",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
            "view-8",
            "view-2",
        ]);
        expect(new Set(nextOrderedIds).size).toBe(nextOrderedIds.length);
    });
});

describe("buildReorderedViewIds cross-zone no duplicates invariants", () => {
    const cap = 6;
    const seedOrderedIds = [
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

    it("visible -> visible reorder keeps deterministic order with no duplicates", () => {
        const nextOrderedIds = buildReorderedViewIds({
            orderedViewIds: seedOrderedIds,
            draggedViewId: "view-4",
            dropTargetViewId: "view-2",
            dropZone: "visible",
            dropIndex: 1,
            cap,
        });

        expect(nextOrderedIds).toEqual([
            "view-1",
            "view-4",
            "view-2",
            "view-3",
            "view-5",
            "view-6",
            "view-7",
            "view-8",
            "view-9",
        ]);
        expect(new Set(nextOrderedIds).size).toBe(nextOrderedIds.length);
    });

    it("overflow -> visible cross-zone pushback keeps visible cap fixed and no duplicates", () => {
        const nextOrderedIds = buildReorderedViewIds({
            orderedViewIds: seedOrderedIds,
            draggedViewId: "view-9",
            dropTargetViewId: "view-2",
            dropZone: "visible",
            dropIndex: 1,
            cap,
        });

        expect(nextOrderedIds).toEqual([
            "view-1",
            "view-9",
            "view-2",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
            "view-8",
        ]);
        expect(new Set(nextOrderedIds).size).toBe(nextOrderedIds.length);
    });

    it("visible -> overflow cross-zone reorder keeps dragged item in overflow with no duplicates", () => {
        const nextOrderedIds = buildReorderedViewIds({
            orderedViewIds: seedOrderedIds,
            draggedViewId: "view-2",
            dropTargetViewId: "view-8",
            dropZone: "overflow",
            dropIndex: 1,
            cap,
        });

        expect(nextOrderedIds).toEqual([
            "view-1",
            "view-3",
            "view-4",
            "view-5",
            "view-6",
            "view-7",
            "view-8",
            "view-2",
            "view-9",
        ]);
        expect(new Set(nextOrderedIds).size).toBe(nextOrderedIds.length);
    });

    it("cross-zone no duplicates holds across repeated overflow and visible moves", () => {
        let nextOrderedIds = [...seedOrderedIds];
        const operations: Array<{
            draggedViewId: string;
            dropTargetViewId: string | null;
            dropZone: "visible" | "overflow";
            dropIndex: number;
        }> = [
            {
                draggedViewId: "view-9",
                dropTargetViewId: "view-2",
                dropZone: "visible",
                dropIndex: 1,
            },
            {
                draggedViewId: "view-3",
                dropTargetViewId: "view-8",
                dropZone: "overflow",
                dropIndex: 1,
            },
            {
                draggedViewId: "view-7",
                dropTargetViewId: "view-1",
                dropZone: "visible",
                dropIndex: 0,
            },
        ];

        for (const operation of operations) {
            nextOrderedIds = buildReorderedViewIds({
                orderedViewIds: nextOrderedIds,
                draggedViewId: operation.draggedViewId,
                dropTargetViewId: operation.dropTargetViewId,
                dropZone: operation.dropZone,
                dropIndex: operation.dropIndex,
                cap,
            });
            expect(new Set(nextOrderedIds).size).toBe(nextOrderedIds.length);
            expect(nextOrderedIds).toHaveLength(seedOrderedIds.length);
        }
    });
});
