import { Fragment, type DragEvent, useMemo, useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import type { StoredView } from "../../types/config";

interface ViewTabsBarProps {
    views: StoredView[];
    activeViewId: string | null;
    visibleViewIds: string[];
    overflowViewIds: string[];
    onSelectView(viewId: string): void;
    onRenameView(viewId: string, nextName: string): void;
    onToggleManagementPanel(): void;
    overflowLabel: string;
    renamePlaceholder: string;
    draggedViewId?: string | null;
    onDragStartView?(
        viewId: string,
        sourceZone: "visible" | "overflow",
    ): void;
    onDragEndView?(): void;
    onDropVisibleIndex?(dropIndex: number, dropTargetViewId: string | null): void;
}

export default function ViewTabsBar({
    views,
    activeViewId,
    visibleViewIds,
    overflowViewIds,
    onSelectView,
    onRenameView,
    onToggleManagementPanel,
    overflowLabel,
    renamePlaceholder,
    draggedViewId = null,
    onDragStartView,
    onDragEndView,
    onDropVisibleIndex,
}: ViewTabsBarProps) {
    const [editingViewId, setEditingViewId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");

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

    const commitRename = (viewId: string) => {
        onRenameView(viewId, editingName);
        setEditingViewId(null);
        setEditingName("");
    };

    const handleDropTargetDragOver = (
        event: DragEvent<HTMLDivElement>,
    ) => {
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
        <div className="flex items-center gap-2">
            <Tabs
                value={activeViewId ?? undefined}
                onValueChange={onSelectView}
                className="min-w-0 flex-1"
            >
                <TabsList className="h-10 w-full justify-start overflow-hidden rounded-md border border-border bg-muted/40 p-0.5">
                    {visibleViews.map((view, index) => (
                        <Fragment key={view.id}>
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
                            <TabsTrigger
                                value={view.id}
                                data-testid={`dashboard-tab-${view.id}`}
                                className="max-w-[220px] min-w-[132px] rounded-sm border-b-2 border-transparent px-3 data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:bg-background data-[state=active]:shadow-none"
                                onDoubleClick={() => {
                                    setEditingViewId(view.id);
                                    setEditingName(view.name);
                                }}
                                draggable
                                onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData(
                                        "text/plain",
                                        view.id,
                                    );
                                    onDragStartView?.(view.id, "visible");
                                }}
                                onDragEnd={() => onDragEndView?.()}
                            >
                                {editingViewId === view.id ? (
                                    <input
                                        type="text"
                                        data-testid={`dashboard-tab-rename-${view.id}`}
                                        value={editingName}
                                        onChange={(event) =>
                                            setEditingName(event.target.value)
                                        }
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                commitRename(view.id);
                                            } else if (event.key === "Escape") {
                                                event.preventDefault();
                                                setEditingViewId(null);
                                                setEditingName("");
                                            }
                                        }}
                                        onBlur={() => commitRename(view.id)}
                                        onClick={(event) =>
                                            event.stopPropagation()
                                        }
                                        className="w-full rounded border border-border bg-background px-1 text-sm"
                                        placeholder={renamePlaceholder}
                                        autoFocus
                                    />
                                ) : (
                                    <span
                                        data-testid={`dashboard-tab-label-${view.id}`}
                                        className="truncate"
                                        title={view.name}
                                    >
                                        {view.name}
                                    </span>
                                )}
                            </TabsTrigger>
                        </Fragment>
                    ))}
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
                </TabsList>
            </Tabs>

            {overflowViewIds.length > 0 && (
                <button
                    type="button"
                    data-testid="dashboard-tab-overflow-trigger"
                    className="h-9 shrink-0 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={onToggleManagementPanel}
                    title={overflowLabel}
                    aria-label={overflowLabel}
                >
                    +{overflowViewIds.length}
                </button>
            )}
        </div>
    );
}
