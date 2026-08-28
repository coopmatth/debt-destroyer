import { formatCents } from "@/lib/format";
import { addDays, parseIsoDate } from "@/lib/engine/dates";
import type { WeeklyPlan } from "@/lib/engine/types";

export function WeeklyCalendar({ plan }: { plan: WeeklyPlan }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(plan.weekStart, i));

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink-secondary uppercase">
            Schedule & Due Dates
          </h2>
          <p className="text-xs text-ink-muted">Week of {plan.weekStart}</p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {days.map((day) => {
          const isToday = day === plan.today;
          const isPayday = day === plan.nextPayday;
          const dateObj = parseIsoDate(day);
          const dayName = dateObj.toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" });
          const dayNum = dateObj.getUTCDate();

          // Match bills and debt minimums due on this day
          const billsDue = plan.fixedExpenseCharges.filter((c) => c.dueDate === day);
          const debtsDue = plan.minimumReservations.filter((m) => m.dueDate === day);
          const totalDue =
            billsDue.reduce((sum, b) => sum + b.amountCents, 0) +
            debtsDue.reduce((sum, d) => sum + d.amountCents, 0);

          return (
            <div
              key={day}
              className={`flex min-h-[96px] flex-col justify-between rounded-lg border p-2 text-center transition ${
                isToday
                  ? "border-series-1 bg-series-1/10"
                  : "border-hairline/60 bg-surface-2/40"
              }`}
            >
              <div>
                <span className="text-[11px] font-medium text-ink-muted block uppercase">
                  {dayName}
                </span>
                <span
                  className={`mt-0.5 inline-block text-sm font-semibold ${
                    isToday ? "text-series-1" : "text-ink"
                  }`}
                >
                  {dayNum}
                </span>
              </div>

              <div className="flex flex-col gap-1 my-1">
                {isPayday && (
                  <span className="rounded bg-good/20 px-1 py-0.5 text-[9px] font-semibold text-good">
                    Payday 💰
                  </span>
                )}
                {debtsDue.map((d, i) => (
                  <span
                    key={`d-${i}`}
                    className="truncate rounded bg-series-4/20 px-1 py-0.5 text-[9px] font-medium text-series-4 text-left"
                    title={`${d.name}: ${formatCents(d.amountCents)}`}
                  >
                    {d.name}
                  </span>
                ))}
                {billsDue.map((b, i) => (
                  <span
                    key={`b-${i}`}
                    className="truncate rounded bg-series-2/20 px-1 py-0.5 text-[9px] font-medium text-series-2 text-left"
                    title={`${b.name}: ${formatCents(b.amountCents)}`}
                  >
                    {b.name}
                  </span>
                ))}
              </div>

              <div className="text-[10px] font-semibold tabular text-ink-secondary">
                {totalDue > 0 ? formatCents(totalDue, { showCents: false }) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
