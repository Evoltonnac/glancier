import { type DragEvent, useEffect, useRef, useState } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";

import type { StoredView } from "../../types/config";

interface ViewManagementPanelProps {
    views: StoredView[];
    activeViewId: string | null;
    overflowViewIds?: string[];
    onSelectView(viewId: string): void;
    onCreateView(): void;
    onRenameView(viewId: string, nextName: string): void;
    onDeleteView(viewId: string): void;
    title: string;
    createLabel: string;
    renamePlaceholder: string;
    draggedViewId?: string | null;
    onDragStartView?(
        viewId: string,
        sourceZone: "visible" | "overflow",
    ): void;
    onDragEndView?(): void;
    onDropOverflowIndex?(dropIndex: number, dropTargetViewId: string | null): void;
}

export default function ViewManagementPanel({
    views,
    activeViewId,
    overflowViewIds = [],
    onSelectView,
    onCreateView,
    onRenameView,
    onDeleteView,
    title,
    createLabel,
    renamePlaceholder,
    draggedViewId = null,
    onDragStartView,
    onDragEndView,
    onDropOverflowIndex,
}: ViewManagementPanelProps) {
    const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const editingInputRef = useRef<HTMLInputElement>(null);
    const isDeleteBlocked = views.length <= 1;
    const overflowViewIdSet = new Set(overflowViewIds);
    const overflowViews = overflowViewIds
        .map((viewId) => views.find((view) => view.id === viewId))
        .filter((view): view is StoredView => Boolean(view));

    useEffect(() => {
        setRenameDrafts((current) => {
            const next: Record<string, string> = {};
            for (const view of views) {
                next[view.id] = current[view.id] ?? view.name;
            }
            return next;
        });
    }, [views]);

    // Auto-focus and select all text when entering edit mode
    useEffect(() => {
        if (editingId && editingInputRef.current) {
            editingInputRef.current.focus();
            editingInputRef.current.select();
        }
    }, [editingId]);

    const updateDraft = (viewId: string, value: string) => {
        setRenameDrafts((current) => ({
            ...current,
            [viewId]: value,
        }));
    };

    const commitRename = (view: StoredView) => {
        const draft = renameDrafts[view.id] ?? view.name;
        onRenameView(view.id, draft);
        setEditingId(null);
    };

    const startEditing = (view: StoredView) => {
        setRenameDrafts((current) => ({
            ...current,
            [view.id]: view.name,
        }));
        setEditingId(view.id);
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
        onDropOverflowIndex?.(dropIndex, dropTargetViewId);
    };

    return (
        <section className="rounded-lg border border-border bg-surface/70 p-2">
            <div className="mb-2 flex items-center justify-between gap-3 px-2">
                <h3 className="text-sm font-semibold">{title}</h3>
                <button
                    type="button"
                    data-testid="dashboard-view-create"
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors duration-150"
                    onClick={onCreateView}
                >
                    {createLabel}
                </button>
            </div>
            <div className="mb-2 space-y-1">
                {Array.from({ length: overflowViews.length + 1 }, (_, index) => (
                    <div
                        key={`overflow-drop-${index}`}
                        data-testid={`dashboard-overflow-drop-${index}`}
                        className={`h-2 rounded-sm transition-colors ${
                            draggedViewId
                                ? "bg-brand/20 hover:bg-brand/30"
                                : "bg-muted/40"
                        }`}
                        onDragOver={handleDropTargetDragOver}
                        onDrop={(event) =>
                            handleDropTargetDrop(
                                event,
                                index,
                                overflowViews[index]?.id ?? null,
                            )
                        }
                    />
                ))}
            </div>
            <ol className="flex flex-col gap-0.5">
                {views.map((view) => (
                    <li
                        key={view.id}
                        data-testid={`dashboard-view-row-${view.id}`}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors duration-150"
                        draggable
                        onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", view.id);
                            const sourceZone = overflowViewIdSet.has(view.id)
                                ? "overflow"
                                : "visible";
                            onDragStartView?.(view.id, sourceZone);
                        }}
                        onDragEnd={() => onDragEndView?.()}
                    >
                        {/* Drag handle */}
                        <span className="w-4 h-4 text-muted-foreground/30 hover:text-foreground cursor-grab active:cursor-grabbing transition-colors flex-shrink-0">
                            <GripVertical className="w-4 h-4" />
                        </span>

                        {/* Active indicator dot */}
                        {activeViewId === view.id && (
                            <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                        )}

                        {/* View name — always shows input for test compatibility, styled differently when not editing */}
                        <input
                            ref={editingId === view.id ? editingInputRef : undefined}
                            type="text"
                            data-testid={`dashboard-view-rename-${view.id}`}
                            value={renameDrafts[view.id] ?? view.name}
                            onChange={(event) =>
                                updateDraft(view.id, event.target.value)
                            }
                            onBlur={() => editingId === view.id && commitRename(view)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    commitRename(view);
                                } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    setEditingId(null);
                                    updateDraft(view.id, view.name);
                                }
                            }}
                            readOnly={editingId !== view.id}
                            onClick={() => editingId !== view.id && onSelectView(view.id)}
                            className={cn(
                                "h-7 min-w-0 flex-1 rounded border px-2 text-sm transition-colors",
                                editingId === view.id
                                    ? "border-border bg-background focus-visible:ring-1 focus-visible:ring-brand"
                                    : "border-transparent bg-transparent cursor-pointer truncate",
                            )}
                            placeholder={renamePlaceholder}
                        />

                        {/* Action buttons — reveal on hover */}
                        <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
                            {editingId !== view.id && (
                                <button
                                    type="button"
                                    className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                                    onClick={() => startEditing(view)}
                                    aria-label="Rename view"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button
                                type="button"
                                data-testid={`dashboard-view-delete-${view.id}`}
                                className="h-6 w-6 flex items-center justify-center rounded-md text-error hover:text-error hover:bg-error/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => onDeleteView(view.id)}
                                disabled={isDeleteBlocked}
                                aria-label="Delete view"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}
