import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";
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
    const { t } = useI18n();
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
                "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-150 hover:border-foreground/20",
                isActive && "border-brand/60",
                isDragging && "opacity-50",
                className,
            )}
        >
            <div
                {...attributes}
                {...listeners}
                className="qb-card-header flex cursor-grab items-center gap-3 border-b border-border px-4 py-3 active:cursor-grabbing"
                title={t("dashboard.management.drag_handle_tooltip")}
            >
                <span className="grid grid-cols-2 gap-0.5 text-muted-foreground/60">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <span key={index} className="h-1 w-1 rounded-full bg-current" />
                    ))}
                </span>
                <button
                    type="button"
                    onClick={handleCardClick}
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground"
                    title={view.name}
                >
                    {view.name}
                </button>
            </div>

            <button
                type="button"
                onClick={handleCardClick}
                className="px-4 pb-3 pt-3 text-left"
            >
                <DashboardThumbnail view={view} className="w-full" />
            </button>

            <div className="flex items-center gap-2 px-4 pb-4 pt-1">
                <button
                    type="button"
                    onClick={handleEditClick}
                    className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <Pencil className="h-3 w-3" />
                    {t("dashboard.management.edit")}
                </button>
                <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <Trash2 className="h-3 w-3" />
                    {t("dashboard.management.delete")}
                </button>
            </div>
        </div>
    );
}
