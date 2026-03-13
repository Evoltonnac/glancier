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
import {
    Card,
    CardContent,
} from "../components/ui/card";
import { Badge, badgeVariants } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { useSources, useViews, invalidateSources, invalidateViews, optimisticRemoveSource, optimisticUpdateSourceStatus, mutate } from "../hooks/useSWR";

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
import { useSidebar } from "../hooks/useSidebar";
import { useScraper } from "../hooks/useScraper";
import { mergeViewItemsWithGridNodes } from "./dashboardLayout";
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

// GridStack layout constants
const GRID_ROW_HEIGHT = 60;
const GRID_MARGIN = 12;
const warnedCompatibilityKeys = new Set<string>();

function warnDashboardCompatibilityOnce(key: string, message: string): void {
    if (warnedCompatibilityKeys.has(key)) {
        return;
    }
    warnedCompatibilityKeys.add(key);
    console.warn(message);
}

function toSafeViewProps(itemId: string, rawProps: unknown): Record<string, any> {
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

function normalizeTemplateType(itemId: string, rawType: unknown): ViewComponent["type"] {
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
        if (
            this.state.hasError &&
            prevProps.resetKey !== this.props.resetKey
        ) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    组件暂不可用（已静默降级）
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
            title="删除"
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
    sourceData?: DataResponse | null,
): string {
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

export default function Dashboard() {
    const navigate = useNavigate();
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

    // Use SWR for data fetching - handles dedup, caching, and StrictMode automatically
    const { sources: swrSources, dataMap: swrDataMap, isLoading: swrLoading } = useSources();
    const { views: swrViews } = useViews();

    // Use SWR data, fallback to store data during initial load
    const sources: SourceSummary[] = swrSources.length > 0 ? swrSources : storeSources;
    const dataMap = Object.keys(swrDataMap).length > 0 ? swrDataMap : storeDataMap;
    const viewConfig: StoredView | null = swrViews.length > 0 ? swrViews[0] : storeViewConfig;
    const isDataLoading = swrLoading && storeSources.length === 0;

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
        webviewQueue,
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

    const handleAddWidget = async (
        sourceId: string,
        template: ViewComponent,
    ) => {
        let currentView = viewConfig;
        let isNewView = false;

        if (!currentView) {
            currentView = {
                id: `view-${Date.now()}`,
                name: "默认监控面板",
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
            .catch((e) =>
                console.error(e),
            );
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
            .map((el) => ({
                id: el.getAttribute("gs-id") || "",
                x: parseInt(el.getAttribute("gs-x") || "0"),
                y: parseInt(el.getAttribute("gs-y") || "0"),
                w: parseInt(el.getAttribute("gs-w") || "3"),
                h: parseInt(el.getAttribute("gs-h") || "4"),
            }))
            .filter((n) => n.id !== "");

        const updatedItems = mergeViewItemsWithGridNodes(
            currentViewConfig.items,
            nodes,
        );

        const updatedView = { ...currentViewConfig, items: updatedItems };
        setViewConfig(updatedView);
        api.updateView(updatedView.id, updatedView)
            .then(() => invalidateViews())
            .catch((e) =>
                console.error(e),
            );
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

        if (
            gs &&
            gridRef.current &&
            gs.el !== gridRef.current
        ) {
            gs.destroy(false);
            gsInstanceRef.current = null;
        }

        if (!gsInstanceRef.current) {
            // Suppress change events during initial setup to avoid zeroing out coordinates
            suppressGridChangeRef.current = true;

            const instance = GridStack.init(
                {
                    column: viewConfig.layout_columns || 12,
                    cellHeight: GRID_ROW_HEIGHT,
                    margin: GRID_MARGIN,
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

    // Poll for status updates if any source is in a transient state
    useEffect(() => {
        const hasTransient = sources.some((s) => {
            const isRefreshing = s.status === "refreshing";
            const hasError = hasSourceError(s, dataMap[s.id]);
            const isWaiting =
                !s.has_data && s.status !== "suspended" && !hasError;
            return isRefreshing || isWaiting;
        });

        if (!hasTransient) return;

        const interval = setInterval(async () => {
            try {
                const updatedSources = await api.getSources();

                // 优化：只请求 updated_at 变化的数据源详情
                const needsUpdate = (source: SourceSummary): boolean => {
                    const cachedData = dataMap[source.id];
                    if (!cachedData) return true;
                    if (!source.updated_at) return true;
                    if (!cachedData.updated_at) return true;
                    return source.updated_at > cachedData.updated_at;
                };

                const sourcesToFetch = updatedSources.filter(needsUpdate);
                const sourcesNeedingNoFetch = updatedSources.filter(
                    (s) => !needsUpdate(s)
                );

                // 只获取需要更新的数据源详情
                const dataPromises = sourcesToFetch.map((s) =>
                    api
                        .getSourceData(s.id)
                        .then((data) => ({ id: s.id, data }))
                );
                const results = await Promise.all(dataPromises);

                const newDataMap: Record<string, DataResponse> = {};

                // 添加需要更新的数据源
                results.forEach(({ id, data }) => {
                    newDataMap[id] = data;
                });

                // 使用缓存中不需要更新的数据源
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
                    false
                );
            } catch (error) {
                console.error("Dashboard polling failed:", error);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [sources, dataMap]);

    useEffect(() => {
        const onRefresh = async () => {
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
        };
        window.addEventListener("app:refresh_data", onRefresh);
        return () => window.removeEventListener("app:refresh_data", onRefresh);
    }, [sources, setSources, setSkippedScrapers]);

    const handleRefreshSource = async (sourceId: string) => {
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
            console.error(`刷新数据源 ${sourceId} 失败:`, error);
            // Rollback by re-fetching
            invalidateSources();
        }
    };

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
            console.error(`删除数据源 ${sourceId} 失败:`, error);
            // Rollback by re-fetching data
            invalidateSources();
        }
    };

    const handleRefreshAll = async () => {
        try {
            await api.refreshAll();
            window.dispatchEvent(new CustomEvent("app:refresh_data"));
        } catch (error) {
            console.error("刷新失败:", error);
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
                        icon={<Play className="h-8 w-8 animate-spin text-muted-foreground" />}
                        title="加载中..."
                        description="正在获取配置和数据"
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
                label: "刷新中",
                variant: "info" as const,
                colorClass: "bg-blue-500/10 text-blue-500",
                icon: Play,
            };
        }
        if ((source.status as string) === "suspended") {
            return {
                label: "需操作",
                variant: "warning" as const,
                colorClass: "bg-warning/20 text-warning",
                icon: Wrench,
            };
        }
        if ((source.status as string) === "error" && actionable) {
            return {
                label: "需修复",
                variant: "error" as const,
                colorClass: "bg-error/20 text-error",
                icon: Wrench,
            };
        }
        if (hasError) {
            return {
                label: "错误",
                variant: "error" as const,
                colorClass: "bg-error/20 text-error",
                icon: AlertTriangle,
            };
        }
        if (source.has_data) {
            return {
                label: "正常",
                variant: "success" as const,
                colorClass: "bg-success/20 text-success",
                icon: Database,
            };
        }
        return {
            label: "等待",
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
        ? getSourceErrorSummary(errorSource, errorSourceData)
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
                                    数据源状态
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
                                {sidebarCollapsed ? "展开" : "收起"}
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
                                        onClick={() => navigate("/integrations")}
                                        className="flex-1 h-8 bg-transparent border-border/50 text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-all duration-200"
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                                        新建
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">添加数据源</TooltipContent>
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
                                        运行
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    重新获取所有数据源
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
                                <TooltipContent side="right" className="text-xs">
                                    运行 (获取数据源)
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
                                    正常: {statusCounts.normal}
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
                                        刷新中: {statusCounts.refreshing}
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
                                        错误: {statusCounts.error}
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
                                        需操作: {statusCounts.suspended}
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
                                        等待: {statusCounts.waiting}
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
                                        sourceData,
                                    );
                                    const statusConfig =
                                        getStatusConfig(source);
                                    return (
                                        <Card
                                            key={source.id}
                                            className="bg-surface border-border/50 transition-shadow duration-150 hover:shadow-soft-elevation"
                                        >
                                            <CardContent className="p-3">
                                                <div className="flex items-center justify-between gap-1">
                                                    <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
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
                                                                {source.name}
                                                            </TooltipContent>
                                                        </Tooltip>
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
                                                                                ? "需修复"
                                                                                : "需操作"}
                                                                        </span>
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top">
                                                                    <p>
                                                                        {source.status ===
                                                                        "error"
                                                                            ? "更新无效凭证"
                                                                            : source
                                                                                    .interaction
                                                                                    ?.type ===
                                                                                "webview_scrape"
                                                                              ? "前台手动启动"
                                                                              : "解决问题"}
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
                                                                    错误
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
                                                                        刷新
                                                                    </span>
                                                                </DropdownMenuItem>
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
                                                                        删除
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
                                        <DialogTitle>确认删除</DialogTitle>
                                        <DialogDescription>
                                            确定要删除此数据源吗？该 source_id 的本地数据、密钥和绑定视图组件将被一并清理，此操作不可撤销。
                                        </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                setDeletingSourceId(null)
                                            }
                                        >
                                            取消
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
                                            确认删除
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </>
                    )}
                </aside>

                <main className="flex-1 p-4 overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">监控视图</h2>
                        <div className="flex gap-2">
                            <button
                                className="h-8 px-3 flex items-center gap-1.5 text-sm font-medium rounded-md bg-brand-gradient text-white hover:opacity-90 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 shadow-sm"
                                onClick={() => setIsAddDialogOpen(true)}
                            >
                                <Plus className="w-4 h-4" />
                                添加小组件
                            </button>
                        </div>
                    </div>

                    {!viewConfig || viewConfig.items.length === 0 ? (
                        <EmptyState
                            icon={<Database className="h-8 w-8 text-muted-foreground" />}
                            title="当前视图还没有任何组件"
                            description="添加组件以监控您的数据源。"
                            actionLabel="添加第一个组件"
                            onAction={() => setIsAddDialogOpen(true)}
                            className="border border-dashed rounded-lg bg-surface/30 mx-4 mb-4"
                        />
                    ) : (
                        <div
                            ref={gridRef}
                            className={`grid-stack grid-stack-${viewConfig.layout_columns || 12}`}
                        >
                            {viewConfig.items.map((item) => {
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
                                        : (safeProps.ui?.title || item.template_id);
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
                                        gs-x={String(item.x ?? 0)}
                                        gs-y={String(item.y ?? 0)}
                                        gs-w={String(item.w ?? 4)}
                                        gs-h={String(item.h ?? 2)}
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
                    queueLength={webviewQueue.length}
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
                            执行错误
                        </DialogTitle>
                        <DialogDescription>
                            {errorSource
                                ? `${errorSource.name} 的执行在运行期间失败。`
                                : "执行发生错误。"}
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
                                    ? "隐藏详细堆栈"
                                    : "显示详细堆栈"}
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
                            关闭
                        </Button>
                        {errorSource && (
                            <Button
                                onClick={() => {
                                    setErrorSourceId(null);
                                    setShowErrorDetails(false);
                                    void handleRefreshSource(errorSource.id);
                                }}
                            >
                                重新执行
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
