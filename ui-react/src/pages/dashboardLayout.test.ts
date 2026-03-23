import { describe, expect, it } from "vitest";

import {
    findFirstAvailableGridPlacement,
    hasLayoutOverlap,
    mergeViewItemsWithGridNodes,
    sanitizeGridNodeLayout,
} from "./dashboardLayout";

describe("dashboardLayout", () => {
    it("merges node coordinates by id while preserving item order", () => {
        const items = [
            { id: "a", x: 0, y: 0, w: 4, h: 2, source_id: "s1", template_id: "t1", props: {} },
            { id: "b", x: 4, y: 0, w: 4, h: 2, source_id: "s2", template_id: "t2", props: {} },
            { id: "c", x: 8, y: 0, w: 4, h: 2, source_id: "s3", template_id: "t3", props: {} },
        ];
        const nodes = [
            { id: "c", x: 0, y: 4, w: 6, h: 2 },
            { id: "a", x: 6, y: 0, w: 6, h: 2 },
        ];

        const merged = mergeViewItemsWithGridNodes(items, nodes);

        expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
        expect(merged[0]).toMatchObject({ id: "a", x: 6, y: 0, w: 6, h: 2 });
        expect(merged[1]).toMatchObject({ id: "b", x: 4, w: 4, h: 2 });
        expect(merged[2]).toMatchObject({ id: "c", x: 0, y: 4, w: 6, h: 2 });
        expect(hasLayoutOverlap(merged)).toBe(false);
    });

    it("prevents overlap when multiple cards resolve to conflicting x/y/w/h", () => {
        const items = [
            { id: "a", x: 0, y: 0, w: 6, h: 2, source_id: "s1", template_id: "t1", props: {} },
            { id: "b", x: 0, y: 0, w: 6, h: 2, source_id: "s2", template_id: "t2", props: {} },
            { id: "c", x: 0, y: 1, w: 6, h: 2, source_id: "s3", template_id: "t3", props: {} },
        ];
        const overlappingNodes = [
            { id: "a", x: 0, y: 0, w: 6, h: 2 },
            { id: "b", x: 0, y: 0, w: 6, h: 2 },
            { id: "c", x: 0, y: 1, w: 6, h: 2 },
        ];

        const merged = mergeViewItemsWithGridNodes(items, overlappingNodes);

        expect(hasLayoutOverlap(merged)).toBe(false);
    });

    it("keeps existing stored coordinates for items not present in node updates", () => {
        const items = [
            { id: "a", x: 1, y: 1, w: 3, h: 2, source_id: "s1", template_id: "t1", props: {} },
            { id: "b", x: 5, y: 1, w: 3, h: 2, source_id: "s2", template_id: "t2", props: {} },
        ];

        const merged = mergeViewItemsWithGridNodes(items, [{ id: "a", x: 2, y: 2, w: 4, h: 2 }]);

        expect(merged[0]).toMatchObject({ id: "a", x: 2, y: 2, w: 4, h: 2 });
        expect(merged[1]).toMatchObject({ id: "b", x: 5, w: 3, h: 2 });
        expect(hasLayoutOverlap(merged)).toBe(false);
    });

    it("sanitizes invalid layout values before overlap resolution", () => {
        const items = [
            { id: "a", x: -3, y: -2, w: 0, h: 0, source_id: "s1", template_id: "t1", props: {} },
            { id: "b", x: 20, y: 0, w: 99, h: 1, source_id: "s2", template_id: "t2", props: {} },
        ];
        const nodes = [{ id: "a", x: 10, y: -5, w: -1, h: -2 }];

        const merged = mergeViewItemsWithGridNodes(items, nodes, 12);

        expect(merged[0]).toMatchObject({ id: "a", x: 9, y: 0, w: 3, h: 4 });
        expect(merged[1]).toMatchObject({ id: "b", x: 0, y: 4, w: 12, h: 1 });
        expect(hasLayoutOverlap(merged)).toBe(false);
    });

    it("clamps node width and x to stay within configured columns", () => {
        const safe = sanitizeGridNodeLayout(
            { id: "n", x: 11, y: 1, w: 8, h: 2 },
            12,
        );

        expect(safe).toMatchObject({ id: "n", x: 4, y: 1, w: 8, h: 2 });
    });

    it("finds the first topmost available placement for a 4x4 widget", () => {
        const items = [
            { id: "a", x: 0, y: 0, w: 4, h: 4, source_id: "s1", template_id: "t1", props: {} },
            { id: "b", x: 4, y: 0, w: 4, h: 4, source_id: "s2", template_id: "t2", props: {} },
        ];

        const placement = findFirstAvailableGridPlacement(items, 12, 4, 4);

        expect(placement).toEqual({ x: 8, y: 0, w: 4, h: 4 });
    });

    it("moves to next row when top row cannot fit requested width", () => {
        const items = [
            { id: "a", x: 0, y: 0, w: 5, h: 4, source_id: "s1", template_id: "t1", props: {} },
            { id: "b", x: 5, y: 0, w: 5, h: 4, source_id: "s2", template_id: "t2", props: {} },
        ];

        const placement = findFirstAvailableGridPlacement(items, 12, 4, 4);

        expect(placement).toEqual({ x: 0, y: 4, w: 4, h: 4 });
    });
});
