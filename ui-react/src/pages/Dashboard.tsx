import {
    Component,
    type ReactNode,
    useEffect,
    useRef,
    useCallback,
    useState,
} from "react";
import { GridStack } from "gridstack";
import { useNavigate } from "react-router-dom";
import "gridstack/dist/gridstack.min.css";
import { api } from "../api/client";
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
import { useStore } from "../store";
import { useI18n } from "../i18n";
import { useSidebar } from "../hooks/useSidebar";
import { useScraper } from "../hooks/useScraper";
import {
    mergeViewItemsWithGridNodes,
    sanitizeGridNodeLayout,
} from "./dashboardLayout";
import { parseCssLengthToPixels } from "./gridSizing";
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

export default function Dashboard() {
    const navigate = useNavigate();
    const { t, getErrorMessageByCode } = useI18n();
    const {
        viewConfig: storeViewConfig,
        setViewConfig,
        sources: storeSources,
        setSources,
        dataMap: storeDataMap,
        setDataMap: setStoreDataMap,
        interactSource,
        setInteractSource,
        isAddDialogOpen,
        setIsAddDialogOpen,
        deletingSourceId,
        setDeletingSourceId,
        setSkippedScrapers,
    } = useStore();
    const refreshIntervalOptions: Array<{ value: number; label: string }> = [
        { value: 0, label: t("settings.refresh.option.off") },
        { value: 5, label: t("settings.refresh.option.5m") },
        { value: 30, label: t("settings.refresh.option.30m") },
        { value: 60, label: t("settings.refresh.option.1h") },
        { value: 1440, label: t("settings.refresh.option.1d") },
    ];

    // Use SWR for data fetching - handles dedup, caching, and StrictMode automatically
    const {
        sources: swrSources,
        dataMap: swrDataMap,
        isLoading: swrLoading,
    } = useSources();
    const { views: swrViews } = useViews();

    // Use SWR data, fallback to store data during initial load
    const sources: SourceSummary[] =
        swrSources.length > 0 ? swrSources : storeSources;
    const dataMap =
        Object.keys(swrDataMap).length > 0 ? swrDataMap : storeDataMap;
    const viewConfig: StoredView | null =
        swrViews.length > 0 ? swrViews[0] : storeViewConfig;
    const isDataLoading = swrLoading && storeSources.length === 0;

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
        if (swrLoading) {
            return;
        }
        setSources(swrSources);
        setStoreDataMap(swrDataMap);
    }, [setSources, setStoreDataMap, swrDataMap, swrLoading, swrSources]);

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

    // GridStack ref
    const gridRef = useRef<HTMLDivElement>(null);
    const gsInstanceRef = useRef<GridStack | null>(null);
    const suppressGridChangeRef = useRef(false);
    const [nowSeconds, setNowSeconds] = useState<number>(() =>
        Math.floor(Date.now() / 1000),
    );

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNowSeconds(Math.floor(Date.now() / 1000));
        }, 60000);
        return () => window.clearInterval(timer);
    }, []);

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
                layout_columns: 12,
                items: [],
            };
            isNewView = true;
        }

        const newItemId = `widget-${Date.now()}`;
        const newItem = {
            id: newItemId,
            x: 0,
            y: 999,
            w: 3,
            h: 4,
            source_id: sourceId,
            template_id: template.id,
            props: {},
        };

        const updatedView = {
            ...currentView,
            items: [...currentView.items, newItem],
        };

        try {
            setViewConfig(updatedView);
            if (isNewView) {
                await api.createView(updatedView);
            } else {
                await api.updateView(updatedView.id, updatedView);
            }
            // Refresh data via SWR
            invalidateSources();
            invalidateViews();
        } catch (error) {
            console.error("Failed to add widget:", error);
            setViewConfig(viewConfig);
        }
    };

    const handleDeleteWidget = async (itemId: string) => {
        if (!viewConfig) return;
        const newItems = viewConfig.items.filter((it) => it.id !== itemId);
        const updatedView = { ...viewConfig, items: newItems };

        viewConfigRef.current = updatedView;
        setViewConfig(updatedView);

        const gs = gsInstanceRef.current;
        if (gs) {
            suppressGridChangeRef.current = true;
            const el = gridRef.current?.querySelector(`[gs-id="${itemId}"]`);
            if (el) gs.removeWidget(el as HTMLElement, false);
            requestAnimationFrame(() => {
                suppressGridChangeRef.current = false;
            });
        }

        api.updateView(updatedView.id, updatedView)
            .then(() => invalidateViews())
            .catch((e) => console.error(e));
    };

    const viewConfigRef = useRef(viewConfig);
    useEffect(() => {
        viewConfigRef.current = viewConfig;
    }, [viewConfig]);

    const handleGridChange = useCallback(() => {
        if (suppressGridChangeRef.current) return;

        const gs = gsInstanceRef.current;
        const currentViewConfig = viewConfigRef.current;
        if (!gs || !currentViewConfig) return;

        // CRITICAL: Only save if we are in the intended column layout.
        // GridStack might switch to 1-column mode if the container is too narrow.
        const expectedColumns = currentViewConfig.layout_columns || 12;
        if (gs.getColumn() !== expectedColumns) {
            console.warn(
                `[GridStack] Column mismatch: expected ${expectedColumns}, got ${gs.getColumn()}. Skipping save to prevent layout corruption.`,
            );
            return;
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
            .filter((n) => n.id !== "");

        const updatedItems = mergeViewItemsWithGridNodes(
            currentViewConfig.items,
            nodes,
            expectedColumns,
        );

        const updatedView = { ...currentViewConfig, items: updatedItems };
        setViewConfig(updatedView);
        api.updateView(updatedView.id, updatedView)
            .then(() => invalidateViews())
            .catch((e) => console.error(e));
    }, [setViewConfig, invalidateViews]);

    useEffect(() => {
        const gs = gsInstanceRef.current;
        const hasRenderableGrid =
            !!gridRef.current && !!viewConfig && viewConfig.items.length > 0;
        if (!hasRenderableGrid) {
            if (gs) {
                gs.destroy(false);
                gsInstanceRef.current = null;
            }
            return;
        }

        if (gs && gridRef.current && gs.el !== gridRef.current) {
            gs.destroy(false);
            gsInstanceRef.current = null;
        }

        if (!gsInstanceRef.current) {
            // Suppress change events during initial setup to avoid zeroing out coordinates
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
                gridRef.current,
            );
            gsInstanceRef.current = instance;
            instance.on("change", handleGridChange);

            // Allow the layout to settle before enabling save
            setTimeout(() => {
                suppressGridChangeRef.current = false;
            }, 300);
        } else {
            // React re-renders (like data loading or new item addition) can strip
            // GridStack classes and lose grid styles. Re-initialize items.
            suppressGridChangeRef.current = true;
            setTimeout(() => {
                if (gridRef.current && gsInstanceRef.current) {
                    const elements =
                        gridRef.current.querySelectorAll(".grid-stack-item");
                    elements.forEach((el) => {
                        gsInstanceRef.current!.makeWidget(el as HTMLElement);
                    });
                }
                requestAnimationFrame(() => {
                    suppressGridChangeRef.current = false;
                });
            }, 0);
        }
    }, [viewConfig?.items, dataMap, handleGridChange]);

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

    // Poll for status updates continuously when page is visible
    useEffect(() => {
        const interval = setInterval(async () => {
            // Skip API calls when page is hidden to save resources
            if (document.hidden) return;

            try {
                const updatedSources = await api.getSources();

                // Optimization: fetch details only for sources with changed updated_at
                const needsUpdate = (source: SourceSummary): boolean => {
                    const cachedData = dataMap[source.id];
                    if (!cachedData) return true;
                    if (!source.updated_at) return true;
                    if (!cachedData.updated_at) return true;
                    return source.updated_at > cachedData.updated_at;
                };

                const sourcesToFetch = updatedSources.filter(needsUpdate);
                const sourcesNeedingNoFetch = updatedSources.filter(
                    (s) => !needsUpdate(s),
                );

                // Fetch details only for sources that need updates
                const dataPromises = sourcesToFetch.map((s) =>
                    api
                        .getSourceData(s.id)
                        .then((data) => ({ id: s.id, data })),
                );
                const results = await Promise.all(dataPromises);

                const newDataMap: Record<string, DataResponse> = {};

                // Add sources that were freshly fetched
                results.forEach(({ id, data }) => {
                    newDataMap[id] = data;
                });

                // Use cached data for sources that do not need updates
                sourcesNeedingNoFetch.forEach((s) => {
                    if (dataMap[s.id]) {
                        newDataMap[s.id] = dataMap[s.id];
                    }
                });

                // Update SWR cache
                mutate(
                    "sources-with-data",
                    {
                        sources: updatedSources,
                        dataMap: newDataMap,
                    },
                    false,
                );
            } catch (error) {
                console.error("Dashboard polling failed:", error);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [sources, dataMap]);

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

        setSources(sources.map((s) => ({ ...s, status: "refreshing" })));
        setSkippedScrapers(new Set());
        useStore.getState().setActiveScraper(null);

        await api
            .refreshAll()
            .catch((e) => console.error("Refresh all failed:", e));
    }, [setSkippedScrapers, setSources, sources]);

    useEffect(() => {
        const onRefresh = async () => {
            await runGlobalRefresh();
        };
        window.addEventListener("app:refresh_data", onRefresh);
        return () => window.removeEventListener("app:refresh_data", onRefresh);
    }, [runGlobalRefresh]);

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
            } catch (error) {
                console.error(`Failed to refresh source ${sourceId}:`, error);
                // Rollback by re-fetching
                invalidateSources();
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
                await invalidateSources();
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

                <main className="flex-1 p-4 overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">
                            {t("dashboard.view.title")}
                        </h2>
                        <div className="flex gap-2">
                            {/* TODO: Re-enable density toggle after fixing spacing issues
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className="h-8 px-3 flex items-center gap-1.5 text-sm font-medium rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150"
                                        onClick={cycleDensity}
                                    >
                                        <LayoutGrid className="w-4 h-4" />
                                        {densityLabels[settings?.density || "normal"]}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    Click to toggle density: Compact → Normal → Comfortable
                                </TooltipContent>
                            </Tooltip>
                            */}
                            <button
                                className="h-8 px-3 flex items-center gap-1.5 text-sm font-medium rounded-md bg-brand-gradient text-white hover:opacity-90 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 shadow-sm"
                                onClick={() => setIsAddDialogOpen(true)}
                            >
                                <Plus className="w-4 h-4" />
                                {t("dashboard.action.add_widget")}
                            </button>
                        </div>
                    </div>

                    {!viewConfig || viewConfig.items.length === 0 ? (
                        <EmptyState
                            icon={
                                <Database className="h-8 w-8 text-muted-foreground" />
                            }
                            title={t("dashboard.empty.title")}
                            description={t("dashboard.empty.description")}
                            actionLabel={t("dashboard.empty.action")}
                            onAction={() => setIsAddDialogOpen(true)}
                            className="border border-dashed rounded-lg bg-surface/30 mx-4 mb-4"
                        />
                    ) : (
                        <div
                            ref={gridRef}
                            className={`grid-stack grid-stack-${viewConfig.layout_columns || 12}`}
                        >
                            {viewConfig.items.map((item) => {
                                const safeLayout = sanitizeGridNodeLayout(
                                    {
                                        id: item.id,
                                        x: item.x,
                                        y: item.y,
                                        w: item.w,
                                        h: item.h,
                                    },
                                    viewConfig.layout_columns || 12,
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
                                            <div className="w-full h-full flex flex-col [&>*]:flex-1 [&>*]:min-h-0">
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
                source={interactSource}
                isOpen={!!interactSource}
                onClose={() => setInteractSource(null)}
                onInteractSuccess={() => {
                    invalidateSources();
                }}
                onPushToQueue={handlePushToQueue}
            />
        </TooltipProvider>
    );
}
