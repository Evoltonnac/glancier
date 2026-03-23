import { Fragment, type DragEvent, useMemo } from "react";
import { Plus } from "lucide-react";

import { Tabs, TabsList } from "../ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { StoredView } from "../../types/config";
import { ChromeTab } from "./ChromeTab";

interface ViewTabsBarProps {
    views: StoredView[];
    activeViewId: string | null;
    visibleViewIds: string[];
    overflowViewIds: string[];
    onSelectView(viewId: string): void;
    onRenameView(viewId: string, nextName: string): void;
    onCreateView(): void;
    onAddWidget(): void;
    addWidgetLabel: string;
    overflowLabel: string;
    renamePlaceholder: string;
    draggedViewId?: string | null;
    onDragStartView?(
        viewId: string,
        sourceZone: "visible" | "overflow",
    ): void;
    onDragEndView?(): void;
    onDropVisibleIndex?(dropIndex: number, dropTargetViewId: string | null): void;
    /** Rendered inside the overflow popover when there are overflow views. */
    overflowPanel: React.ReactNode;
}

export default function ViewTabsBar({
    views,
    activeViewId,
    visibleViewIds,
    overflowViewIds,
    onSelectView,
    onRenameView,
    onCreateView,
    onAddWidget,
    addWidgetLabel,
    overflowLabel,
    renamePlaceholder,
    draggedViewId = null,
    onDragStartView,
    onDragEndView,
    onDropVisibleIndex,
    overflowPanel,
}: ViewTabsBarProps) {
    const viewsById = useMemo(() => {
        const lookup = new Map<string, StoredView>();
        for (const view of views) {
            lookup.set(view.id, view);
        }
        return lookup;
    }, [views]);

    const visibleViews = visibleViewIds
        .map((viewId) => viewsById.get(viewId))
        .filter((view): view is StoredView => Boolean(view));

    const handleDropTargetDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    };

    const handleDropTargetDrop = (
        event: DragEvent<HTMLDivElement>,
        dropIndex: number,
        dropTargetViewId: string | null,
    ) => {
        event.preventDefault();
        onDropVisibleIndex?.(dropIndex, dropTargetViewId);
    };

    return (
        <div className="flex items-center gap-3">
            {/* Chrome tab strip — active tab sits at top of content area */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
                <Tabs
                    value={activeViewId ?? undefined}
                    onValueChange={onSelectView}
                    className="min-w-0 flex-1"
                >
                    <TabsList className="h-auto w-full justify-start overflow-visible rounded-none border-b border-border bg-transparent p-0">
                        {visibleViews.map((view, index) => (
                            <Fragment key={view.id}>
                                {/* Drop zone between tabs */}
                                <div
                                    data-testid={`dashboard-tab-drop-${index}`}
                                    className={`h-8 w-1 shrink-0 rounded-sm ${
                                        draggedViewId
                                            ? "bg-brand/20 hover:bg-brand/30"
                                            : "bg-transparent"
                                    }`}
                                    onDragOver={handleDropTargetDragOver}
                                    onDrop={(event) =>
                                        handleDropTargetDrop(
                                            event,
                                            index,
                                            view.id,
                                        )
                                    }
                                />
                                <ChromeTab
                                    view={view}
                                    isActive={activeViewId === view.id}
                                    isDragging={draggedViewId === view.id}
                                    onSelect={() => onSelectView(view.id)}
                                    onRename={onRenameView}
                                    renamePlaceholder={renamePlaceholder}
                                    onDragStart={onDragStartView}
                                    onDragEnd={onDragEndView}
                                />
                            </Fragment>
                        ))}
                        {/* Drop zone at the end of visible tabs */}
                        <div
                            data-testid={`dashboard-tab-drop-${visibleViews.length}`}
                            className={`h-8 w-1 shrink-0 rounded-sm ${
                                draggedViewId
                                    ? "bg-brand/20 hover:bg-brand/30"
                                    : "bg-transparent"
                            }`}
                            onDragOver={handleDropTargetDragOver}
                            onDrop={(event) =>
                                handleDropTargetDrop(
                                    event,
                                    visibleViews.length,
                                    null,
                                )
                            }
                        />

                        {/* New tab (+) button */}
                        <button
                            type="button"
                            data-testid="dashboard-tab-new"
                            className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                            onClick={onCreateView}
                            title="New view"
                            aria-label="Create new view"
                        >
                            <span className="text-lg font-light leading-none">
                                +
                            </span>
                        </button>
                    </TabsList>
                </Tabs>

                {/* Overflow popover trigger */}
                {overflowViewIds.length > 0 && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                data-testid="dashboard-tab-overflow-trigger"
                                className="h-9 shrink-0 rounded-md border border-border/60 bg-muted/40 px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                                title={overflowLabel}
                                aria-label={overflowLabel}
                            >
                                +{overflowViewIds.length}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            side="bottom"
                            sideOffset={6}
                            className="w-80 p-0"
                        >
                            {overflowPanel}
                        </PopoverContent>
                    </Popover>
                )}
            </div>

            {/* Add Widget — relocated from the removed legacy header */}
            <button
                type="button"
                data-testid="dashboard-add-widget"
                className="shrink-0 h-9 px-3 flex items-center gap-1.5 text-sm font-medium rounded-md bg-brand-gradient text-white hover:opacity-90 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 shadow-sm"
                onClick={onAddWidget}
            >
                <Plus className="w-4 h-4" />
                {addWidgetLabel}
            </button>
        </div>
    );
}
