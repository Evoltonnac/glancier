import type { ViewItem } from "../types/config";

export interface GridNodeLayout {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

function toFiniteInt(value: unknown, fallback: number): number {
    const numeric =
        typeof value === "number"
            ? value
            : Number.parseInt(String(value), 10);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function toPositiveInt(value: unknown, fallback: number): number {
    const parsed = toFiniteInt(value, fallback);
    return parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function sanitizeGridNodeLayout(
    node: GridNodeLayout,
    columnCount: number = 12,
): GridNodeLayout {
    const safeColumns = Math.max(1, toFiniteInt(columnCount, 12));
    const safeW = clamp(toPositiveInt(node.w, 3), 1, safeColumns);
    const safeH = Math.max(1, toPositiveInt(node.h, 4));
    const safeX = clamp(
        toFiniteInt(node.x, 0),
        0,
        Math.max(0, safeColumns - safeW),
    );
    const safeY = Math.max(0, toFiniteInt(node.y, 0));

    return {
        id: node.id,
        x: safeX,
        y: safeY,
        w: safeW,
        h: safeH,
    };
}

function overlaps(a: GridNodeLayout, b: GridNodeLayout): boolean {
    const horizontal = a.x < b.x + b.w && a.x + a.w > b.x;
    const vertical = a.y < b.y + b.h && a.y + a.h > b.y;
    return horizontal && vertical;
}

export interface GridPlacement {
    x: number;
    y: number;
    w: number;
    h: number;
}

export function findFirstAvailableGridPlacement(
    items: Array<Pick<ViewItem, "x" | "y" | "w" | "h">>,
    columnCount: number = 12,
    preferredWidth: number = 4,
    preferredHeight: number = 4,
): GridPlacement {
    const safeColumns = Math.max(1, toFiniteInt(columnCount, 12));
    const safeW = clamp(toPositiveInt(preferredWidth, 4), 1, safeColumns);
    const safeH = Math.max(1, toPositiveInt(preferredHeight, 4));
    const occupied = items.map((item, index) =>
        sanitizeGridNodeLayout(
            {
                id: `occupied-${index}`,
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
            },
            safeColumns,
        ),
    );
    const maxBottom = occupied.reduce(
        (max, node) => Math.max(max, node.y + node.h),
        0,
    );

    for (let y = 0; y <= maxBottom + safeH; y += 1) {
        for (let x = 0; x <= safeColumns - safeW; x += 1) {
            const candidate: GridNodeLayout = {
                id: "candidate",
                x,
                y,
                w: safeW,
                h: safeH,
            };
            if (!occupied.some((node) => overlaps(candidate, node))) {
                return {
                    x: candidate.x,
                    y: candidate.y,
                    w: candidate.w,
                    h: candidate.h,
                };
            }
        }
    }

    return { x: 0, y: maxBottom, w: safeW, h: safeH };
}

function settleWithoutOverlap(
    candidate: GridNodeLayout,
    placed: GridNodeLayout[],
): GridNodeLayout {
    const settled = { ...candidate };
    while (placed.some((node) => overlaps(settled, node))) {
        settled.y += 1;
    }
    return settled;
}

export function mergeViewItemsWithGridNodes(
    items: ViewItem[],
    nodes: GridNodeLayout[],
    columnCount: number = 12,
): ViewItem[] {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const placed: GridNodeLayout[] = [];

    return items.map((item) => {
        const fromNode = nodeMap.get(item.id);
        const candidate: GridNodeLayout = sanitizeGridNodeLayout(
            fromNode
                ? {
                      id: item.id,
                      x: fromNode.x,
                      y: fromNode.y,
                      w: fromNode.w,
                      h: fromNode.h,
                  }
                : {
                      id: item.id,
                      x: item.x,
                      y: item.y,
                      w: item.w,
                      h: item.h,
                  },
            columnCount,
        );

        const settled = settleWithoutOverlap(candidate, placed);
        placed.push(settled);

        return {
            ...item,
            x: settled.x,
            y: settled.y,
            w: settled.w,
            h: settled.h,
        };
    });
}

export function hasLayoutOverlap(items: Array<Pick<ViewItem, "x" | "y" | "w" | "h">>): boolean {
    for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
            const a: GridNodeLayout = { id: "a", ...items[i] };
            const b: GridNodeLayout = { id: "b", ...items[j] };
            if (overlaps(a, b)) {
                return true;
            }
        }
    }
    return false;
}
