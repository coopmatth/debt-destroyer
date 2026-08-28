"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  daysInMonth,
  getMonth,
  getYear,
  occurrencesInWindow,
  parseIsoDate,
  startOfWeekMonday,
  type ExpenseFrequency,
  type IsoDate,
} from "@/lib/engine/dates";
import { formatCents } from "@/lib/format";
import type { Tables } from "@/types/database.types";
import type { WeeklyPlan } from "@/lib/engine/types";

type Debt = Tables<"debts">;
type Expense = Tables<"expenses">;

interface CalendarItem {
  id: string;
  type: "bill" | "debt_minimum";
  name: string;
  amountCents: number;
  dueDate: IsoDate;
  isPaid: boolean;
}

export function CalendarView({
  plan,
  debts,
  expenses,
}: {
  plan: WeeklyPlan;
  debts: Debt[];
  expenses: Expense[];
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<IsoDate>(plan.today);

  // Compute month window
  const activeDate = addMonths(plan.today, selectedMonthOffset);
  const year = getYear(activeDate);
  const month = getMonth(activeDate);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const totalDays = daysInMonth(year, month);
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(totalDays).padStart(2, "0")}`;

  // Build items for the active timeframe
  const allItems: CalendarItem[] = [];

  // Project bills
  for (const expense of expenses) {
    const dates = occurrencesInWindow(
      expense.next_due_date,
      expense.frequency as ExpenseFrequency,
      monthStart,
      monthEnd
    );
    for (const d of dates) {
      const isPaid =
        expense.last_paid_date !== null && expense.last_paid_date >= d;
      allItems.push({
        id: expense.id,
        type: "bill",
        name: expense.name,
        amountCents: expense.amount_cents,
        dueDate: d,
        isPaid,
      });
    }
  }

  // Include debt minimums
  for (const debt of debts) {
    if (debt.next_due_date && debt.minimum_payment_cents > 0) {
      if (debt.next_due_date >= monthStart && debt.next_due_date <= monthEnd) {
        const isPaid = debt.min_payment_paid_for_due_date === debt.next_due_date;
        allItems.push({
          id: debt.id,
          type: "debt_minimum",
          name: `${debt.name} Min`,
          amountCents: debt.minimum_payment_cents,
          dueDate: debt.next_due_date,
          isPaid,
        });
      }
    }
  }

  // Quick-action toggle: Mark item paid/unpaid directly
  async function togglePaid(item: CalendarItem) {
    setBusyId(item.id);
    try {
      if (item.type === "bill") {
        await fetch(`/api/expenses/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            last_paid_date: item.isPaid ? null : item.dueDate,
          }),
        });
      } else {
        await fetch(`/api/debts/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            min_payment_paid_for_due_date: item.isPaid ? null : item.dueDate,
          }),
        });
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  // Generate calendar grid days
  let gridDays: IsoDate[] = [];
  if (viewMode === "week") {
    const startOfWeek = startOfWeekMonday(plan.today);
    gridDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));
  } else {
    // 1st of the month day-of-week offset (Monday start)
    const firstDayIndex = (parseIsoDate(monthStart).getUTCDay() + 6) % 7;
    const startGridDate = addDays(monthStart, -firstDayIndex);
    gridDays = Array.from({ length: 35 }, (_, i) => addDays(startGridDate, i));
  }

  const selectedDayItems = allItems.filter((i) => i.dueDate === activeDay);
  const monthName = parseIsoDate(monthStart).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 shadow-sm">
      {/* Top Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
            Payment Calendar & Projections
          </h2>
          <p className="text-xs text-ink-muted">
            {viewMode === "month" ? monthName : `Week of ${plan.weekStart}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === "month" && (
            <div className="flex items-center rounded-lg border border-hairline bg-surface-2 p-0.5">
              <button
                onClick={() => setSelectedMonthOffset((v) => v - 1)}
                className="px-2 py-1 text-xs text-ink-secondary hover:text-ink"
              >
                ◀
              </button>
              <button
                onClick={() => setSelectedMonthOffset(0)}
                className="px-2 py-1 text-xs font-medium text-ink"
              >
                Today
              </button>
              <button
                onClick={() => setSelectedMonthOffset((v) => v + 1)}
                className="px-2 py-1 text-xs text-ink-secondary hover:text-ink"
              >
                ▶
              </button>
            </div>
          )}

          <div className="flex rounded-lg border border-hairline bg-surface-2 p-0.5">
            <button
              onClick={() => setViewMode("week")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "week"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "month"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Header */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-ink-muted uppercase">
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
        <span>Sun</span>
      </div>

      {/* Days Grid */}
      <div className="mt-1.5 grid grid-cols-7 gap-1 md:gap-1.5">
        {gridDays.map((day) => {
          const isToday = day === plan.today;
          const isSelected = day === activeDay;
          const isCurrentMonth =
            viewMode === "week" || day.slice(5, 7) === monthStart.slice(5, 7);
          const dateObj = parseIsoDate(day);
          const dayNum = dateObj.getUTCDate();
          const dayItems = allItems.filter((i) => i.dueDate === day);
          const unpaidCount = dayItems.filter((i) => !i.isPaid).length;
          const totalAmount = dayItems.reduce((s, i) => s + i.amountCents, 0);

          return (
            <button
              key={day}
              type="button"
              onClick={() => setActiveDay(day)}
              className={`flex min-h-[72px] flex-col justify-between rounded-lg border p-1.5 text-left transition ${
                isSelected
                  ? "ring-1 ring-series-1 border-series-1 bg-series-1/10"
                  : isToday
                  ? "border-series-1/60 bg-surface-2"
                  : isCurrentMonth
                  ? "border-hairline/60 bg-surface-2/40 hover:bg-surface-2"
                  : "border-hairline/20 bg-surface/20 opacity-30"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-xs font-semibold ${
                    isToday ? "text-series-1" : "text-ink"
                  }`}
                >
                  {dayNum}
                </span>
                {unpaidCount > 0 && (
                  <span className="size-1.5 rounded-full bg-series-2" />
                )}
              </div>

              {/* Badges preview */}
              <div className="flex flex-col gap-0.5 my-auto w-full overflow-hidden">
                {dayItems.slice(0, 2).map((item, idx) => (
                  <div
                    key={idx}
                    className={`truncate rounded px-1 py-0.2 text-[8px] font-medium ${
                      item.isPaid
                        ? "line-through opacity-40 bg-surface-3 text-ink-muted"
                        : item.type === "bill"
                        ? "bg-series-2/20 text-series-2"
                        : "bg-series-4/20 text-series-4"
                    }`}
                  >
                    {item.name}
                  </div>
                ))}
                {dayItems.length > 2 && (
                  <span className="text-[8px] text-ink-muted">
                    +{dayItems.length - 2} more
                  </span>
                )}
              </div>

              <div className="text-[9px] tabular font-medium text-ink-muted">
                {totalAmount > 0
                  ? formatCents(totalAmount, { showCents: false })
                  : ""}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Day Quick Action Panel */}
      <div className="mt-4 rounded-lg border border-hairline/80 bg-surface-2/60 p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-ink">
            Due on {parseIsoDate(activeDay).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
          <span className="text-xs tabular text-ink-muted">
            {selectedDayItems.length} item{selectedDayItems.length === 1 ? "" : "s"}
          </span>
        </div>

        {selectedDayItems.length === 0 ? (
          <p className="text-xs text-ink-muted py-1">No payments due on this date.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selectedDayItems.map((item) => (
              <li
                key={`${item.type}-${item.id}-${item.dueDate}`}
                className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface p-2.5"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => togglePaid(item)}
                    disabled={busyId === item.id}
                    className={`flex size-5 shrink-0 items-center justify-center rounded border transition ${
                      item.isPaid
                        ? "border-good bg-good/20 text-good"
                        : "border-hairline text-transparent hover:border-ink-muted"
                    }`}
                    title={item.isPaid ? "Mark unpaid" : "Mark paid"}
                  >
                    ✓
                  </button>
                  <div>
                    <p
                      className={`text-xs font-medium ${
                        item.isPaid
                          ? "line-through text-ink-muted"
                          : "text-ink"
                      }`}
                    >
                      {item.name}
                    </p>
                    <span className="text-[10px] text-ink-muted uppercase">
                      {item.type === "bill" ? "Recurring Bill" : "Minimum Due"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-semibold tabular ${
                      item.isPaid ? "text-ink-muted" : "text-ink"
                    }`}
                  >
                    {formatCents(item.amountCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePaid(item)}
                    disabled={busyId === item.id}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                      item.isPaid
                        ? "bg-surface-3 text-ink-muted hover:text-ink"
                        : "bg-series-1 text-white hover:opacity-90"
                    }`}
                  >
                    {busyId === item.id
                      ? "..."
                      : item.isPaid
                      ? "Unmark"
                      : "Mark Paid"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
