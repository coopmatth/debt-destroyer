import { formatCents } from "@/lib/format";
import type { WeeklyPlan } from "@/lib/engine/types";

export function MonthlyCalendar({ plan }: { plan: WeeklyPlan }) {
  const todayStr = plan.today || new Date().toISOString().slice(0, 10);
  const parts = todayStr.split("-");
  
  // Use fallbacks so TypeScript knows these will never be undefined
  const year = parseInt(parts[0] ?? "2026", 10);
  const month = parseInt(parts[1] ?? "1", 10);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const calendarCells: (string | null)[] = Array.from({ length: firstDayOfWeek }, () => null);
  for (let i = 1; i <= daysInMonth; i++) {
    calendarCells.push(`${parts[0]}-${parts[1]}-${String(i).padStart(2, "0")}`);
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
          {new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })}
        </h2>
      </div>

      <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 text-center text-[10px] font-medium text-ink-muted uppercase">
        {weekDays.map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {calendarCells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="p-1" />;

          const isToday = day === plan.today;
          const isPayday = day === plan.nextPayday;
          
          const dayParts = day.split("-");
          const dayNum = parseInt(dayParts[2] ?? "1", 10);

          const billsDue = plan.fixedExpenseCharges?.filter((c) => c.dueDate === day) ?? [];
          const debtsDue = plan.minimumReservations?.filter((m) => m.dueDate === day) ?? [];

          return (
            <div
              key={day}
              className={`flex min-h-[72px] flex-col justify-start rounded-lg border p-1 transition ${
                isToday ? "border-series-1 bg-series-1/10" : "border-hairline/60 bg-surface-2/40"
              }`}
            >
              <span className={`text-xs text-center font-semibold ${isToday ? "text-series-1" : "text-ink"}`}>
                {dayNum}
              </span>

              <div className="flex flex-col gap-0.5 mt-1 overflow-hidden">
                {isPayday && <span className="rounded bg-good/20 px-1 py-[2px] text-[8px] font-bold text-good truncate">Payday</span>}
                {debtsDue.map((d, i) => (
                  <span key={`d-${i}`} className="truncate rounded bg-series-4/20 px-1 py-[2px] text-[8px] font-medium text-series-4 text-left">{d.name}</span>
                ))}
                {billsDue.map((b, i) => (
                  <span key={`b-${i}`} className="truncate rounded bg-series-2/20 px-1 py-[2px] text-[8px] font-medium text-series-2 text-left">{b.name}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
