import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { DashboardCard } from "./DashboardCard";
import { cn } from "../../lib/utils";
import type { StoredView } from "../../types/config";

interface DashboardGridProps {
    views: StoredView[];
    activeViewId: string | null;
    onReorder: (newOrderedIds: string[]) => void;
    onEdit: (view: StoredView) => void;
    onDelete: (view: StoredView) => void;
    onSelect: (view: StoredView) => void;
    className?: string;
}

export function DashboardGrid({
    views,
    activeViewId,
    onReorder,
    onEdit,
    onDelete,
    onSelect,
    className,
}: DashboardGridProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const viewIds = views.map((v) => v.id);

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = views.findIndex((v) => v.id === active.id);
            const newIndex = views.findIndex((v) => v.id === over.id);
            const reordered = arrayMove(views, oldIndex, newIndex);
            onReorder(reordered.map((v) => v.id));
        }
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={viewIds} strategy={rectSortingStrategy}>
                <div
                    className={cn(
                        "mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-3 md:grid-cols-2 lg:max-w-[1380px] lg:grid-cols-4 2xl:max-w-[1480px] 2xl:grid-cols-5",
                        className,
                    )}
                >
                    {views.map((view) => (
                        <DashboardCard
                            key={view.id}
                            view={view}
                            isActive={view.id === activeViewId}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onClick={onSelect}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
