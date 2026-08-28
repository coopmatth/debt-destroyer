/**
 * Calendar arithmetic for the cash-flow engine.
 *
 * Dates here are `YYYY-MM-DD` strings, not Date objects, and every operation
 * goes through UTC midnight. That is deliberate: bill due dates and paydays are
 * calendar facts, not instants. Doing this math on local Date objects means a
 * bill due "March 9" can silently become March 8 for a user in a timezone that
 * shifts for DST that weekend, and the engine would reserve it a day early —
 * or, worse, a day late.
 */

export type IsoDate = string; // YYYY-MM-DD

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export type ExpenseFrequency =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "one_time";

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

/** Month arithmetic clamps to the end of the target month: Jan 31 + 1 = Feb 28. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIsoDate(date);
  const targetIndex = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(targetIndex / 12);
  const month = ((targetIndex % 12) + 12) % 12 + 1;
  const day = Math.min(d.getUTCDate(), daysInMonth(year, month));
  return fromParts(year, month, day);
}

/** Sets the day of month, clamped to the month's length. */
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

/**
 * The user's current calendar date. "Today" has to be resolved in their zone:
 * at 9pm Sunday in Los Angeles it is already Monday in UTC, and computing the
 * week boundary from UTC would roll their week over a day early.
 */
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

/** Monday of the week containing `date`. Weeks are Monday–Sunday. */
export function startOfWeekMonday(date: IsoDate): IsoDate {
  const dayOfWeek = parseIsoDate(date).getUTCDay(); // 0 = Sunday
  const offset = (dayOfWeek + 6) % 7; // Monday => 0, Sunday => 6
  return addDays(date, -offset);
}

// -----------------------------------------------------------------------------
// Recurrence
// -----------------------------------------------------------------------------

/**
 * Advances one pay period.
 *
 * Semimonthly deserves a note: it means twice a month, and the two dates are
 * derived from the anchor rather than hardcoded to the 1st and 15th. An anchor
 * on the 5th produces the 5th and the 20th. Clamping keeps February honest.
 */
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

/**
 * The first payday on or after `from`, projected from the user's anchor date.
 *
 * Users set their next payday once and never touch it again, so by week six the
 * stored value is in the past. Projecting forward from it keeps the engine
 * correct without nagging them to re-enter it.
 */
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
      return null; // happens once and never again
  }
}

/**
 * Every occurrence of a recurring bill falling in [windowStart, windowEnd].
 *
 * Returns a list, not a single date, because a weekly bill genuinely lands
 * twice before a fortnightly payday. Treating each expense as "one charge per
 * window" would under-reserve exactly the users living closest to the line.
 *
 * Occurrences before `windowStart` are skipped rather than dragged forward, so
 * a due date left untouched for six months does not get counted six times.
 */
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
