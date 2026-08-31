"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute right-3 top-3 z-10 p-2 cursor-grab text-ink-muted hover:text-ink transition select-none touch-none bg-surface/80 rounded-md shadow-xs"
        title="Drag to reorder"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
      </div>
      {children}
    </div>
  );
}

export function SettingsLayoutClient({
  sections,
}: {
  sections: Record<string, React.ReactNode>;
}) {
  const defaultOrder = [
    "strategy",
    "budget",
    "autoMatch",
    "resetSpending",
    "realityCheck",
    "linkedBanks",
    "billDiscovery",
  ];

  const [order, setOrder] = useState<string[]>(defaultOrder);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    const saved = localStorage.getItem("settingsLayoutOrder");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure any newly added settings sections are retained
        const missing = defaultOrder.filter((id) => !parsed.includes(id));
        setOrder([...parsed, ...missing]);
      } catch {
        setOrder(defaultOrder);
      }
    }
  }, []);

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        localStorage.setItem("settingsLayoutOrder", JSON.stringify(newArray));
        return newArray;
      });
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-6">
          {order.map((id) =>
            sections[id] ? (
              <SortableItem key={id} id={id}>
                {sections[id]}
              </SortableItem>
            ) : null,
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
