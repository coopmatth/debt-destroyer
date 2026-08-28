import { formatCents } from "@/lib/format";
import type { PlannedAction, WeeklyPlan } from "@/lib/engine/types";

/**
 * Blockers and notes.
 *
 * Status colour never carries meaning alone here — every row pairs the colour
 * with an icon glyph and a written label, which is the mitigation the status
 * palette requires on a light surface.
 */
export function Blockers({ plan }: { plan: WeeklyPlan }) {
  if (plan.blockers.length === 0 && plan.notes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {plan.blockers.map((blocker) => (
        <div
          key={blocker.code}
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-hairline bg-surface p-3 text-sm"
        >
          <span aria-hidden className="mt-0.5 text-critical">
            ▲
          </span>
          <span>
            <span className="font-medium text-ink">Needs attention</span>{" "}
            <span className="text-ink-secondary">{blocker.message}</span>
          </span>
        </div>
      ))}

      {plan.notes.map((note) => (
        <div
          key={note}
          className="flex items-start gap-2.5 rounded-lg border border-hairline bg-surface p-3 text-sm"
        >
          <span aria-hidden className="mt-0.5 text-ink-muted">
            ◆
          </span>
          <span className="text-ink-secondary">{note}</span>
        </div>
      ))}
    </div>
  );
}

export function ActionList({ actions }: { actions: PlannedAction[] }) {
  if (actions.length === 0) return null;

  return (
    <ol className="flex flex-col gap-2">
      {actions.map((action, index) => (
        <li
          key={`${action.type}-${action.debtId}-${index}`}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-hairline bg-surface p-3"
        >
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{
              background: action.type === "minimum" ? "var(--series-4)" : "var(--series-1)",
            }}
          />
          <span className="font-medium text-ink">
            {action.type === "minimum" ? "Minimum payment" : "Strike"} · {action.debtName}
          </span>
          <span className="tabular ml-auto font-semibold text-ink">
            {formatCents(action.amountCents)}
          </span>
          <span className="w-full text-xs text-ink-muted">{action.reason}</span>
        </li>
      ))}
    </ol>
  );
}
