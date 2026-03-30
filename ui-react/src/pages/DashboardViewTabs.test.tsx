import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const {
    apiMock,
    invalidateViewsMock,
    invalidateSourcesMock,
    useViewsMock,
    useSourcesMock,
    useSettingsMock,
    useViewTabsStateMock,
    useStoreMock,
    storeState,
    toggleSidebarMock,
    gridStackInitMock,
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
        connectSourceUpdates: vi.fn().mockResolvedValue({
            close: vi.fn(),
            onopen: null,
            onmessage: null,
            onclose: null,
            onerror: null,
        }),
    };
    const invalidateViewsMock = vi.fn().mockResolvedValue(undefined);
    const invalidateSourcesMock = vi.fn().mockResolvedValue(undefined);
    const useViewsMock = vi.fn();
    const useSourcesMock = vi.fn();
    const useSettingsMock = vi.fn();
    const useViewTabsStateMock = vi.fn();
    const toggleSidebarMock = vi.fn();
    const gridStackInitMock = vi.fn((_options: unknown, element: HTMLElement) => ({
        el: element,
        on: vi.fn(),
        batchUpdate: vi.fn(),
        cellHeight: vi.fn(),
        margin: vi.fn(),
        getColumn: vi.fn(() => 12),
        getGridItems: vi.fn(() => []),
        removeWidget: vi.fn(),
        makeWidget: vi.fn(),
        destroy: vi.fn(),
    }));
    const storeState: any = {
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
        invalidateSourcesMock,
        useViewsMock,
        useSourcesMock,
        useSettingsMock,
        useViewTabsStateMock,
        useStoreMock,
        storeState,
        toggleSidebarMock,
        gridStackInitMock,
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
    invalidateSources: invalidateSourcesMock,
    updateSourcesSnapshot: vi.fn(),
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

vi.mock("gridstack", () => ({
    GridStack: {
        init: gridStackInitMock,
    },
}));

vi.mock("../components/auth/FlowHandler", () => ({
    FlowHandler: ({ source, isOpen }: { source: any; isOpen: boolean }) => (
        <div
            data-testid="mock-flow-handler"
            data-open={isOpen ? "true" : "false"}
            data-source-id={source?.id ?? ""}
            data-step-id={source?.interaction?.step_id ?? ""}
            data-field-count={String(source?.interaction?.fields?.length ?? 0)}
            data-title={source?.interaction?.title ?? ""}
        />
    ),
}));

vi.mock("../components/ScraperStatusBanner", () => ({
    ScraperStatusBanner: () => null,
}));

vi.mock("../components/BaseSourceCard", () => ({
    BaseSourceCard: () => (
        <div
            data-testid="mock-base-source-card"
            className="mock-base-source-card"
        />
    ),
}));

vi.mock("../components/AddWidgetDialog", () => ({
    AddWidgetDialog: ({
        open,
        onAddWidget,
    }: {
        open: boolean;
        onAddWidget: (sourceId: string, template: any) => void;
    }) =>
        open ? (
            <button
                data-testid="mock-add-widget-confirm"
                onClick={() =>
                    onAddWidget("source-1", {
                        id: "template-1",
                        type: "source_card",
                    })
                }
            >
                add
            </button>
        ) : null,
}));

vi.mock("../components/EmptyState", () => ({
    EmptyState: () => <div data-testid="mock-empty-state" />,
}));

import type { StoredView } from "../types/config";
import ViewManagementPanel from "../components/dashboard/ViewManagementPanel";

import ViewTabsBar from "../components/dashboard/ViewTabsBar";
import enMessages from "../i18n/messages/en";
import zhMessages from "../i18n/messages/zh";
import { render } from "../test/render";
import Dashboard from "./Dashboard";
import "../index.css";

function makeView(id: string, name: string): StoredView {
    return {
        id,
        name,
        layout_columns: 12,
        items: [],
    };
}

function resetDashboardMocks(
    views: StoredView[],
    activeViewId: string | null,
    viewMode: "single" | "management" = "single",
) {
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
    const setViewMode = vi.fn();
    const setSelectedDashboardId = vi.fn();
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
        viewMode,
        setViewMode,
        selectedDashboardId: activeViewId,
        setSelectedDashboardId,
    });

    return {
        setActiveViewId,
        setOrderedViewIds,
        setViewMode,
        setSelectedDashboardId,
        syncWithViews,
    };
}

describe("tab bar and management panel", () => {
    it("wraps dashboard widgets with the shared sdui card shell", async () => {
        const viewWithWidget: StoredView = {
            id: "view-shell",
            name: "Shell View",
            layout_columns: 12,
            items: [
                {
                    id: "widget-1",
                    template_id: "source_card",
                    x: 0,
                    y: 0,
                    w: 6,
                    h: 4,
                    source_id: "source-1",

                    props: { label: "Widget Shell" },
                },
            ],
        };

        resetDashboardMocks([viewWithWidget], "view-shell");

        render(<Dashboard />);

        const shell = await screen.findByText((_, element) =>
            Boolean(
                element?.classList.contains("sdui-card-shell") &&
                element.querySelector('[data-testid="mock-base-source-card"]'),
            ),
        );

        expect(shell).toHaveClass("sdui-card-shell");
        expect(shell).toHaveClass("h-full");
        expect(shell).toHaveClass("w-full");
        expect(shell).toHaveClass("min-h-0");
    });

    it("passes the freshest interaction source to FlowHandler", async () => {
        const suspendedSource = {
            id: "source-1",
            name: "Test Source",
            description: "test source",
            enabled: true,
            auth_type: "api_key",
            has_data: false,
            status: "suspended",
            interaction: {
                type: "input_text",
                step_id: "collect_sqlite_inputs",
                title: "SQLite Connection (Chinook)",
                description: "Provide a local path to Chinook_Sqlite.sqlite.",
                message:
                    "Input SQLite path and SQL guardrails for this test source.",
                fields: [
                    {
                        key: "chinook_db_path",
                        label: "Chinook SQLite Path",
                        type: "text",
                        required: true,
                    },
                    {
                        key: "sql_timeout_seconds",
                        label: "SQL Timeout Seconds",
                        type: "text",
                        required: false,
                    },
                    {
                        key: "sql_max_rows",
                        label: "SQL Max Rows",
                        type: "text",
                        required: false,
                    },
                ],
            },
        };

        resetDashboardMocks([], null);
        useSourcesMock.mockReturnValue({
            sources: [suspendedSource],
            dataMap: {},
            isLoading: false,
        });
        storeState.interactSource = {
            ...suspendedSource,
            interaction: {
                ...suspendedSource.interaction,
                step_id: "api_key",
                title: "API Key",
                message: "Provide API key",
                fields: [
                    {
                        key: "api_key",
                        label: "API Key",
                        type: "password",
                        required: true,
                    },
                ],
            },
        };

        render(<Dashboard />);

        await waitFor(() => {
            const flowHandler = screen.getByTestId("mock-flow-handler");
            expect(flowHandler).toHaveAttribute("data-open", "true");
            expect(flowHandler).toHaveAttribute("data-source-id", "source-1");
            expect(flowHandler).toHaveAttribute(
                "data-step-id",
                "collect_sqlite_inputs",
            );
            expect(flowHandler).toHaveAttribute("data-field-count", "3");
            expect(flowHandler).toHaveAttribute(
                "data-title",
                "SQLite Connection (Chinook)",
            );
        });
    });

    it("renders Chrome-style tabs with active and inactive states", () => {
        const onSelectView = vi.fn();
        const onRenameView = vi.fn();

        render(
            <ViewTabsBar
                views={[
                    makeView("view-1", "Overview"),
                    makeView("view-2", "Errors"),
                ]}
                activeViewId="view-1"
                visibleViewIds={["view-1", "view-2"]}
                overflowViewIds={[]}
                onSelectView={onSelectView}
                onRenameView={onRenameView}
                onCreateView={vi.fn()}
                onAddWidget={vi.fn()}
                addWidgetLabel="Add Widget"
                overflowLabel="More views"
                renamePlaceholder="Rename view"
                overflowPanel={<div>Overflow Panel</div>}
            />,
        );

        expect(
            screen.getByTestId("dashboard-chrome-tab-view-1"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("dashboard-chrome-tab-view-2"),
        ).toBeInTheDocument();
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
                onCreateView={vi.fn()}
                onAddWidget={vi.fn()}
                addWidgetLabel="Add Widget"
                overflowLabel="More views"
                renamePlaceholder="Rename view"
                overflowPanel={<div>Overflow Panel</div>}
            />,
        );

        // ChromeTab renders the label in a span inside the button
        const tab = screen.getByTestId("dashboard-chrome-tab-view-long");
        expect(tab).toHaveClass("max-w-[200px]");
        expect(tab).toHaveAttribute("title", longName);
    });

    it("renders +N overflow trigger that opens a Popover with management panel controls", () => {
        const onCreateView = vi.fn();
        const views = [
            makeView("view-1", "Overview"),
            makeView("view-2", "Builds"),
            makeView("view-3", "Alerts"),
        ];

        render(
            <ViewTabsBar
                views={views}
                activeViewId="view-1"
                visibleViewIds={["view-1"]}
                overflowViewIds={["view-2", "view-3"]}
                onSelectView={vi.fn()}
                onRenameView={vi.fn()}
                onCreateView={onCreateView}
                onAddWidget={vi.fn()}
                addWidgetLabel="Add Widget"
                overflowLabel="More views"
                renamePlaceholder="Rename view"
                overflowPanel={
                    <ViewManagementPanel
                        views={views}
                        activeViewId="view-1"
                        onSelectView={vi.fn()}
                        onCreateView={onCreateView}
                        onRenameView={vi.fn()}
                        onDeleteView={vi.fn()}
                        title="Manage views"
                        createLabel="Create view"
                        renamePlaceholder="Rename view"
                    />
                }
            />,
        );

        const overflowTrigger = screen.getByTestId(
            "dashboard-tab-overflow-trigger",
        );
        expect(overflowTrigger).toHaveTextContent("+2");

        // Clicking the overflow trigger opens the Popover
        fireEvent.click(overflowTrigger);

        expect(screen.getByTestId("dashboard-view-create")).toBeInTheDocument();
        expect(
            screen.getByTestId("dashboard-view-row-view-1"),
        ).toBeInTheDocument();
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

    it("delegates persisted-active reconciliation to syncWithViews", async () => {
        const views = [
            makeView("view-1", "Overview"),
            makeView("view-2", "Errors"),
        ];
        const { setActiveViewId, syncWithViews } = resetDashboardMocks(
            views,
            "missing-id",
        );

        render(<Dashboard />);

        await waitFor(() => {
            expect(syncWithViews).toHaveBeenCalledWith(views);
        });
        expect(setActiveViewId).not.toHaveBeenCalled();
    });

    it("creates a dashboard from management mode and switches to the created view", async () => {
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);
        const views = [makeView("view-1", "Overview")];
        const { setActiveViewId, setOrderedViewIds, setViewMode, setSelectedDashboardId } =
            resetDashboardMocks(views, "view-1", "management");
        apiMock.createView.mockResolvedValue({
            id: "view-1700000000000",
            name: "新看板",
            sort_index: 1,
            layout_columns: 12,
            items: [],
        });

        render(<Dashboard />);

        fireEvent.click(
            screen.getByRole("button", {
                name: zhMessages["dashboard.management.create_button"],
            }),
        );

        fireEvent.change(
            screen.getByPlaceholderText(
                zhMessages["dashboard.management.create_placeholder"],
            ),
            { target: { value: "  新看板  " } },
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: zhMessages["dashboard.management.create_submit"],
            }),
        );

        await waitFor(() => {
            expect(apiMock.createView).toHaveBeenCalledTimes(1);
        });
        expect(apiMock.createView).toHaveBeenCalledWith({
            id: "view-1700000000000",
            name: "新看板",
            sort_index: 1,
            layout_columns: 12,
            items: [],
        });
        expect(setActiveViewId).toHaveBeenCalledWith("view-1700000000000");
        expect(setSelectedDashboardId).toHaveBeenCalledWith("view-1700000000000");
        expect(setOrderedViewIds).toHaveBeenCalledWith([
            "view-1",
            "view-1700000000000",
        ]);
        expect(setViewMode).toHaveBeenCalledWith("single");
        nowSpy.mockRestore();
    });

    it("supports management dialog rename with trimmed values", async () => {
        const views = [
            makeView("view-1", "Overview"),
            makeView("view-2", "Errors"),
        ];
        resetDashboardMocks(views, "view-1", "management");
        apiMock.updateView.mockResolvedValue(views[0]);

        render(<Dashboard />);

        fireEvent.click(
            screen.getAllByRole("button", {
                name: zhMessages["dashboard.management.edit"],
            })[0],
        );
        fireEvent.change(screen.getByDisplayValue("Overview"), {
            target: { value: "  Ops   Board  " },
        });
        fireEvent.click(
            screen.getByRole("button", { name: zhMessages["common.save"] }),
        );

        await waitFor(() => {
            expect(apiMock.updateView).toHaveBeenNthCalledWith(
                1,
                "view-1",
                expect.objectContaining({ name: "Ops   Board" }),
            );
        });

        fireEvent.click(
            screen.getAllByRole("button", {
                name: zhMessages["dashboard.management.edit"],
            })[1],
        );
        fireEvent.change(screen.getByDisplayValue("Errors"), {
            target: { value: "  Build   Health  " },
        });
        fireEvent.click(
            screen.getByRole("button", { name: zhMessages["common.save"] }),
        );

        await waitFor(() => {
            expect(apiMock.updateView).toHaveBeenNthCalledWith(
                2,
                "view-2",
                expect.objectContaining({ name: "Build   Health" }),
            );
        });
    });

    it("deletes selected dashboard via management dialog and clears selected id", async () => {
        const views = [
            makeView("view-1", "Overview"),
            makeView("view-2", "Errors"),
        ];
        const { setActiveViewId, setSelectedDashboardId } = resetDashboardMocks(
            views,
            "view-2",
            "management",
        );
        apiMock.deleteView.mockResolvedValue(undefined);
        invalidateViewsMock.mockResolvedValue(undefined);

        render(<Dashboard />);
        fireEvent.click(
            screen.getAllByRole("button", {
                name: zhMessages["dashboard.management.delete"],
            })[1],
        );
        const deleteDialog = await screen.findByRole("dialog", {
            name: zhMessages["common.confirmDelete"],
        });
        fireEvent.click(
            within(deleteDialog).getByRole("button", {
                name: zhMessages["dashboard.management.delete"],
            }),
        );

        await waitFor(() => {
            expect(apiMock.deleteView).toHaveBeenCalledWith("view-2");
        });
        expect(setSelectedDashboardId).toHaveBeenCalledWith(null);
        expect(setActiveViewId).not.toHaveBeenCalled();
    });

    it("renders swiper navigation dots instead of tab overflow controls", () => {
        const views = Array.from({ length: 8 }, (_, index) =>
            makeView(`view-${index + 1}`, `View ${index + 1}`),
        );
        resetDashboardMocks(views, "view-1");

        render(<Dashboard />);

        expect(
            screen.queryByTestId("dashboard-tab-overflow-trigger"),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("tablist", { name: "Dashboard navigation" }),
        ).toBeInTheDocument();
        expect(screen.getAllByRole("tab")).toHaveLength(views.length);
    });

    it("does not invalidate sources when adding widget", async () => {
        const views = [makeView("view-1", "Overview")];
        const { syncWithViews } = resetDashboardMocks(views, "view-1");
        storeState.isAddDialogOpen = true;
        useSourcesMock.mockReturnValue({
            sources: [
                {
                    id: "source-1",
                    name: "Demo Source",
                    description: "",
                    enabled: true,
                    auth_type: "none",
                    has_data: true,
                    status: "active",
                },
            ],
            dataMap: {
                "source-1": {
                    source_id: "source-1",
                    data: { value: 1 },
                    updated_at: 100,
                    status: "active",
                },
            },
            isLoading: false,
        });
        apiMock.updateView.mockResolvedValue({
            ...views[0],
            items: [
                {
                    id: "widget-1",
                    x: 0,
                    y: 0,
                    w: 4,
                    h: 4,
                    source_id: "source-1",
                    template_id: "template-1",
                    props: {},
                },
            ],
        });

        render(<Dashboard />);
        expect(syncWithViews).toHaveBeenCalledWith(views);

        fireEvent.click(screen.getByTestId("mock-add-widget-confirm"));

        await waitFor(() => {
            expect(apiMock.updateView).toHaveBeenCalledTimes(1);
        });
        expect(invalidateSourcesMock).not.toHaveBeenCalled();
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
