import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetStorage, storageMock } = vi.hoisted(() => {
    const storageData = new Map<string, string>();
    const storageTarget = {
        getItem: vi.fn((key: string) => storageData.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) =>
            storageData.set(key, value),
        ),
        removeItem: vi.fn((key: string) => storageData.delete(key)),
        clear: vi.fn(() => storageData.clear()),
    };
    Object.defineProperty(globalThis, "localStorage", {
        value: storageTarget,
        configurable: true,
        writable: true,
    });

    return {
        resetStorage: () => storageData.clear(),
        storageMock: storageTarget,
    };
});

import { useViewTabsState } from "./viewTabsState";

import type { StoredView } from "../types/config";

function makeView(id: string, name: string): StoredView {
    return {
        id,
        name,
        layout_columns: 12,
        items: [],
    };
}

describe("viewTabsState", () => {
    beforeEach(() => {
        resetStorage();
        storageMock.getItem.mockClear();
        storageMock.setItem.mockClear();
        storageMock.removeItem.mockClear();
        useViewTabsState.setState({
            activeViewId: null,
            orderedViewIds: [],
        });
    });

    it("persists active and ordered state in localStorage with fixed key", () => {
        const storageKey = "glanceus-dashboard-view-tabs-v1";
        expect(useViewTabsState.persist.getOptions().name).toBe(storageKey);

        useViewTabsState.getState().setActiveViewId("view-2");
        useViewTabsState.getState().setOrderedViewIds(["view-1", "view-2"]);

        const persistedRaw = storageMock.getItem(storageKey);
        expect(persistedRaw).not.toBeNull();
        const persisted = JSON.parse(String(persistedRaw)) as {
            state: { activeViewId: string | null; orderedViewIds: string[] };
        };
        expect(persisted).toMatchObject({
            state: {
                activeViewId: "view-2",
                orderedViewIds: ["view-1", "view-2"],
            },
        });
    });

    it("syncWithViews drops stale ids, preserves surviving order, appends new ids, and uses deterministic active fallback", () => {
        useViewTabsState.setState({
            activeViewId: "stale-view",
            orderedViewIds: ["stale-view", "view-2", "view-1", "stale-other"],
        });
        const views = [
            makeView("view-1", "Main"),
            makeView("view-2", "Ops"),
            makeView("view-3", "QA"),
        ];

        const result = useViewTabsState.getState().syncWithViews(views);

        expect(result).toEqual({
            activeViewId: "view-1",
            orderedViewIds: ["view-2", "view-1", "view-3"],
        });
        expect(useViewTabsState.getState().activeViewId).toBe("view-1");
        expect(useViewTabsState.getState().orderedViewIds).toEqual([
            "view-2",
            "view-1",
            "view-3",
        ]);
    });

    it("syncWithViews selects first available view when current active view is deleted", () => {
        useViewTabsState.setState({
            activeViewId: "view-2",
            orderedViewIds: ["view-1", "view-2", "view-3"],
        });

        const result = useViewTabsState.getState().syncWithViews([
            makeView("view-1", "Main"),
            makeView("view-3", "QA"),
        ]);

        expect(result.activeViewId).toBe("view-1");
        expect(result.orderedViewIds).toEqual(["view-1", "view-3"]);
    });

    it("syncWithViews is a no-op for same-content views with a new array reference", () => {
        useViewTabsState.setState({
            activeViewId: "view-1",
            orderedViewIds: ["view-1", "view-2"],
        });
        const updates: Array<{ activeViewId: string | null; orderedViewIds: string[] }> = [];
        const unsubscribe = useViewTabsState.subscribe((state) => {
            updates.push({
                activeViewId: state.activeViewId,
                orderedViewIds: state.orderedViewIds,
            });
        });

        const firstViews = [makeView("view-1", "Main"), makeView("view-2", "Ops")];
        const secondViews = [makeView("view-1", "Main"), makeView("view-2", "Ops")];

        useViewTabsState.getState().syncWithViews(firstViews);
        useViewTabsState.getState().syncWithViews(secondViews);

        unsubscribe();

        expect(updates).toHaveLength(0);
        expect(useViewTabsState.getState().activeViewId).toBe("view-1");
        expect(useViewTabsState.getState().orderedViewIds).toEqual([
            "view-1",
            "view-2",
        ]);
    });
});
