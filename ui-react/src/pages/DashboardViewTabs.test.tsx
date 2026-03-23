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

import ViewManagementPanel from "../components/dashboard/ViewManagementPanel";
import ViewTabsBar from "../components/dashboard/ViewTabsBar";
import enMessages from "../i18n/messages/en";
import zhMessages from "../i18n/messages/zh";
import { render } from "../test/render";
import type { StoredView } from "../types/config";
import Dashboard from "./Dashboard";

function makeView(id: string, name: string): StoredView {
    return {
        id,
        name,
        layout_columns: 12,
        items: [],
    };
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

    return { setActiveViewId, setOrderedViewIds, syncWithViews };
}

describe("tab bar and management panel", () => {
    it("renders name-only tabs with active style and without inline delete action", () => {
        const onSelectView = vi.fn();
        const onRenameView = vi.fn();

        render(
            <ViewTabsBar
                views={[makeView("view-1", "Overview"), makeView("view-2", "Errors")]}
                activeViewId="view-1"
                visibleViewIds={["view-1", "view-2"]}
                overflowViewIds={[]}
                onSelectView={onSelectView}
                onRenameView={onRenameView}
                onToggleManagementPanel={vi.fn()}
                overflowLabel="More views"
                renamePlaceholder="Rename view"
            />,
        );

        const tabList = screen.getByRole("tablist");
        expect(tabList).toHaveClass("h-10");
        expect(screen.getByTestId("dashboard-tab-view-1")).toBeInTheDocument();
        expect(screen.getByTestId("dashboard-tab-view-2")).toBeInTheDocument();
        expect(screen.queryByTestId("dashboard-tab-delete-view-1")).not.toBeInTheDocument();
    });

    it("truncates long tab names and keeps full value in tooltip title", () => {
        const longName =
            "This is a very very very very very very very long dashboard tab name";

        render(
            <ViewTabsBar
                views={[makeView("view-long", longName)]}
                activeViewId="view-long"
                visibleViewIds={["view-long"]}
                overflowViewIds={[]}
                onSelectView={vi.fn()}
                onRenameView={vi.fn()}
                onToggleManagementPanel={vi.fn()}
                overflowLabel="More views"
                renamePlaceholder="Rename view"
            />,
        );

        const label = screen.getByTestId("dashboard-tab-label-view-long");
        expect(label).toHaveClass("truncate");
        expect(label).toHaveAttribute("title", longName);
    });

    it("renders +N overflow trigger and management panel controls", () => {
        const onToggleManagementPanel = vi.fn();
        const onCreateView = vi.fn();
        const onRenameView = vi.fn();
        const onDeleteView = vi.fn();
        const views = [
            makeView("view-1", "Overview"),
            makeView("view-2", "Builds"),
            makeView("view-3", "Alerts"),
        ];

        render(
            <>
                <ViewTabsBar
                    views={views}
                    activeViewId="view-1"
                    visibleViewIds={["view-1"]}
                    overflowViewIds={["view-2", "view-3"]}
                    onSelectView={vi.fn()}
                    onRenameView={vi.fn()}
                    onToggleManagementPanel={onToggleManagementPanel}
                    overflowLabel="More views"
                    renamePlaceholder="Rename view"
                />
                <ViewManagementPanel
                    views={views}
                    activeViewId="view-1"
                    onSelectView={vi.fn()}
                    onCreateView={onCreateView}
                    onRenameView={onRenameView}
                    onDeleteView={onDeleteView}
                    title="Manage views"
                    createLabel="Create view"
                    renamePlaceholder="Rename view"
                    deleteLabel="Delete view"
                />
            </>,
        );

        const overflowTrigger = screen.getByTestId(
            "dashboard-tab-overflow-trigger",
        );
        expect(overflowTrigger).toHaveTextContent("+2");
        fireEvent.click(overflowTrigger);
        expect(onToggleManagementPanel).toHaveBeenCalledTimes(1);

        expect(screen.getByTestId("dashboard-view-create")).toBeInTheDocument();
        expect(screen.getByTestId("dashboard-view-row-view-1")).toBeInTheDocument();
        expect(
            screen.getByTestId("dashboard-view-rename-view-1"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("dashboard-view-delete-view-1"),
        ).toBeInTheDocument();
    });
});

describe("dashboard view lifecycle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storeState.viewConfig = null;
        storeState.sources = [];
        storeState.dataMap = {};
        storeState.interactSource = null;
        storeState.isAddDialogOpen = false;
        storeState.deletingSourceId = null;
    });

    it("syncs with persisted active view and falls back when the persisted id is missing", async () => {
        const views = [makeView("view-1", "Overview"), makeView("view-2", "Errors")];
        const { setActiveViewId, syncWithViews } = resetDashboardMocks(
            views,
            "missing-id",
        );

        render(<Dashboard />);

        await waitFor(() => {
            expect(syncWithViews).toHaveBeenCalledWith(views);
        });
        expect(setActiveViewId).toHaveBeenCalledWith("view-1");
    });

    it("creates a new view with default payload and keeps active tab unchanged", async () => {
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);
        const views = [makeView("view-1", "Overview"), makeView("view-2", "新视图")];
        const { setActiveViewId } = resetDashboardMocks(views, "view-1");
        apiMock.createView.mockResolvedValue({
            id: "view-1700000000000",
            name: "新视图 1",
            layout_columns: 12,
            items: [],
        });

        render(<Dashboard />);

        fireEvent.click(screen.getByTestId("dashboard-view-create"));

        await waitFor(() => {
            expect(apiMock.createView).toHaveBeenCalledTimes(1);
        });
        expect(apiMock.createView).toHaveBeenCalledWith({
            id: "view-1700000000000",
            name: "新视图 1",
            layout_columns: 12,
            items: [],
        });
        expect(setActiveViewId).not.toHaveBeenCalledWith("view-1700000000000");
        nowSpy.mockRestore();
    });

    it("supports double-click tab rename and panel rename with normalized values", async () => {
        const views = [makeView("view-1", "Overview"), makeView("view-2", "Errors")];
        resetDashboardMocks(views, "view-1");
        apiMock.updateView.mockResolvedValue(views[0]);

        render(<Dashboard />);

        fireEvent.doubleClick(screen.getByTestId("dashboard-tab-label-view-1"));
        const tabRenameInput = screen.getByTestId("dashboard-tab-rename-view-1");
        fireEvent.change(tabRenameInput, { target: { value: "  Ops   Board  " } });
        fireEvent.keyDown(tabRenameInput, { key: "Enter" });

        await waitFor(() => {
            expect(apiMock.updateView).toHaveBeenCalledWith(
                "view-1",
                expect.objectContaining({ name: "Ops Board" }),
            );
        });

        const panelRenameInput = screen.getByTestId("dashboard-view-rename-view-2");
        fireEvent.change(panelRenameInput, { target: { value: "  Build   Health  " } });
        fireEvent.keyDown(panelRenameInput, { key: "Enter" });

        await waitFor(() => {
            expect(apiMock.updateView).toHaveBeenCalledWith(
                "view-2",
                expect.objectContaining({ name: "Build Health" }),
            );
        });
    });

    it("blocks deleting last view and falls back active tab after deleting active view", async () => {
        const singleView = [makeView("view-1", "Overview")];
        resetDashboardMocks(singleView, "view-1");

        render(<Dashboard />);
        fireEvent.click(screen.getByTestId("dashboard-view-delete-view-1"));
        expect(apiMock.deleteView).not.toHaveBeenCalled();

        const views = [makeView("view-1", "Overview"), makeView("view-2", "Errors")];
        const { setActiveViewId } = resetDashboardMocks(views, "view-2");
        apiMock.deleteView.mockResolvedValue(undefined);
        invalidateViewsMock.mockResolvedValue(undefined);

        render(<Dashboard />);
        fireEvent.click(screen.getByTestId("dashboard-view-delete-view-2"));

        await waitFor(() => {
            expect(apiMock.deleteView).toHaveBeenCalledWith("view-2");
        });
        expect(setActiveViewId).toHaveBeenCalledWith("view-1");
    });

    it("renders +N overflow trigger when view count exceeds visible cap", () => {
        const views = Array.from({ length: 8 }, (_, index) =>
            makeView(`view-${index + 1}`, `View ${index + 1}`),
        );
        resetDashboardMocks(views, "view-1");

        render(<Dashboard />);

        expect(screen.getByTestId("dashboard-tab-overflow-trigger")).toHaveTextContent("+2");
    });
});

describe("tab lifecycle i18n keys", () => {
    const lifecycleKeys = [
        "dashboard.tabs.new_view_base",
        "dashboard.tabs.manage_views",
        "dashboard.tabs.create_view",
        "dashboard.tabs.rename_placeholder",
        "dashboard.tabs.rename_empty",
        "dashboard.tabs.rename_duplicate",
        "dashboard.tabs.delete_view",
        "dashboard.tabs.delete_blocked_last",
        "dashboard.tabs.overflow_more",
        "dashboard.tabs.overflow_title",
    ] as const;

    it("defines all required keys in en and zh catalogs with overflow placeholder", () => {
        for (const key of lifecycleKeys) {
            expect(enMessages[key]).toBeTypeOf("string");
            expect(zhMessages[key]).toBeTypeOf("string");
        }
        expect(enMessages["dashboard.tabs.overflow_more"]).toContain("{count}");
        expect(zhMessages["dashboard.tabs.overflow_more"]).toContain("{count}");
    });
});
