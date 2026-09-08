import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState, type ReactNode } from "react";

type ListItem = { id: string; name: string };

export function SortableSegmentList({ items, onMove, children }: {
    items: ListItem[];
    onMove: (fromID: string, toID: string) => void;
    children: ReactNode;
}) {
    const [activeID, setActiveID] = useState<string | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveID(String(active.id))}
            onDragCancel={() => setActiveID(null)}
            onDragEnd={({ active, over }) => {
                setActiveID(null);
                if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
            }}>
            <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
                {children}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
                {activeID && <div className="main-list-drag-preview">
                    <GripVertical size={20} />
                    <span>{items.find(item => item.id === activeID)?.name}</span>
                </div>}
            </DragOverlay>
        </DndContext>
    );
}

export function SortableSegmentRow({ id, name, enabled, disabled, className, children }: {
    id: string;
    name: string;
    enabled: boolean;
    disabled: boolean;
    className: string;
    children: ReactNode;
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
        useSortable({ id, disabled: !enabled || disabled });
    return (
        <article ref={setNodeRef}
            className={`${className}${enabled ? " main-list-sortable" : ""}${isDragging ? " dragging" : ""}`}
            style={{ transform: CSS.Transform.toString(transform), transition }}>
            {enabled && <button ref={setActivatorNodeRef} {...attributes} {...listeners}
                className="main-list-drag-handle" disabled={disabled}
                aria-label={`Reorder ${name}`} title="Drag to reorder">
                <GripVertical size={20} />
            </button>}
            {children}
        </article>
    );
}
