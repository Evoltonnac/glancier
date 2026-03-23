import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    apiMock,
    invalidateViewsMock,
    useViewsMock,
    useSourcesMock,
    useSettingsMock,
    useViewTabsStateMock,
    useStoreMock,
    storeState,
    toggleSidebarMock,
} = vi.hoisted(() => {
    const apiMock = {
        getSources: vi.fn().mockResolvedValue([]),
        getSourceData: vi.fn().mockResolvedValue(null),
        getViews: vi.fn().mockResolvedValue([]),
        createView: vi.fn(),
        updateView: vi.fn(),
        deleteView: vi.fn(),
        updateSourceRefreshInterval: vi.fn(),
        refreshSource: vi.fn(),
        refreshAll: vi.fn(),
        deleteSourceFile: vi.fn(),
        getIntegrationTemplates: vi.fn(),
    };
    const invalidateViewsMock = vi.fn().mockResolvedValue(undefined);
    const useViewsMock = vi.fn();
    const useSourcesMock = vi.fn();
    const useSettingsMock = vi.fn();
    const useViewTabsStateMock = vi.fn();
    const toggleSidebarMock = vi.fn();
    const storeState = {
        viewConfig: null,
        setViewConfig: vi.fn(),
        sources: [],
        setSources: vi.fn(),
        dataMap: {},
        setDataMap: vi.fn(),
        interactSource: null,
        setInteractSource: vi.fn(),
        isAddDialogOpen: false,
        setIsAddDialogOpen: vi.fn(),
        deletingSourceId: null,
        setDeletingSourceId: vi.fn(),
        setSkippedScrapers: vi.fn(),
        showToast: vi.fn(),
    };
    const useStoreMock = vi.fn(() => storeState);
    return {
        apiMock,
        invalidateViewsMock,
        useViewsMock,
        useSourcesMock,
        useSettingsMock,
        useViewTabsStateMock,
        useStoreMock,
        storeState,
        toggleSidebarMock,
    };
});

vi.mock("../api/client", () => ({
    api: apiMock,
}));

vi.mock("../hooks/useSWR", () => ({
    useViews: useViewsMock,
    useSources: useSourcesMock,
    useSettings: useSettingsMock,
    invalidateViews: invalidateViewsMock,
    invalidateSources: vi.fn(),
    optimisticRemoveSource: vi.fn(),
    optimisticUpdateSourceStatus: vi.fn(),
    mutate: vi.fn(),
}));

vi.mock("../store/viewTabsState", () => ({
    useViewTabsState: useViewTabsStateMock,
}));

vi.mock("../store", () => ({
    useStore: useStoreMock,
}));

vi.mock("../hooks/useSidebar", () => ({
    useSidebar: () => ({
        sidebarCollapsed: false,
        toggleSidebar: toggleSidebarMock,
    }),
}));

vi.mock("../hooks/useScraper", () => ({
    useScraper: () => ({
        activeScraper: null,
        queueLength: 0,
        scraperLogs: [],
        handleSkipScraper: vi.fn(),
        handleClearScraperQueue: vi.fn(),
        handlePushToQueue: vi.fn(),
        handleShowScraperWindow: vi.fn(),
    }),
}));

vi.mock("../components/auth/FlowHandler", () => ({
    FlowHandler: () => null,
}));

vi.mock("../components/ScraperStatusBanner", () => ({
    ScraperStatusBanner: () => null,
}));

vi.mock("../components/BaseSourceCard", () => ({
    BaseSourceCard: () => <div data-testid="mock-base-source-card" />,
}));

vi.mock("../components/AddWidgetDialog", () => ({
    AddWidgetDialog: () => null,
}));

vi.mock("../components/EmptyState", () => ({
    EmptyState: () => <div data-testid="mock-empty-state" />,
}));

import { render } from "../test/render";
import type { StoredView } from "../types/config";
import Dashboard from "./Dashboard";
import { buildReorderedViewIds } from "./dashboardViewTabs";

function makeView(id: string, name: string): StoredView {
    return {
        id,
        name,
        layout_columns: 12,
        items: [],
    };
}

function makeDataTransfer(): DataTransfer {
    const data = new Map<string, string>();
    return {
        setData: (type: string, value: string) => {
            data.set(type, value);
        },
        getData: (type: string) => data.get(type) ?? "",
        clearData: () => data.clear(),
        dropEffect: "move",
        effectAllowed: "all",
        files: [] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
        types: [] as string[],
        setDragImage: () => undefined,
    } as DataTransfer;
}

function resetDashboardMocks(views: StoredView[], activeViewId: string | null) {
    useSourcesMock.mockReturnValue({
        sources: [],
        dataMap: {},
        isLoading: false,
    });
    useViewsMock.mockReturnValue({
        views,
        isLoading: false,
        isError: null,
        mutateViews: vi.fn(),
    });
    useSettingsMock.mockReturnValue({
        settings: { density: "normal" },
        isLoading: false,
        isError: null,
        mutateSettings: vi.fn(),
    });

    const setActiveViewId = vi.fn();
    const setOrderedViewIds = vi.fn();
    const syncWithViews = vi.fn().mockReturnValue({
        activeViewId: views[0]?.id ?? null,
        orderedViewIds: views.map((view) => view.id),
    });

    useViewTabsStateMock.mockReturnValue({
        activeViewId,
        orderedViewIds: views.map((view) => view.id),
        setActiveViewId,
        setOrderedViewIds,
        syncWithViews,
    });

    return { setOrderedViewIds };
}

function runDragAndDrop(sourceTestId: string, dropTargetTestId: string) {
    const dataTransfer = makeDataTransfer();
    const source = screen.getByTestId(sourceTestId);
    const target = screen.getByTestId(dropTargetTestId);

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
}

describe("Dashboard cross-zone reorder", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storeState.viewConfig = null;
        storeState.sources = [];
        storeState.dataMap = {};
        storeState.interactSource = null;
        storeState.isAddDialogOpen = false;
        storeState.deletingSourceId = null;
    });

    it("cross-zone reorder updates visible order when dragging a visible tab into visible area", async () => {
        const views = Array.from({ length: 8 }, (_, index) =>
            makeView(`view-${index + 1}`, `View ${index + 1}`),
        );
        const { setOrderedViewIds } = resetDashboardMocks(views, "view-1");

        render(<Dashboard />);
        runDragAndDrop("dashboard-tab-view-3", "dashboard-tab-drop-1");

        await waitFor(() => {
            expect(setOrderedViewIds).toHaveBeenLastCalledWith([
                "view-1",
                "view-3",
                "view-2",
                "view-4",
                "view-5",
                "view-6",
                "view-7",
                "view-8",
            ]);
        });
    });

    it("cross-zone reorder keeps visible cap by pushing visible tail to overflow when dragging overflow into visible", async () => {
        const views = Array.from({ length: 8 }, (_, index) =>
            makeView(`view-${index + 1}`, `View ${index + 1}`),
        );
        const { setOrderedViewIds } = resetDashboardMocks(views, "view-1");

        render(<Dashboard />);
        runDragAndDrop("dashboard-view-row-view-8", "dashboard-tab-drop-1");

        await waitFor(() => {
            expect(setOrderedViewIds).toHaveBeenLastCalledWith([
                "view-1",
                "view-8",
                "view-2",
                "view-3",
                "view-4",
                "view-5",
                "view-6",
                "view-7",
            ]);
        });
    });

    it("cross-zone reorder moves visible tab into overflow area with no duplicates", async () => {
        const views = Array.from({ length: 8 }, (_, index) =>
            makeView(`view-${index + 1}`, `View ${index + 1}`),
        );
        const { setOrderedViewIds } = resetDashboardMocks(views, "view-1");

        render(<Dashboard />);
        runDragAndDrop("dashboard-tab-view-2", "dashboard-overflow-drop-1");

        await waitFor(() => {
            expect(setOrderedViewIds).toHaveBeenCalled();
        });

        const nextOrderedIds = setOrderedViewIds.mock.calls.at(-1)?.[0] as string[];
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
