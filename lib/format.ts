import { formatCents } from "@/lib/money";
import { daysBetween, type IsoDate } from "@/lib/engine/dates";

export { formatCents };

/** "Sep 2" / "Sep 2, 2027" once the year differs from the reference date. */
export function formatDueDate(date: IsoDate, today: IsoDate): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(parsed);
}

/** "in 4 days" / "today" / "5 days ago" — relative to the user's own date. */
export function formatRelativeDays(date: IsoDate, today: IsoDate): string {
  const days = daysBetween(today, date);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

export function formatApr(apr: number): string {
  // Trim trailing zeros: 24.9900 reads as 24.99%, 0 reads as 0%.
  return `${Number(apr.toFixed(4))}%`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function titleCase(value: string): string {
  return value
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
