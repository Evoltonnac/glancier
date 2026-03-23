import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { DashboardThumbnail } from "./DashboardThumbnail";
import type { StoredView } from "../../types/config";

interface DashboardCardProps {
    view: StoredView;
    isActive?: boolean;
    onEdit?: (view: StoredView) => void;
    onDelete?: (view: StoredView) => void;
    onClick?: (view: StoredView) => void;
    className?: string;
}

export function DashboardCard({
    view,
    isActive = false,
    onEdit,
    onDelete,
    onClick,
    className,
}: DashboardCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: view.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit?.(view);
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete?.(view);
    };

    const handleCardClick = () => {
        onClick?.(view);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative flex flex-col overflow-hidden rounded-xl border border-border/50 bg-surface shadow-sm transition-opacity",
                isActive && "ring-2 ring-brand",
                isDragging && "opacity-50",
                className,
            )}
        >
            {/* Drag handle - top-left corner */}
            <div
                {...attributes}
                {...listeners}
                className="absolute left-2 top-2 z-10 cursor-grab text-muted-foreground/40 hover:text-muted-foreground"
                title="Drag to reorder"
            >
                <GripVertical className="h-4 w-4" />
            </div>

            {/* Thumbnail area - clickable to enter dashboard */}
            <button
                type="button"
                onClick={handleCardClick}
                className="mt-8 flex flex-col items-center px-2 pb-2 text-left hover:opacity-90"
            >
                <DashboardThumbnail view={view} className="w-full" />
            </button>

            {/* Card title */}
            <button
                type="button"
                onClick={handleCardClick}
                className="line-clamp-1 px-3 pb-1 text-left text-sm font-semibold text-foreground hover:text-brand"
                title={view.name}
            >
                {view.name}
            </button>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 px-3 pb-3">
                <button
                    type="button"
                    onClick={handleEditClick}
                    className="flex items-center gap-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <Pencil className="h-3 w-3" />
                    Edit
                </button>
                <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="flex items-center gap-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <Trash2 className="h-3 w-3" />
                    Delete
                </button>
            </div>
        </div>
    );
}
