export type IsoDate = string; // YYYY-MM-DD
export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type ExpenseFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "annual" | "one_time";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  return toIsoDate(parseIsoDate(value)) === value;
}

export function parseIsoDate(date: IsoDate): Date {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function fromParts(year: number, month: number, day: number): IsoDate {
  return toIsoDate(new Date(Date.UTC(year, month - 1, day)));
}

export function getYear(date: IsoDate): number {
  return parseIsoDate(date).getUTCFullYear();
}

export function getMonth(date: IsoDate): number {
  return parseIsoDate(date).getUTCMonth() + 1;
}

export function getDayOfMonth(date: IsoDate): number {
  return parseIsoDate(date).getUTCDate();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIsoDate(date);
  const targetIndex = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(targetIndex / 12);
  const month = ((targetIndex % 12) + 12) % 12 + 1;
  const day = Math.min(d.getUTCDate(), daysInMonth(year, month));
  return fromParts(year, month, day);
}

export function withDayOfMonth(date: IsoDate, day: number): IsoDate {
  const year = getYear(date);
  const month = getMonth(date);
  return fromParts(year, month, Math.min(day, daysInMonth(year, month)));
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return a < b;
}

export function isOnOrBefore(a: IsoDate, b: IsoDate): boolean {
  return a <= b;
}

export function isWithin(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return date >= start && date <= end;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = parseIsoDate(to).getTime() - parseIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function todayInTimezone(timezone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Friday of the week containing `date`. Weeks are Friday–Thursday. */
export function startOfWeekFriday(date: IsoDate): IsoDate {
  const dayOfWeek = parseIsoDate(date).getUTCDay(); // 0 = Sunday
  const offset = (dayOfWeek + 2) % 7; // Friday => 0, Thursday => 6
  return addDays(date, -offset);
}

export function advancePayPeriod(date: IsoDate, frequency: PayFrequency): IsoDate {
  switch (frequency) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "monthly":
      return addMonths(date, 1);
    case "semimonthly": {
      const day = getDayOfMonth(date);
      if (day <= 15) return withDayOfMonth(date, day + 15);
      return withDayOfMonth(addMonths(date, 1), day - 15);
    }
  }
}

const MAX_PROJECTION_STEPS = 600;

export function nextPaydayOnOrAfter(
  anchor: IsoDate,
  frequency: PayFrequency,
  from: IsoDate,
): IsoDate {
  let candidate = anchor;
  let steps = 0;

  while (candidate < from && steps < MAX_PROJECTION_STEPS) {
    candidate = advancePayPeriod(candidate, frequency);
    steps++;
  }

  return candidate;
}

export function advanceExpensePeriod(
  date: IsoDate,
  frequency: ExpenseFrequency,
): IsoDate | null {
  switch (frequency) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "semimonthly": {
      const day = getDayOfMonth(date);
      if (day <= 15) return withDayOfMonth(date, day + 15);
      return withDayOfMonth(addMonths(date, 1), day - 15);
    }
    case "monthly":
      return addMonths(date, 1);
    case "quarterly":
      return addMonths(date, 3);
    case "annual":
      return addMonths(date, 12);
    case "one_time":
      return null;
  }
}

export function occurrencesInWindow(
  nextDueDate: IsoDate,
  frequency: ExpenseFrequency,
  windowStart: IsoDate,
  windowEnd: IsoDate,
): IsoDate[] {
  const occurrences: IsoDate[] = [];
  let cursor: IsoDate | null = nextDueDate;
  let steps = 0;

  while (cursor !== null && cursor <= windowEnd && steps < MAX_PROJECTION_STEPS) {
    if (cursor >= windowStart) occurrences.push(cursor);
    cursor = advanceExpensePeriod(cursor, frequency);
    steps++;
  }

  return occurrences;
}
