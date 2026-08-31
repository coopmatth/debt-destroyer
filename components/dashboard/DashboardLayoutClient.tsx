"use client";

import { useState, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="relative group bg-surface rounded-xl shadow-sm">
      <div 
        {...attributes} 
        {...listeners} 
        className="absolute right-3 top-3 z-10 p-2 cursor-grab text-ink-muted hover:text-ink transition select-none touch-none bg-surface/80 rounded-md"
        title="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      </div>
      <div className="pt-2">{children}</div>
    </div>
  );
}

export function DashboardLayoutClient({
  strikeCard,
  cashflowCard,
  calendar
}: {
  strikeCard: React.ReactNode;
  cashflowCard: React.ReactNode;
  calendar: React.ReactNode;
}) {
  const [order, setOrder] = useState(["strike", "cashflow", "calendar"]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Requires 8px of movement to start a drag
      },
    }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    const saved = localStorage.getItem("dashboardLayoutOrder");
    if (saved) setOrder(JSON.parse(saved));
  }, []);

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (active.id !== over.id) {
      setOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        localStorage.setItem("dashboardLayoutOrder", JSON.stringify(newArray));
        return newArray;
      });
    }
  }

  const components: Record<string, React.ReactNode> = {
    strike: strikeCard,
    cashflow: cashflowCard,
    calendar: calendar,
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-6">
          {order.map((id) => (
            <SortableItem key={id} id={id}>
              {components[id]}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
