"use client";

import { useState, useEffect } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StrikeCard } from "@/components/dashboard/StrikeCard";
import { CashflowCard } from "@/components/dashboard/CashflowCard";
import { MonthlyCalendar } from "@/components/dashboard/MonthlyCalendar";
import type { WeeklyPlan } from "@/lib/engine/types";

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div 
        {...attributes} 
        {...listeners} 
        className="absolute -left-7 top-1/2 -translate-y-1/2 p-2 cursor-grab opacity-0 group-hover:opacity-100 text-ink-muted hover:text-ink transition select-none touch-none"
      >
        ☰
      </div>
      {children}
    </div>
  );
}

export function DashboardLayoutClient({ plan }: { plan: WeeklyPlan }) {
  const [order, setOrder] = useState(["strike", "cashflow", "calendar"]);

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
    strike: <StrikeCard plan={plan} />,
    cashflow: <CashflowCard plan={plan} />,
    calendar: <MonthlyCalendar plan={plan} />,
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-6 pl-6">
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
