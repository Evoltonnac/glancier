import { type DragEvent, useState } from "react";
import { cn } from "../../lib/utils";
import type { StoredView } from "../../types/config";

interface ChromeTabProps {
    view: StoredView;
    isActive: boolean;
    isDragging?: boolean;
    onSelect(): void;
    onRename(viewId: string, nextName: string): void;
    renamePlaceholder: string;
    onDragStart?(viewId: string, sourceZone: "visible" | "overflow"): void;
    onDragEnd?(): void;
}

export function ChromeTab({
    view,
    isActive,
    isDragging = false,
    onSelect,
    onRename,
    renamePlaceholder,
    onDragStart,
    onDragEnd,
}: ChromeTabProps) {
    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState(view.name);

    const commitRename = () => {
        onRename(view.id, draftName);
        setEditing(false);
    };

    const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", view.id);
        onDragStart?.(view.id, "visible");
    };

    return (
        <button
            type="button"
            data-testid={`dashboard-chrome-tab-${view.id}`}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={() => onDragEnd?.()}
            onClick={() => !editing && onSelect()}
            onDoubleClick={() => {
                setDraftName(view.name);
                setEditing(true);
            }}
            className={cn(
                "group relative flex h-9 min-w-[100px] max-w-[200px] items-center gap-1.5 overflow-hidden rounded-t-md border px-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                // Inactive: muted background, subtle border
                !isActive && [
                    "border-border/60 bg-muted/50 text-muted-foreground",
                    "hover:border-border hover:bg-muted/80 hover:text-foreground",
                ],
                // Active: sits "above" the content area
                isActive && [
                    "z-10 -mb-px border-b-0 border-border bg-background text-foreground shadow-sm",
                    // The angled top-left and top-right corners give the Chrome look
                    "rounded-t-md",
                ],
                // Dragging: slight opacity reduction
                isDragging && "opacity-60",
            )}
            title={view.name}
            aria-selected={isActive}
        >
            {/* Favicon placeholder — small colored circle */}
            <span
                className={cn(
                    "h-3.5 w-3.5 shrink-0 rounded-full",
                    isActive ? "bg-brand/70" : "bg-muted-foreground/30",
                )}
                aria-hidden="true"
            />

            {editing ? (
                <input
                    type="text"
                    data-testid={`dashboard-tab-rename-${view.id}`}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename();
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditing(false);
                            setDraftName(view.name);
                        }
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 truncate rounded border border-border bg-background px-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand/50"
                    placeholder={renamePlaceholder}
                    autoFocus
                />
            ) : (
                <span
                    data-testid={`dashboard-tab-label-${view.id}`}
                    className="min-w-0 flex-1 truncate"
                >
                    {view.name}
                </span>
            )}
        </button>
    );
}
