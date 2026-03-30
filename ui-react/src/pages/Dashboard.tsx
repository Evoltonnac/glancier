import {
    Component,
    type ReactNode,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    useState,
} from "react";
import { GridStack } from "gridstack";
import { useNavigate } from "react-router-dom";
import "gridstack/dist/gridstack.min.css";
import { api, type SourceUpdateStreamPayload } from "../api/client";
import type {
    SourceSummary,
    DataResponse,
    ViewComponent,
    StoredView,
} from "../types/config";
import { Card, CardContent } from "../components/ui/card";
import { Badge, badgeVariants } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import {
    useSources,
    useViews,
    invalidateSources,
    invalidateViews,
    optimisticRemoveSource,
    optimisticUpdateSourceStatus,
    updateSourcesSnapshot,
    mutate,
    useSettings,
} from "../hooks/useSWR";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "../components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../components/ui/tooltip";
import { FlowHandler } from "../components/auth/FlowHandler";
import { BaseSourceCard } from "../components/BaseSourceCard";
import { AddWidgetDialog } from "../components/AddWidgetDialog";
import { ScraperStatusBanner } from "../components/ScraperStatusBanner";
import { EmptyState } from "../components/EmptyState";
import {
    DashboardGrid,
    DashboardSwiper,
    CreateDashboardDialog,
    DeleteConfirmDialog,
    RenameDialog,
} from "../components/dashboard";
import { useStore } from "../store";
import { useViewTabsState } from "../store/viewTabsState";
import { useI18n } from "../i18n";
import { useSidebar } from "../hooks/useSidebar";
import { useScraper } from "../hooks/useScraper";
import {
    mergeViewItemsWithGridNodes,
    findFirstAvailableGridPlacement,
    sanitizeGridNodeLayout,
} from "./dashboardLayout";
import { parseCssLengthToPixels } from "./gridSizing";
import { createViewSaveQueue } from "./viewSaveQueue";
import { SourceUpdateCoordinator } from "./sourceUpdateCoordinator";
import { invoke } from "@tauri-apps/api/core";
import {
    Play,
    Database,
    Trash2,
    Wrench,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Plus,
    Clock,
    MoreVertical,
} from "lucide-react";

// GridStack layout constants - now dynamically read from CSS variables
const warnedCompatibilityKeys = new Set<string>();
const EMPTY_DASHBOARD_VIEWS: StoredView[] = [];

function warnDashboardCompatibilityOnce(key: string, message: string): void {
    if (warnedCompatibilityKeys.has(key)) {
        return;
    }
    warnedCompatibilityKeys.add(key);
    console.warn(message);
}

function getCssLengthInPixels(variableName: string, fallback: number): number {
    if (typeof window === "undefined") {
        return fallback;
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const rootFontSize = Number.parseFloat(rootStyle.fontSize) || 16;
    const value = rootStyle.getPropertyValue(variableName);
    return parseCssLengthToPixels(value, fallback, rootFontSize);
}

function parseGridIntAttr(
    value: string | null,
    fallback: number,
): number {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeViewProps(
    itemId: string,
    rawProps: unknown,
): Record<string, any> {
    if (rawProps && typeof rawProps === "object" && !Array.isArray(rawProps)) {
        return rawProps as Record<string, any>;
    }
    if (rawProps !== undefined && rawProps !== null) {
        warnDashboardCompatibilityOnce(
            `invalid-props:${itemId}`,
            `[Dashboard] Widget ${itemId} has invalid props shape (${typeof rawProps}); fallback to empty props.`,
        );
    }
    return {};
}

function normalizeTemplateType(
    itemId: string,
    rawType: unknown,
): ViewComponent["type"] {
    if (typeof rawType !== "string" || rawType.trim() === "") {
        warnDashboardCompatibilityOnce(
            `missing-type:${itemId}`,
            `[Dashboard] Widget ${itemId} is missing component type; fallback to source_card.`,
        );
        return "source_card";
    }

    if (rawType !== "source_card") {
        warnDashboardCompatibilityOnce(
            `unknown-type:${itemId}:${rawType}`,
            `[Dashboard] Widget ${itemId} uses unknown component type '${rawType}', fallback to source_card.`,
        );
        return "source_card";
    }

    return "source_card";
}

interface WidgetFallbackBoundaryProps {
    itemId: string;
    resetKey: string;
    children: ReactNode;
}

interface WidgetFallbackBoundaryState {
    hasError: boolean;
}

class WidgetFallbackBoundary extends Component<
    WidgetFallbackBoundaryProps,
    WidgetFallbackBoundaryState
> {
    state: WidgetFallbackBoundaryState = { hasError: false };

    static getDerivedStateFromError(): WidgetFallbackBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error): void {
        warnDashboardCompatibilityOnce(
            `render-failure:${this.props.itemId}:${error.name}:${error.message}`,
            `[Dashboard] Widget ${this.props.itemId} render failed; degraded to fallback state. ${error.name}: ${error.message}`,
        );
    }

    componentDidUpdate(prevProps: WidgetFallbackBoundaryProps): void {
        if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    Widget temporarily unavailable (degraded mode)
                </div>
            );
        }
        return this.props.children;
    }
}

// Delete button — absolute positioned at top-right corner of card
function DeleteBtn({ onDelete }: { onDelete?: () => void }) {
    if (!onDelete) return null;
    return (
        <button
            className="qb-delete-btn"
            onClick={(e) => {
                e.stopPropagation();
                onDelete();
            }}
            title="Delete"
        >
            <Trash2 className="h-3.5 w-3.5" />
        </button>
    );
}

// Render component based on type
function renderComponent(
    comp: ViewComponent,
    sourceData: DataResponse | null,
    sourceSummary?: SourceSummary,
    onInteract?: (source: SourceSummary) => void,
    onShowError?: (source: SourceSummary) => void,
) {
    return (
        <BaseSourceCard
            component={comp}
            sourceSummary={sourceSummary}
            sourceData={sourceData}
            onInteract={onInteract}
            onShowError={onShowError}
        />
    );
}

function hasSourceError(
    source: SourceSummary,
    sourceData?: DataResponse | null,
): boolean {
    return (
        !!source.error ||
        !!source.error_details ||
        (!!source.message && source.status === "error") ||
        !!sourceData?.error
    );
}

function hasActionableInteraction(source: SourceSummary): boolean {
    return (
        !!source.interaction &&
        (source.status === "suspended" || source.status === "error")
    );
}

function getSourceErrorSummary(
    source: SourceSummary,
    getErrorMessageByCode: (errorCode?: string | null) => string | null,
    sourceData?: DataResponse | null,
): string {
    const friendlyByCode = getErrorMessageByCode(source.error_code);
    if (friendlyByCode) {
        return friendlyByCode;
    }
    return (
        source.error ||
        sourceData?.error ||
        source.message?.split("\n")[0] ||
        "Execution failed"
    );
}

function getSourceErrorDetails(
    source: SourceSummary,
    sourceData?: DataResponse | null,
): string {
    return (
        source.error_details ||
        source.message ||
        sourceData?.error ||
        source.error ||
        ""
    );
}

function formatRefreshInterval(
    minutes: number | null | undefined,
    t: (key: string) => string,
): string {
    if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
        return t("dashboard.refresh.not_set");
    }
    if (minutes <= 0) {
        return t("dashboard.refresh.off");
    }
    if (minutes % 60 === 0) {
        return `${minutes / 60}h`;
    }
    return `${minutes}m`;
}

function getFreshnessText(
    updatedAt: number,
    nowSeconds: number,
    t: (key: string) => string,
): string {
    const deltaSeconds = Math.max(0, Math.floor(nowSeconds - updatedAt));
    if (deltaSeconds < 60) {
        return t("dashboard.refresh.just_now");
    }
    if (deltaSeconds < 3600) {
        return `${Math.floor(deltaSeconds / 60)}m`;
    }
    if (deltaSeconds < 86400) {
        return `${Math.floor(deltaSeconds / 3600)}h`;
    }
    return `${Math.floor(deltaSeconds / 86400)}d`;
}

function getFreshnessStyles(
    updatedAt: number | null | undefined,
    nowSeconds: number,
): string {
    if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) {
        return "hidden";
    }
    const deltaSeconds = Math.max(0, Math.floor(nowSeconds - updatedAt));
    if (deltaSeconds < 300) {
        // < 5 mins - Fresh (bright green, very light)
        return "bg-gradient-to-r from-green-500/15 to-emerald-500/0 text-green-700 dark:text-green-300";
    }
    if (deltaSeconds < 3600) {
        // 5 mins - 1 hour (yellow/amber, very light)
        return "bg-gradient-to-r from-amber-400/15 to-yellow-400/0 text-amber-700 dark:text-amber-300";
    }
    if (deltaSeconds < 86400) {
        // 1 hour - 1 day (orange, very light)
        return "bg-gradient-to-r from-orange-400/10 to-yellow-300/0 text-orange-700 dark:text-orange-300";
    }
    // > 1 day (gray, very light)
    return "bg-gradient-to-r from-muted/40 to-muted/0 text-muted-foreground/60";
}

function resolveViewSortIndex(view: StoredView, fallbackIndex: number): number {
    if (typeof view.sort_index === "number" && Number.isFinite(view.sort_index)) {
        return view.sort_index;
    }
    return fallbackIndex;
}

export default function Dashboard() {
    const navigate = useNavigate();
    const { t, getErrorMessageByCode } = useI18n();
    const {
        viewConfig: storeViewConfig,
        setViewConfig,
        interactSource,
        setInteractSource,
        isAddDialogOpen,
        setIsAddDialogOpen,
        deletingSourceId,
        setDeletingSourceId,
        setSkippedScrapers,
        showToast,
    } = useStore();
    const {
        activeViewId,
        orderedViewIds,
        setActiveViewId,
        setOrderedViewIds,
        syncWithViews,
        viewMode,
        setViewMode,
        selectedDashboardId,
        setSelectedDashboardId,
    } = useViewTabsState();
    const refreshIntervalOptions: Array<{ value: number; label: string }> = [
        { value: 0, label: t("settings.refresh.option.off") },
        { value: 5, label: t("settings.refresh.option.5m") },
        { value: 30, label: t("settings.refresh.option.30m") },
        { value: 60, label: t("settings.refresh.option.1h") },
        { value: 1440, label: t("settings.refresh.option.1d") },
    ];

    // Use SWR for data fetching - handles dedup, caching, and StrictMode automatically
    const { sources: swrSources, dataMap, isLoading: swrLoading } = useSources();
    const { views: fetchedViews } = useViews();
    const swrViews =
        fetchedViews.length === 0 ? EMPTY_DASHBOARD_VIEWS : fetchedViews;

    // Use SWR data, fallback to store data during initial load
    const sources: SourceSummary[] = swrSources;
    const viewsById = useMemo(() => {
        const lookup = new Map<string, StoredView>();
        for (const view of swrViews) {
            lookup.set(view.id, view);
        }
        return lookup;
    }, [swrViews]);
    const orderedViews = useMemo(() => {
        const ordered = orderedViewIds
            .map((viewId) => viewsById.get(viewId))
            .filter((view): view is StoredView => Boolean(view));
        const seen = new Set(ordered.map((view) => view.id));
        for (const view of swrViews) {
            if (!seen.has(view.id)) {
                ordered.push(view);
            }
        }
        return ordered;
    }, [orderedViewIds, swrViews, viewsById]);
    const resolvedActiveViewId =
        activeViewId && viewsById.has(activeViewId)
            ? activeViewId
            : orderedViews[0]?.id ?? null;
    const viewConfig: StoredView | null = resolvedActiveViewId
        ? (viewsById.get(resolvedActiveViewId) ?? null)
        : storeViewConfig;
    const activeInteractionSource = useMemo(() => {
        if (!interactSource) {
            return null;
        }
        return sources.find((source) => source.id === interactSource.id) ?? interactSource;
    }, [interactSource, sources]);
    const isDataLoading = swrLoading && swrSources.length === 0;
    const sourcesSnapshotRef = useRef<{
        sources: SourceSummary[];
        dataMap: Record<string, DataResponse>;
    }>({
        sources,
        dataMap,
    });
    const coordinatorRef = useRef<SourceUpdateCoordinator | null>(null);
    const sourceUpdatesSocketRef = useRef<WebSocket | null>(null);
    const sourceUpdatesSeqRef = useRef(0);
    const sourceUpdatesReconnectRef = useRef<number | null>(null);

    // Density settings
    const { settings } = useSettings();

    // Get current density (default to "normal")
    const currentDensity = settings?.density || "normal";

    // Get grid gap and row height from CSS variable
    const gridGap = getCssLengthInPixels("--qb-grid-gap", 8);
    const gridRowHeight = getCssLengthInPixels("--qb-grid-row-height", 56);

    // Apply density to document
    useEffect(() => {
        document.documentElement.setAttribute("data-density", currentDensity);
    }, [currentDensity]);

    useEffect(() => {
        syncWithViews(swrViews);
    }, [swrViews, syncWithViews]);

    useEffect(() => {
        sourcesSnapshotRef.current = { sources, dataMap };
    }, [sources, dataMap]);

    const { sidebarCollapsed, toggleSidebar } = useSidebar();
    const {
        activeScraper,
        queueLength,
        scraperLogs,
        handleSkipScraper,
        handleClearScraperQueue,
        handlePushToQueue,
        handleShowScraperWindow,
    } = useScraper();
    const [errorSourceId, setErrorSourceId] = useState<string | null>(null);
    const [showErrorDetails, setShowErrorDetails] = useState(false);

    // Dialog state for dashboard management
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [deletingView, setDeletingView] = useState<StoredView | null>(null);
    const [renamingView, setRenamingView] = useState<StoredView | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);

    // GridStack ref
    const [activeGridElement, setActiveGridElement] = useState<HTMLDivElement | null>(
        null,
    );
    const gsInstanceRef = useRef<GridStack | null>(null);
    const suppressGridChangeRef = useRef(false);
    const viewSaveQueueRef = useRef<ReturnType<typeof createViewSaveQueue> | null>(
        null,
    );
    const reorderSavePromiseRef = useRef<Promise<void>>(Promise.resolve());
    const [nowSeconds, setNowSeconds] = useState<number>(() =>
        Math.floor(Date.now() / 1000),
    );
    const activeItemIdsKey = useMemo(() => {
        if (!viewConfig || viewConfig.items.length === 0) {
            return "";
        }
        return viewConfig.items.map((item) => item.id).join("|");
    }, [viewConfig]);
    if (!viewSaveQueueRef.current) {
        viewSaveQueueRef.current = createViewSaveQueue(
            async (nextView) => {
                await api.updateView(nextView.id, nextView);
            },
            {
                onError: (error) => {
                    console.error("Failed to persist dashboard view update:", error);
                },
                onDrained: async () => {
                    await invalidateViews();
                },
            },
        );
    }

    const viewConfigRef = useRef(viewConfig);
    useEffect(() => {
        viewConfigRef.current = viewConfig;
    }, [viewConfig]);

    const setActiveGridRef = useCallback((element: HTMLDivElement | null) => {
        setActiveGridElement((previous) =>
            previous === element ? previous : element,
        );
    }, []);

    const applyOptimisticViewUpdate = useCallback(
        (nextView: StoredView) => {
            viewConfigRef.current = nextView;
            setViewConfig(nextView);
            void mutate(
                "views",
                (existingViews?: StoredView[]) => {
                    const baseViews: StoredView[] =
                        existingViews && existingViews.length > 0
                            ? existingViews
                            : swrViews;
                    let found = false;
                    const updatedViews = baseViews.map((view: StoredView) => {
                        if (view.id === nextView.id) {
                            found = true;
                            return nextView;
                        }
                        return view;
                    });
                    if (!found) {
                        updatedViews.push(nextView);
                    }
                    return updatedViews;
                },
                false,
            );
        },
        [setViewConfig, swrViews],
    );

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNowSeconds(Math.floor(Date.now() / 1000));
        }, 60000);
        return () => window.clearInterval(timer);
    }, []);

    // Dashboard management CRUD handlers

    const handleCreateDashboard = async (name: string) => {
        try {
            const nextView: StoredView = {
                id: `view-${Date.now()}`,
                name: name.trim(),
                sort_index: orderedViews.length,
                layout_columns: 12,
                items: [],
            };
            const createdView = await api.createView(nextView);
            await mutate(
                "views",
                (existingViews?: StoredView[]) => {
                    const baseViews: StoredView[] = existingViews ?? swrViews;
                    if (baseViews.some((view) => view.id === createdView.id)) {
                        return baseViews;
                    }
                    return [...baseViews, createdView];
                },
                false,
            );
            setActiveViewId(createdView.id);
            setSelectedDashboardId(createdView.id);
            setOrderedViewIds([...orderedViews.map((view) => view.id), createdView.id]);
            await invalidateViews();
            showToast(t("dashboard.management.create_success"), "success");
            setIsCreateDialogOpen(false);
            setViewMode("single");
        } catch (error) {
            console.error("Failed to create dashboard:", error);
            showToast(t("common.retryLater"), "error");
            throw error;
        }
    };

    const handleEditDashboard = (view: StoredView) => {
        setRenamingView(view);
        setIsRenameDialogOpen(true);
    };

    const handleRenameDashboard = async (viewId: string, newName: string) => {
        setIsRenaming(true);
        try {
            const currentView = swrViews.find((v: StoredView) => v.id === viewId);
            if (!currentView) return;
            await api.updateView(viewId, { ...currentView, name: newName.trim() });
            await invalidateViews();
            setIsRenameDialogOpen(false);
            setRenamingView(null);
        } catch (error) {
            console.error("Failed to rename dashboard:", error);
            showToast(t("common.retryLater"), "error");
        } finally {
            setIsRenaming(false);
        }
    };

    const handleDeleteDashboard = async () => {
        if (!deletingView) return;
        setIsDeleting(true);
        try {
            await api.deleteView(deletingView.id);
            await invalidateViews();
            setIsDeleteDialogOpen(false);
            setDeletingView(null);
            // If deleted view was selected, clear selection
            if (selectedDashboardId === deletingView.id) {
                setSelectedDashboardId(null);
            }
        } catch (error) {
            console.error("Failed to delete dashboard:", error);
            showToast(t("common.retryLater"), "error");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleReorderDashboards = useCallback(
        (newOrderedIds: string[]) => {
            const previousOrderedIds = orderedViews.map((view) => view.id);
            setOrderedViewIds(newOrderedIds);

            const nextSortIndexById = new Map<string, number>();
            newOrderedIds.forEach((viewId, index) => {
                nextSortIndexById.set(viewId, index);
            });
            const currentSortIndexById = new Map<string, number>();
            orderedViews.forEach((view, index) => {
                currentSortIndexById.set(view.id, resolveViewSortIndex(view, index));
            });

            void mutate(
                "views",
                (existingViews?: StoredView[]) => {
                    const baseViews: StoredView[] =
                        existingViews && existingViews.length > 0
                            ? existingViews
                            : swrViews;
                    return baseViews.map((view: StoredView) => {
                        const nextSortIndex = nextSortIndexById.get(view.id);
                        if (nextSortIndex === undefined) {
                            return view;
                        }
                        const currentSortIndex =
                            currentSortIndexById.get(view.id) ?? nextSortIndex;
                        if (currentSortIndex === nextSortIndex) {
                            return view;
                        }
                        return { ...view, sort_index: nextSortIndex };
                    });
                },
                false,
            );

            const hasSortIndexChange = newOrderedIds.some((viewId, index) => {
                const currentSortIndex = currentSortIndexById.get(viewId) ?? index;
                return currentSortIndex !== index;
            });
            if (!hasSortIndexChange) {
                return;
            }

            reorderSavePromiseRef.current = reorderSavePromiseRef.current
                .catch(() => undefined)
                .then(async () => {
                    const reorderedViews = await api.reorderViews(newOrderedIds);
                    await mutate("views", reorderedViews, false);
                    await invalidateViews();
                })
                .catch((error) => {
                    console.error("Failed to persist dashboard reorder:", error);
                    setOrderedViewIds(previousOrderedIds);
                    showToast(t("common.retryLater"), "error");
                    void invalidateViews();
                });
        },
        [orderedViews, setOrderedViewIds, showToast, swrViews, t, viewsById],
    );

    const handleSelectDashboard = (view: StoredView) => {
        // Click on dashboard card to enter that dashboard
        setSelectedDashboardId(view.id);
        setActiveViewId(view.id);
        setViewMode("single");
    };

    const handleEnterManagementMode = () => {
        setViewMode("management");
    };

    const handleReturnToSingleDashboard = () => {
        const fallbackViewId =
            selectedDashboardId ?? resolvedActiveViewId ?? orderedViews[0]?.id ?? null;
        if (fallbackViewId) {
            setSelectedDashboardId(fallbackViewId);
            setActiveViewId(fallbackViewId);
        }
        setViewMode("single");
    };

    const handleAddWidget = async (
        sourceId: string,
        template: ViewComponent,
    ) => {
        let currentView = viewConfig;
        let isNewView = false;

        if (!currentView) {
            currentView = {
                id: `view-${Date.now()}`,
                name: t("dashboard.view.default_name"),
                sort_index: orderedViews.length,
                layout_columns: 12,
                items: [],
            };
            isNewView = true;
        }

        const newItemId = `widget-${Date.now()}`;
        const placement = findFirstAvailableGridPlacement(
            currentView.items,
            currentView.layout_columns || 12,
            4,
            4,
        );
        const newItem = {
            id: newItemId,
            x: placement.x,
            y: placement.y,
            w: placement.w,
            h: placement.h,
            source_id: sourceId,
            template_id: template.id,
            props: {},
        };

        const updatedView = {
            ...currentView,
            items: [...currentView.items, newItem],
        };

        try {
            if (isNewView) {
                setViewConfig(updatedView);
                await api.createView(updatedView);
                await invalidateViews();
            } else {
                applyOptimisticViewUpdate(updatedView);
                viewSaveQueueRef.current?.enqueue(updatedView);
            }
            coordinatorRef.current?.submitSources([sourceId], "view_change", {
                force: true,
            });
        } catch (error) {
            console.error("Failed to add widget:", error);
            void invalidateViews();
            setViewConfig(viewConfig);
        }
    };

    const buildViewFromGrid = useCallback((baseView: StoredView): StoredView | null => {
        const gs = gsInstanceRef.current;
        if (!gs) {
            return null;
        }

        const expectedColumns = baseView.layout_columns || 12;
        if (gs.getColumn() !== expectedColumns) {
            console.warn(
                `[GridStack] Column mismatch: expected ${expectedColumns}, got ${gs.getColumn()}. Skipping save to prevent layout corruption.`,
            );
            return null;
        }

        const nodes = gs
            .getGridItems()
            .map((el) =>
                sanitizeGridNodeLayout(
                    {
                        id: el.getAttribute("gs-id") || "",
                        x: parseGridIntAttr(el.getAttribute("gs-x"), 0),
                        y: parseGridIntAttr(el.getAttribute("gs-y"), 0),
                        w: parseGridIntAttr(el.getAttribute("gs-w"), 3),
                        h: parseGridIntAttr(el.getAttribute("gs-h"), 4),
                    },
                    expectedColumns,
                ),
            )
            .filter((node) => node.id !== "");

        const updatedItems = mergeViewItemsWithGridNodes(
            baseView.items,
            nodes,
            expectedColumns,
        );

        return { ...baseView, items: updatedItems };
    }, []);

    const handleDeleteWidget = async (itemId: string) => {
        if (!viewConfig) return;
        const newItems = viewConfig.items.filter((it) => it.id !== itemId);
        const updatedView = { ...viewConfig, items: newItems };

        applyOptimisticViewUpdate(updatedView);

        const gs = gsInstanceRef.current;
        if (gs) {
            suppressGridChangeRef.current = true;
            const el = activeGridElement?.querySelector(`[gs-id="${itemId}"]`);
            if (el) gs.removeWidget(el as HTMLElement, false);
            requestAnimationFrame(() => {
                const compactedView = buildViewFromGrid(updatedView) ?? updatedView;
                applyOptimisticViewUpdate(compactedView);
                viewSaveQueueRef.current?.enqueue(compactedView);
                suppressGridChangeRef.current = false;
            });
            return;
        }

        viewSaveQueueRef.current?.enqueue(updatedView);
    };

    const handleGridChange = useCallback(() => {
        if (suppressGridChangeRef.current) return;

        const currentViewConfig = viewConfigRef.current;
        if (!currentViewConfig) return;

        const updatedView = buildViewFromGrid(currentViewConfig);
        if (!updatedView) {
            return;
        }
        applyOptimisticViewUpdate(updatedView);
        viewSaveQueueRef.current?.enqueue(updatedView);
    }, [applyOptimisticViewUpdate, buildViewFromGrid]);

    useEffect(() => {
        const hasRenderableGrid =
            !!activeGridElement && !!viewConfig && viewConfig.items.length > 0;

        if (!hasRenderableGrid) {
            if (gsInstanceRef.current) {
                gsInstanceRef.current.destroy(false);
                gsInstanceRef.current = null;
            }
            return;
        }

        const currentElement = activeGridElement;
        const existing = gsInstanceRef.current;

        if (existing && currentElement && existing.el !== currentElement) {
            existing.destroy(false);
            gsInstanceRef.current = null;
        }

        if (!gsInstanceRef.current && currentElement) {
            suppressGridChangeRef.current = true;
            const instance = GridStack.init(
                {
                    column: viewConfig.layout_columns || 12,
                    cellHeight: gridRowHeight,
                    margin: gridGap,
                    float: false,
                    animate: true,
                    draggable: { handle: ".qb-card-header" },
                    resizable: { handles: "se" },
                },
                currentElement,
            );
            gsInstanceRef.current = instance;
            instance.on("change", handleGridChange);
            instance.batchUpdate();

            requestAnimationFrame(() => {
                instance.batchUpdate(false);
                instance.cellHeight(gridRowHeight);
                instance.margin(gridGap);
                suppressGridChangeRef.current = false;
            });
        }
    }, [activeGridElement, gridGap, gridRowHeight, handleGridChange, viewConfig?.id, viewConfig?.items.length, viewConfig?.layout_columns]);

    useEffect(() => {
        const gs = gsInstanceRef.current;
        if (!gs || !activeGridElement || !viewConfig) {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            suppressGridChangeRef.current = true;
            gs.batchUpdate();

            const domItems = Array.from(
                activeGridElement.querySelectorAll<HTMLElement>(".grid-stack-item"),
            );
            const domItemIds = new Set<string>();

            for (const el of domItems) {
                const itemId = el.getAttribute("gs-id");
                if (itemId) {
                    domItemIds.add(itemId);
                }
                const hasNode = Boolean(
                    (el as HTMLElement & { gridstackNode?: unknown }).gridstackNode,
                );
                if (!hasNode) {
                    gs.makeWidget(el);
                }
            }

            for (const trackedEl of gs.getGridItems()) {
                const itemId = trackedEl.getAttribute("gs-id");
                if (itemId && !domItemIds.has(itemId)) {
                    gs.removeWidget(trackedEl, false);
                }
            }

            gs.batchUpdate(false);
            suppressGridChangeRef.current = false;
        });

        return () => window.cancelAnimationFrame(frame);
    }, [activeGridElement, activeItemIdsKey, viewConfig?.id]);

    useEffect(() => {
        return () => {
            if (gsInstanceRef.current) {
                gsInstanceRef.current.destroy(false);
                gsInstanceRef.current = null;
            }
        };
    }, []);

    // Note: Data fetching is now handled by SWR hooks (useSources, useViews)
    // No need for manual loadData() call

    // Update GridStack when density changes
    useEffect(() => {
        const gs = gsInstanceRef.current;
        if (!gs) return;

        // Get fresh values from CSS after density attribute change
        const newGridGap = getCssLengthInPixels("--qb-grid-gap", 8);
        const newGridRowHeight = getCssLengthInPixels(
            "--qb-grid-row-height",
            56,
        );

        gs.margin(newGridGap);
        gs.cellHeight(newGridRowHeight);
    }, [currentDensity]);

    useEffect(() => {
        coordinatorRef.current = new SourceUpdateCoordinator({
            maxConcurrency: 4,
            pollIntervalMs: 3000,
            fetchSources: () => api.getSources(),
            fetchSourceData: (sourceId) => api.getSourceData(sourceId),
            getSnapshot: () => sourcesSnapshotRef.current,
            updateSnapshot: (updater) => {
                updateSourcesSnapshot(updater);
            },
            onError: (error, context) => {
                console.error(`Source update coordinator failed (${context}):`, error);
            },
        });
        coordinatorRef.current.start();
        return () => {
            coordinatorRef.current?.stop();
            coordinatorRef.current = null;
            if (sourceUpdatesReconnectRef.current !== null) {
                window.clearTimeout(sourceUpdatesReconnectRef.current);
                sourceUpdatesReconnectRef.current = null;
            }
            sourceUpdatesSocketRef.current?.close();
            sourceUpdatesSocketRef.current = null;
        };
    }, []);

    useEffect(() => {
        const activeSourceIds = new Set<string>();
        const otherSourceIds = new Set<string>();
        const activeView = resolvedActiveViewId
            ? viewsById.get(resolvedActiveViewId) ?? null
            : null;
        if (activeView) {
            for (const item of activeView.items) {
                if (item.source_id && !activeSourceIds.has(item.source_id)) {
                    activeSourceIds.add(item.source_id);
                }
            }
        }
        for (const view of orderedViews) {
            if (view.id === activeView?.id) {
                continue;
            }
            for (const item of view.items) {
                const sourceId = item.source_id;
                if (!sourceId || activeSourceIds.has(sourceId) || otherSourceIds.has(sourceId)) {
                    continue;
                }
                otherSourceIds.add(sourceId);
            }
        }
        coordinatorRef.current?.setPriorityContext({
            activeDashboardSourceIds: Array.from(activeSourceIds),
            otherDashboardSourceIds: Array.from(otherSourceIds),
        });
    }, [orderedViews, resolvedActiveViewId, viewsById]);

    useEffect(() => {
        coordinatorRef.current?.submitSources(
            sources.map((source) => source.id),
            "view_change",
        );
    }, [activeItemIdsKey]);

    useEffect(() => {
        let closed = false;
        let reconnectAttempts = 0;

        const scheduleReconnect = () => {
            if (closed || sourceUpdatesReconnectRef.current !== null) {
                return;
            }
            const delayMs = Math.min(5000, 500 * 2 ** reconnectAttempts);
            reconnectAttempts += 1;
            sourceUpdatesReconnectRef.current = window.setTimeout(() => {
                sourceUpdatesReconnectRef.current = null;
                void connectSocket();
            }, delayMs);
        };

        const connectSocket = async () => {
            if (closed) {
                return;
            }
            try {
                const socket = await api.connectSourceUpdates({
                    sinceSeq: sourceUpdatesSeqRef.current || undefined,
                });
                if (closed) {
                    socket.close();
                    return;
                }
                sourceUpdatesSocketRef.current = socket;

                socket.onopen = () => {
                    reconnectAttempts = 0;
                };

                socket.onmessage = (message) => {
                    let payload: SourceUpdateStreamPayload | null = null;
                    try {
                        payload = JSON.parse(message.data) as SourceUpdateStreamPayload;
                    } catch {
                        return;
                    }
                    if (!payload || typeof payload !== "object" || !("event" in payload)) {
                        return;
                    }
                    if (payload.event === "source.stream.ready") {
                        sourceUpdatesSeqRef.current = Math.max(
                            sourceUpdatesSeqRef.current,
                            payload.latest_seq || 0,
                        );
                        if (payload.sync_required) {
                            void coordinatorRef.current?.pollNow({
                                trigger: "websocket",
                                forceAll: false,
                            });
                        }
                        return;
                    }
                    if (payload.event === "source.sync_required") {
                        sourceUpdatesSeqRef.current = Math.max(
                            sourceUpdatesSeqRef.current,
                            payload.latest_seq || 0,
                        );
                        void coordinatorRef.current?.pollNow({
                            trigger: "websocket",
                            forceAll: false,
                        });
                        return;
                    }
                    if (payload.event === "source.updated") {
                        sourceUpdatesSeqRef.current = Math.max(
                            sourceUpdatesSeqRef.current,
                            payload.seq || 0,
                        );
                        coordinatorRef.current?.handleWebSocketEvent(payload);
                    }
                };

                socket.onclose = () => {
                    if (sourceUpdatesSocketRef.current === socket) {
                        sourceUpdatesSocketRef.current = null;
                    }
                    scheduleReconnect();
                };

                socket.onerror = () => {
                    scheduleReconnect();
                };
            } catch (error) {
                console.error("Failed to connect source update websocket:", error);
                scheduleReconnect();
            }
        };

        void connectSocket();

        return () => {
            closed = true;
            if (sourceUpdatesReconnectRef.current !== null) {
                window.clearTimeout(sourceUpdatesReconnectRef.current);
                sourceUpdatesReconnectRef.current = null;
            }
            sourceUpdatesSocketRef.current?.close();
            sourceUpdatesSocketRef.current = null;
        };
    }, []);

    const runGlobalRefresh = useCallback(async () => {
        const currentActiveScraper = useStore.getState().activeScraper;
        if (currentActiveScraper) {
            console.log(`[Scraper] Global refresh: cancelling active task`);
            try {
                await invoke("cancel_scraper_task");
            } catch (e) {
                console.error("Failed to cancel on global refresh:", e);
            }
        }

        updateSourcesSnapshot((snapshot) => ({
            ...snapshot,
            sources: snapshot.sources.map((source) => ({
                ...source,
                status: "refreshing",
            })),
        }));
        setSkippedScrapers(new Set());
        useStore.getState().setActiveScraper(null);

        await api
            .refreshAll()
            .catch((e) => console.error("Refresh all failed:", e));
    }, [setSkippedScrapers]);

    useEffect(() => {
        const onRefresh = async () => {
            await runGlobalRefresh();
        };
        window.addEventListener("app:refresh_data", onRefresh);
        return () => window.removeEventListener("app:refresh_data", onRefresh);
    }, [runGlobalRefresh]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (!document.hidden) {
                void coordinatorRef.current?.pollNow({
                    trigger: "view_change",
                    forceAll: false,
                });
            }
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () =>
            document.removeEventListener("visibilitychange", onVisibilityChange);
    }, []);

    const handleRefreshSource = useCallback(
        async (sourceId: string) => {
            const currentActiveScraper = useStore.getState().activeScraper;
            if (currentActiveScraper === sourceId) {
                console.log(
                    `[Scraper] Refresh: cancelling active task for ${sourceId}`,
                );
                try {
                    await invoke("cancel_scraper_task");
                } catch (e) {
                    console.error("Failed to cancel on source refresh:", e);
                }
                useStore.getState().setActiveScraper(null);
            }

            // Optimistically update status to refreshing for immediate UI feedback
            optimisticUpdateSourceStatus(sourceId, "refreshing");

            const nextSkipped = new Set(useStore.getState().skippedScrapers);
            nextSkipped.delete(sourceId);
            setSkippedScrapers(nextSkipped);

            try {
                await api.refreshSource(sourceId);
                coordinatorRef.current?.submitSources([sourceId], "manual", {
                    force: true,
                    manualBoost: true,
                });
            } catch (error) {
                console.error(`Failed to refresh source ${sourceId}:`, error);
                // Rollback by re-fetching
                void coordinatorRef.current?.pollNow({
                    trigger: "manual",
                    forceAll: false,
                });
            }
        },
        [setSkippedScrapers],
    );

    const handleUpdateSourceRefreshInterval = useCallback(
        async (sourceId: string, intervalMinutes: number | null) => {
            try {
                await api.updateSourceRefreshInterval(
                    sourceId,
                    intervalMinutes,
                );
                await coordinatorRef.current?.pollNow({
                    trigger: "manual",
                    forceAll: false,
                });
            } catch (error) {
                console.error(`Failed to update auto-refresh interval for ${sourceId}:`, error);
            }
        },
        [],
    );

    const handleDeleteSource = async (sourceId: string) => {
        try {
            // Optimistically remove from UI immediately
            optimisticRemoveSource(sourceId);
            setDeletingSourceId(null);
            // Then delete from backend
            await api.deleteSourceFile(sourceId);
            // Refresh views in background
            invalidateViews();
        } catch (error) {
            console.error(`Failed to delete source ${sourceId}:`, error);
            // Rollback by re-fetching data
            invalidateSources();
        }
    };

    const handleRefreshAll = async () => {
        try {
            await runGlobalRefresh();
        } catch (error) {
            console.error("Failed to refresh:", error);
        }
    };

    const openErrorDialog = useCallback((source: SourceSummary) => {
        setErrorSourceId(source.id);
        setShowErrorDetails(false);
    }, []);

    if (isDataLoading) {
        return (
            <TooltipProvider>
                <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
                    <EmptyState
                        icon={
                            <Play className="h-8 w-8 animate-spin text-muted-foreground" />
                        }
                        title={t("dashboard.loading.title")}
                        description={t("dashboard.loading.description")}
                    />
                </div>
            </TooltipProvider>
        );
    }

    const getStatusConfig = (source: SourceSummary) => {
        const sourceData = dataMap[source.id];
        const hasError = hasSourceError(source, sourceData);
        const actionable = hasActionableInteraction(source);
        if ((source.status as string) === "refreshing") {
            return {
                label: t("dashboard.status.refreshing"),
                variant: "info" as const,
                colorClass: "bg-blue-500/10 text-blue-500",
                icon: Play,
            };
        }
        if ((source.status as string) === "suspended") {
            return {
                label: t("dashboard.status.suspended"),
                variant: "warning" as const,
                colorClass: "bg-warning/20 text-warning",
                icon: Wrench,
            };
        }
        if ((source.status as string) === "error" && actionable) {
            return {
                label: t("dashboard.status.needs_fix"),
                variant: "error" as const,
                colorClass: "bg-error/20 text-error",
                icon: Wrench,
            };
        }
        if (hasError) {
            return {
                label: t("dashboard.status.error"),
                variant: "error" as const,
                colorClass: "bg-error/20 text-error",
                icon: AlertTriangle,
            };
        }
        if (source.has_data) {
            return {
                label: t("dashboard.status.normal"),
                variant: "success" as const,
                colorClass: "bg-success/20 text-success",
                icon: Database,
            };
        }
        return {
            label: t("dashboard.status.waiting"),
            variant: "secondary" as const,
            colorClass: "bg-muted/10 text-muted-foreground border-transparent",
            icon: Clock,
        };
    };

    const statusCounts = {
        refreshing: sources.filter((s) => s.status === "refreshing").length,
        suspended: sources.filter((s) => s.status === "suspended").length,
        error: sources.filter(
            (s) =>
                s.status !== "refreshing" &&
                s.status !== "suspended" &&
                hasSourceError(s, dataMap[s.id]),
        ).length,
        normal: sources.filter(
            (s) =>
                s.status !== "refreshing" &&
                s.status !== "suspended" &&
                !hasSourceError(s, dataMap[s.id]) &&
                s.has_data,
        ).length,
        waiting: sources.filter(
            (s) =>
                s.status !== "refreshing" &&
                s.status !== "suspended" &&
                !hasSourceError(s, dataMap[s.id]) &&
                !s.has_data,
        ).length,
    };

    const errorSource = errorSourceId
        ? sources.find((source) => source.id === errorSourceId) || null
        : null;
    const errorSourceData = errorSource ? dataMap[errorSource.id] : null;
    const errorSummary = errorSource
        ? getSourceErrorSummary(
              errorSource,
              getErrorMessageByCode,
              errorSourceData,
          )
        : "";
    const errorDetails = errorSource
        ? getSourceErrorDetails(errorSource, errorSourceData)
        : "";
    const canShowDetails = !!errorDetails && errorDetails !== errorSummary;

    return (
        <TooltipProvider>
            <div className="h-full bg-transparent text-foreground flex overflow-hidden">
                <aside
                    className={`border-r border-border bg-surface/30 flex-col hidden md:flex transition-all duration-300 ${sidebarCollapsed ? "w-14" : "w-64"}`}
                >
                    <div className="p-3 border-b border-border flex items-center justify-center gap-2">
                        {!sidebarCollapsed && (
                            <>
                                <Database className="w-4 h-4 text-muted-foreground" />
                                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex-1 whitespace-nowrap">
                                    {t("dashboard.sidebar.title")}
                                </h2>
                            </>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={toggleSidebar}
                                    className="h-8 w-8 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150 -my-1"
                                >
                                    {sidebarCollapsed ? (
                                        <ChevronRight className="h-4 w-4" />
                                    ) : (
                                        <ChevronLeft className="h-4 w-4" />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                {sidebarCollapsed
                                    ? t("common.expand")
                                    : t("common.collapse")}
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    {!sidebarCollapsed && (
                        <div className="p-3 border-b border-border/40 flex items-center gap-2 bg-surface/50">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            navigate("/integrations")
                                        }
                                        className="flex-1 h-8 bg-transparent border-border/50 text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-all duration-200"
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                                        {t("dashboard.button.create")}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="bottom"
                                    className="text-xs"
                                >
                                    {t("dashboard.tooltip.add_source")}
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRefreshAll}
                                        className="flex-1 h-8 bg-transparent border-border/50 text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-all duration-200"
                                    >
                                        <Play className="h-3.5 w-3.5 mr-1.5" />
                                        {t("dashboard.button.run")}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="bottom"
                                    className="text-xs"
                                >
                                    {t("dashboard.tooltip.refresh_all")}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}

                    {sidebarCollapsed ? (
                        <div className="flex-1 flex flex-col items-center gap-3 p-2 overflow-y-auto">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleRefreshAll}
                                        className="h-8 w-8 text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150 mb-1"
                                    >
                                        <Play className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="right"
                                    className="text-xs"
                                >
                                    {t("dashboard.tooltip.run_sources")}
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex flex-col items-center gap-1 p-2 rounded bg-success/20 text-success w-full">
                                        <Database className="h-4 w-4" />
                                        <span className="text-xs font-bold">
                                            {statusCounts.normal}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                    {t("dashboard.label.normal_count", {
                                        count: statusCounts.normal,
                                    })}
                                </TooltipContent>
                            </Tooltip>
                            {statusCounts.refreshing > 0 && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex flex-col items-center gap-1 p-2 rounded bg-blue-500/10 text-blue-500 w-full">
                                            <Play className="h-4 w-4" />
                                            <span className="text-xs font-bold">
                                                {statusCounts.refreshing}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        {t("dashboard.label.refreshing_count", {
                                            count: statusCounts.refreshing,
                                        })}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {statusCounts.error > 0 && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex flex-col items-center gap-1 p-2 rounded bg-error/20 text-error w-full">
                                            <AlertTriangle className="h-4 w-4" />
                                            <span className="text-xs font-bold">
                                                {statusCounts.error}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        {t("dashboard.label.error_count", {
                                            count: statusCounts.error,
                                        })}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {statusCounts.suspended > 0 && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex flex-col items-center gap-1 p-2 rounded bg-warning/20 text-warning w-full">
                                            <Wrench className="h-4 w-4" />
                                            <span className="text-xs font-bold">
                                                {statusCounts.suspended}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        {t("dashboard.label.suspended_count", {
                                            count: statusCounts.suspended,
                                        })}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {statusCounts.waiting > 0 && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex flex-col items-center gap-1 p-2 rounded bg-muted/10 text-muted-foreground w-full">
                                            <Clock className="h-4 w-4" />
                                            <span className="text-xs font-bold">
                                                {statusCounts.waiting}
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        {t("dashboard.label.waiting_count", {
                                            count: statusCounts.waiting,
                                        })}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5 p-2 overflow-y-auto flex-1">
                                {sources.map((source) => {
                                    const sourceData = dataMap[source.id];
                                    const hasError = hasSourceError(
                                        source,
                                        sourceData,
                                    );
                                    const actionableInteraction =
                                        hasActionableInteraction(source);
                                    const errorSummary = getSourceErrorSummary(
                                        source,
                                        getErrorMessageByCode,
                                        sourceData,
                                    );
                                    const statusConfig =
                                        getStatusConfig(source);
                                    const currentSourceInterval =
                                        typeof source.refresh_interval_minutes ===
                                        "number"
                                            ? source.refresh_interval_minutes
                                            : null;
                                    const inheritedInterval =
                                        typeof source.integration_refresh_interval_minutes ===
                                        "number"
                                            ? source.integration_refresh_interval_minutes
                                            : source.global_refresh_interval_minutes;
                                    const inheritedSourceLabel =
                                        typeof source.integration_refresh_interval_minutes ===
                                        "number"
                                            ? "integration"
                                            : "global";
                                    const last_success_at = source.last_success_at;
                                    const freshnessStyle = getFreshnessStyles(
                                        last_success_at,
                                        nowSeconds,
                                    );

                                    return (
                                        <Card
                                            key={source.id}
                                            className="relative bg-surface border-border/50 transition-shadow duration-150 hover:shadow-soft-elevation group"
                                        >
                                            <CardContent className="p-3">
                                                {last_success_at && (
                                                    <div
                                                        className={cn(
                                                            "absolute -top-px -left-px px-1.5 py-0.5 rounded-tl-xl rounded-br-xl text-[9px] font-medium leading-none tabular-nums",
                                                            freshnessStyle,
                                                        )}
                                                    >
                                                        {getFreshnessText(
                                                            last_success_at,
                                                            nowSeconds,
                                                            t,
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                        <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                                            <Tooltip>
                                                                <TooltipTrigger
                                                                    asChild
                                                                >
                                                                    <span className="font-medium text-sm truncate">
                                                                        {
                                                                            source.name
                                                                        }
                                                                    </span>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top">
                                                                    {
                                                                        source.name
                                                                    }
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {actionableInteraction ? (
                                                            <Tooltip>
                                                                <TooltipTrigger
                                                                    asChild
                                                                >
                                                                    <button
                                                                        className={cn(
                                                                            badgeVariants(
                                                                                {
                                                                                    variant:
                                                                                        source.status ===
                                                                                        "error"
                                                                                            ? "error"
                                                                                            : "warning",
                                                                                },
                                                                            ),
                                                                            source.status ===
                                                                                "error"
                                                                                ? "gap-1 px-1.5 py-0 h-6 shrink-0 cursor-pointer hover:bg-error/30"
                                                                                : "gap-1 px-1.5 py-0 h-6 shrink-0 cursor-pointer hover:bg-warning/30",
                                                                        )}
                                                                        onClick={() =>
                                                                            setInteractSource(
                                                                                source,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Wrench className="h-3 w-3" />
                                                                        <span>
                                                                            {source.status ===
                                                                            "error"
                                                                                ? t(
                                                                                      "dashboard.status.needs_fix",
                                                                                  )
                                                                                : t(
                                                                                      "dashboard.status.suspended",
                                                                                  )}
                                                                        </span>
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top">
                                                                    <p>
                                                                        {source.status ===
                                                                        "error"
                                                                            ? t(
                                                                                  "dashboard.tooltip.fix_invalid_credentials",
                                                                              )
                                                                            : source
                                                                                    .interaction
                                                                                    ?.type ===
                                                                                "webview_scrape"
                                                                              ? t(
                                                                                    "dashboard.tooltip.manual_foreground",
                                                                                )
                                                                              : t(
                                                                                    "dashboard.tooltip.resolve_issue",
                                                                                )}
                                                                    </p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        ) : hasError ? (
                                                            <button
                                                                type="button"
                                                                className={cn(
                                                                    badgeVariants(
                                                                        {
                                                                            variant:
                                                                                "error",
                                                                        },
                                                                    ),
                                                                    "gap-1 px-1.5 py-0 h-6 shrink-0 cursor-pointer hover:bg-error/30",
                                                                )}
                                                                onClick={() =>
                                                                    openErrorDialog(
                                                                        source,
                                                                    )
                                                                }
                                                                title={
                                                                    errorSummary
                                                                }
                                                            >
                                                                <AlertTriangle className="h-3 w-3" />
                                                                <span>
                                                                    {t("dashboard.action.error")}
                                                                </span>
                                                            </button>
                                                        ) : (
                                                            <Badge
                                                                variant={
                                                                    statusConfig.variant
                                                                }
                                                                className={
                                                                    statusConfig.colorClass
                                                                }
                                                            >
                                                                {
                                                                    statusConfig.label
                                                                }
                                                            </Badge>
                                                        )}
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger
                                                                asChild
                                                            >
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                                                >
                                                                    <MoreVertical className="h-3 w-3" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        handleRefreshSource(
                                                                            source.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <Play className="mr-2 h-4 w-4" />
                                                                    <span>
                                                                        {t("dashboard.action.refresh")}
                                                                    </span>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSub>
                                                                    <DropdownMenuSubTrigger>
                                                                        <Clock className="mr-2 h-4 w-4" />
                                                                        <span>
                                                                            {t("dashboard.action.auto_refresh")}
                                                                        </span>
                                                                    </DropdownMenuSubTrigger>
                                                                    <DropdownMenuSubContent>
                                                                        <DropdownMenuLabel>
                                                                            {t("dashboard.action.source_interval")}
                                                                        </DropdownMenuLabel>
                                                                        <DropdownMenuRadioGroup
                                                                            value={
                                                                                currentSourceInterval ===
                                                                                null
                                                                                    ? "inherit"
                                                                                    : String(
                                                                                          currentSourceInterval,
                                                                                      )
                                                                            }
                                                                            onValueChange={(
                                                                                value,
                                                                            ) => {
                                                                                const interval =
                                                                                    value ===
                                                                                    "inherit"
                                                                                        ? null
                                                                                        : Number(
                                                                                              value,
                                                                                          );
                                                                                void handleUpdateSourceRefreshInterval(
                                                                                    source.id,
                                                                                    interval,
                                                                                );
                                                                            }}
                                                                        >
                                                                            <DropdownMenuRadioItem value="inherit">
                                                                                {t("common.inherit")}
                                                                                (
                                                                                {formatRefreshInterval(
                                                                                    inheritedInterval,
                                                                                    t,
                                                                                )}{" "}
                                                                                ·{" "}
                                                                                {
                                                                                    t(
                                                                                        `common.${inheritedSourceLabel}`,
                                                                                    )
                                                                                }

                                                                                )
                                                                            </DropdownMenuRadioItem>
                                                                            {refreshIntervalOptions.map(
                                                                                (
                                                                                    option,
                                                                                ) => (
                                                                                    <DropdownMenuRadioItem
                                                                                        key={
                                                                                            option.value
                                                                                        }
                                                                                        value={String(
                                                                                            option.value,
                                                                                        )}
                                                                                    >
                                                                                        {
                                                                                            option.label
                                                                                        }
                                                                                    </DropdownMenuRadioItem>
                                                                                ),
                                                                            )}
                                                                        </DropdownMenuRadioGroup>
                                                                    </DropdownMenuSubContent>
                                                                </DropdownMenuSub>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    className="text-destructive"
                                                                    onClick={() =>
                                                                        setDeletingSourceId(
                                                                            source.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    <span>
                                                                        {t("dashboard.action.delete")}
                                                                    </span>
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>

                            <Dialog
                                open={deletingSourceId !== null}
                                onOpenChange={(open) =>
                                    !open && setDeletingSourceId(null)
                                }
                            >
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>
                                            {t("dashboard.delete_dialog.title")}
                                        </DialogTitle>
                                        <DialogDescription>
                                            {t("dashboard.delete_dialog.description")}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                setDeletingSourceId(null)
                                            }
                                        >
                                            {t("common.cancel")}
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            onClick={() =>
                                                deletingSourceId &&
                                                handleDeleteSource(
                                                    deletingSourceId,
                                                )
                                            }
                                        >
                                            {t("common.confirmDelete")}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </>
                    )}
                </aside>

                <main
                    className={cn(
                        "flex-1 p-3",
                        viewMode === "management"
                            ? "overflow-y-auto"
                            : "flex min-h-0 flex-col overflow-hidden",
                    )}
                >
                    {/* Mode switcher: Management vs Single View */}
                    {viewMode === "management" ? (
                        /* Management Mode UI */
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="flex items-center justify-between gap-3">
                                <h1 className="text-2xl font-bold">
                                    {t("dashboard.management.title")}
                                </h1>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleReturnToSingleDashboard}
                                    >
                                        {t("dashboard.management.back_to_single")}
                                    </Button>
                                    <Button
                                        onClick={() => setIsCreateDialogOpen(true)}
                                        size="sm"
                                    >
                                        {t("dashboard.management.create_button")}
                                    </Button>
                                </div>
                            </div>

                            {/* Empty state */}
                            {orderedViews.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <Database className="w-12 h-12 text-muted-foreground mb-4" />
                                    <h2 className="text-lg font-semibold mb-2">
                                        {t("dashboard.management.empty_title")}
                                    </h2>
                                    <p className="text-muted-foreground mb-6">
                                        {t("dashboard.management.empty_description")}
                                    </p>
                                    <Button
                                        onClick={() => setIsCreateDialogOpen(true)}
                                        size="sm"
                                    >
                                        {t("dashboard.management.create_button")}
                                    </Button>
                                </div>
                            ) : (
                                /* Dashboard Grid with drag-drop */
                                <DashboardGrid
                                    views={orderedViews}
                                    activeViewId={activeViewId}
                                    onReorder={handleReorderDashboards}
                                    onEdit={handleEditDashboard}
                                    onDelete={(view) => {
                                        setDeletingView(view);
                                        setIsDeleteDialogOpen(true);
                                    }}
                                    onSelect={handleSelectDashboard}
                                />
                            )}
                        </div>
                    ) : (
                        /* Single View Mode UI */
                        <>
                            <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
                                <h1
                                    className="min-w-0 truncate text-2xl font-bold text-foreground"
                                    title={viewConfig?.name ?? undefined}
                                >
                                    {viewConfig?.name ?? t("dashboard.management.empty_title")}
                                </h1>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleEnterManagementMode}
                                    >
                                        {t("dashboard.management.all_dashboards")}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => setIsAddDialogOpen(true)}
                                    >
                                        {t("dashboard.action.add_widget")}
                                    </Button>
                                </div>
                            </div>

                            {/* Dashboard content with swiper for horizontal navigation */}
                            <DashboardSwiper
                                className="min-h-0 flex-1"
                                views={orderedViews}
                                activeViewId={resolvedActiveViewId}
                                onViewChange={(viewId) => {
                                    setActiveViewId(viewId);
                                    setSelectedDashboardId(viewId);
                                }}
                            >
                                {(view) => {
                                    const thisViewConfig = viewsById.get(view.id);
                                    const isActiveView = view.id === resolvedActiveViewId;
                                    if (!thisViewConfig || thisViewConfig.items.length === 0) {
                                        return (
                                            <div className="flex min-h-0 h-full flex-col">
                                                <EmptyState
                                                    icon={
                                                        <Database className="h-8 w-8 text-muted-foreground" />
                                                    }
                                                    title={t("dashboard.empty.title")}
                                                    description={t("dashboard.empty.description")}
                                                    actionLabel={t("dashboard.empty.action")}
                                                    onAction={() => setIsAddDialogOpen(true)}
                                                    className="m-0 flex-1 rounded-xl border border-dashed bg-surface/30"
                                                />
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="min-h-0 h-full overflow-y-auto pr-1">
                                            <div
                                                key={`grid-${view.id}`}
                                                ref={
                                                    isActiveView
                                                        ? setActiveGridRef
                                                        : undefined
                                                }
                                                className={cn(
                                                    "grid-stack qb-grid-cancel-outer-gap",
                                                    `grid-stack-${thisViewConfig.layout_columns || 12}`,
                                                )}
                                            >
                                                {thisViewConfig.items.map((item) => {
                                                    const safeLayout = sanitizeGridNodeLayout(
                                                        {
                                                            id: item.id,
                                                            x: item.x,
                                                            y: item.y,
                                                            w: item.w,
                                                            h: item.h,
                                                        },
                                                        thisViewConfig.layout_columns || 12,
                                                    );
                                                    const sourceData = item.source_id
                                                        ? dataMap[item.source_id]
                                                        : null;
                                                    const sourceSummary = item.source_id
                                                        ? sources.find(
                                                              (s) => s.id === item.source_id,
                                                          )
                                                        : undefined;
                                                    const safeProps = toSafeViewProps(
                                                        item.id,
                                                        item.props,
                                                    );
                                                    const normalizedType = normalizeTemplateType(
                                                        item.id,
                                                        safeProps.type ?? item.template_id,
                                                    );
                                                    const normalizedLabel =
                                                        typeof safeProps.label === "string"
                                                            ? safeProps.label
                                                            : safeProps.ui?.title ||
                                                              item.template_id;
                                                    const resetKey = [
                                                        item.id,
                                                        item.source_id || "",
                                                        normalizedType,
                                                        normalizedLabel,
                                                        Array.isArray(safeProps.widgets)
                                                            ? safeProps.widgets.length
                                                            : 0,
                                                    ].join(":");

                                                    const comp: ViewComponent = {
                                                        ...safeProps,
                                                        id: item.template_id,
                                                        type: normalizedType,
                                                        label: normalizedLabel,
                                                    };

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className="grid-stack-item"
                                                            gs-id={item.id}
                                                            gs-x={String(safeLayout.x)}
                                                            gs-y={String(safeLayout.y)}
                                                            gs-w={String(safeLayout.w)}
                                                            gs-h={String(safeLayout.h)}
                                                        >
                                                            <div className="grid-stack-item-content relative overflow-hidden group/card">
                                                                <DeleteBtn
                                                                    onDelete={() =>
                                                                        handleDeleteWidget(item.id)
                                                                    }
                                                                />
                                                                <div className="sdui-card-shell h-full w-full min-h-0 flex flex-col">
                                                                    <WidgetFallbackBoundary
                                                                        itemId={item.id}
                                                                        resetKey={resetKey}
                                                                    >
                                                                        {renderComponent(
                                                                            comp,
                                                                            sourceData,
                                                                            sourceSummary,
                                                                            setInteractSource,
                                                                            openErrorDialog,
                                                                        )}
                                                                    </WidgetFallbackBoundary>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }}
                            </DashboardSwiper>
                        </>
                    )}
                </main>

                <ScraperStatusBanner
                    activeScraperName={
                        sources.find((s) => s.id === activeScraper)?.name ||
                        null
                    }
                    queueLength={queueLength}
                    scraperLogs={scraperLogs}
                    onShowWindow={handleShowScraperWindow}
                    onSkip={handleSkipScraper}
                    onClearQueue={handleClearScraperQueue}
                />
            </div>

            <Dialog
                open={errorSourceId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setErrorSourceId(null);
                        setShowErrorDetails(false);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-error" />
                            {t("dashboard.error_dialog.title")}
                        </DialogTitle>
                        <DialogDescription>
                            {errorSource
                                ? t(
                                      "dashboard.error_dialog.description_with_name",
                                      { name: errorSource.name },
                                  )
                                : t("dashboard.error_dialog.description_default")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="rounded border border-error/20 bg-error/5 p-3 text-sm text-error whitespace-pre-wrap break-all w-full">
                            {errorSummary}
                        </div>
                        {canShowDetails && (
                            <button
                                type="button"
                                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() =>
                                    setShowErrorDetails((prev) => !prev)
                                }
                            >
                                {showErrorDetails
                                    ? t("dashboard.error_dialog.hide_details")
                                    : t("dashboard.error_dialog.show_details")}
                            </button>
                        )}
                        {showErrorDetails && canShowDetails && (
                            <pre className="max-h-72 overflow-auto rounded border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-all w-full">
                                {errorDetails}
                            </pre>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setErrorSourceId(null);
                                setShowErrorDetails(false);
                            }}
                        >
                            {t("dashboard.action.close")}
                        </Button>
                        {errorSource && (
                            <Button
                                onClick={() => {
                                    setErrorSourceId(null);
                                    setShowErrorDetails(false);
                                    void handleRefreshSource(errorSource.id);
                                }}
                            >
                                {t("dashboard.action.retry")}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AddWidgetDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                onAddWidget={handleAddWidget}
            />

            <FlowHandler
                source={activeInteractionSource}
                isOpen={!!activeInteractionSource}
                onClose={() => setInteractSource(null)}
                onInteractSuccess={() => {
                    void coordinatorRef.current?.pollNow({
                        trigger: "manual",
                        forceAll: false,
                    });
                }}
                onPushToQueue={handlePushToQueue}
            />

            {/* Dashboard Management Dialogs */}

            {/* Create Dashboard Dialog */}
            <CreateDashboardDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onCreate={handleCreateDashboard}
                existingNames={swrViews.map((v: StoredView) => v.name)}
            />

            {/* Delete Confirmation Dialog */}
            <DeleteConfirmDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    setIsDeleteDialogOpen(open);
                    if (!open) setDeletingView(null);
                }}
                view={deletingView}
                onConfirm={handleDeleteDashboard}
                isDeleting={isDeleting}
            />

            {/* Rename Dialog */}
            <RenameDialog
                open={isRenameDialogOpen}
                onOpenChange={(open) => {
                    setIsRenameDialogOpen(open);
                    if (!open) setRenamingView(null);
                }}
                view={renamingView}
                onRename={handleRenameDashboard}
                existingNames={swrViews
                    .filter((v: StoredView) => v.id !== renamingView?.id)
                    .map((v: StoredView) => v.name)
                }
                isRenaming={isRenaming}
            />
        </TooltipProvider>
    );
}
