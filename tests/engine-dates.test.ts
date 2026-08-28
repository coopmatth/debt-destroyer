import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  advancePayPeriod,
  daysBetween,
  isIsoDate,
  nextPaydayOnOrAfter,
  occurrencesInWindow,
  startOfWeekMonday,
  todayInTimezone,
  withDayOfMonth,
} from "@/lib/engine/dates";

describe("addMonths", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  });

  it("handles leap years", () => {
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("crosses year boundaries in both directions", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-01-15", -13)).toBe("2024-12-15");
  });
});

describe("addDays / daysBetween", () => {
  it("crosses a DST boundary without losing a day", () => {
    // US DST springs forward on 2026-03-08. Local-time arithmetic here is where
    // a bill due the 9th silently becomes the 8th.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("counts across months and years", () => {
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(daysBetween("2026-08-28", "2026-08-28")).toBe(0);
    expect(daysBetween("2026-08-28", "2026-08-21")).toBe(-7);
  });
});

describe("startOfWeekMonday", () => {
  it("anchors weeks to Monday", () => {
    // 2026-08-28 is a Friday.
    expect(startOfWeekMonday("2026-08-28")).toBe("2026-08-24");
    // Monday maps to itself.
    expect(startOfWeekMonday("2026-08-24")).toBe("2026-08-24");
    // Sunday belongs to the week that started six days earlier, not the next one.
    expect(startOfWeekMonday("2026-08-30")).toBe("2026-08-24");
    expect(startOfWeekMonday("2026-08-31")).toBe("2026-08-31");
  });
});

describe("todayInTimezone", () => {
  it("resolves the user's calendar date, not the server's", () => {
    // 04:30 UTC on the 28th is still the 27th on the US west coast.
    const instant = new Date("2026-08-28T04:30:00Z");
    expect(todayInTimezone("America/Los_Angeles", instant)).toBe("2026-08-27");
    expect(todayInTimezone("UTC", instant)).toBe("2026-08-28");
    expect(todayInTimezone("Asia/Tokyo", instant)).toBe("2026-08-28");
  });

  it("keeps the week boundary in the user's zone", () => {
    // Sunday 9pm in LA is already Monday in UTC. Using UTC would roll the user
    // into a new week — and reset their variable spend — a day early.
    const sundayEvening = new Date("2026-08-31T04:00:00Z");
    const laDate = todayInTimezone("America/Los_Angeles", sundayEvening);
    expect(laDate).toBe("2026-08-30");
    expect(startOfWeekMonday(laDate)).toBe("2026-08-24");
    expect(startOfWeekMonday(todayInTimezone("UTC", sundayEvening))).toBe("2026-08-31");
  });
});

describe("advancePayPeriod", () => {
  it("advances weekly and biweekly by fixed days", () => {
    expect(advancePayPeriod("2026-08-28", "weekly")).toBe("2026-09-04");
    expect(advancePayPeriod("2026-08-28", "biweekly")).toBe("2026-09-11");
  });

  it("advances monthly with clamping", () => {
    expect(advancePayPeriod("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  it("derives semimonthly dates from the anchor rather than assuming 1st/15th", () => {
    // Anchored on the 5th => 5th and 20th.
    expect(advancePayPeriod("2026-08-05", "semimonthly")).toBe("2026-08-20");
    expect(advancePayPeriod("2026-08-20", "semimonthly")).toBe("2026-09-05");
    // Anchored on the 15th => 15th and 30th.
    expect(advancePayPeriod("2026-08-15", "semimonthly")).toBe("2026-08-30");
    // February clamps.
    expect(advancePayPeriod("2026-02-14", "semimonthly")).toBe("2026-02-28");
  });
});

describe("nextPaydayOnOrAfter", () => {
  it("projects forward from a stale anchor", () => {
    // Users set this once and never touch it. Six months later it must still work.
    // 2026-01-02 + 14×17 days lands exactly on 2026-08-28.
    expect(nextPaydayOnOrAfter("2026-01-02", "biweekly", "2026-08-27")).toBe("2026-08-28");
    expect(nextPaydayOnOrAfter("2026-01-02", "biweekly", "2026-08-29")).toBe("2026-09-11");
    expect(nextPaydayOnOrAfter("2026-01-15", "monthly", "2026-08-28")).toBe("2026-09-15");
  });

  it("returns the anchor when it is already in the future", () => {
    expect(nextPaydayOnOrAfter("2026-09-04", "biweekly", "2026-08-28")).toBe("2026-09-04");
  });

  it("treats a payday landing today as the next payday", () => {
    expect(nextPaydayOnOrAfter("2026-08-28", "weekly", "2026-08-28")).toBe("2026-08-28");
  });
});

describe("occurrencesInWindow", () => {
  it("returns every occurrence, not just the first", () => {
    // A weekly bill genuinely lands twice before a fortnightly payday.
    const occurrences = occurrencesInWindow("2026-08-28", "weekly", "2026-08-28", "2026-09-11");
    expect(occurrences).toEqual(["2026-08-28", "2026-09-04", "2026-09-11"]);
  });

  it("returns one occurrence for a monthly bill in a two-week window", () => {
    expect(occurrencesInWindow("2026-09-01", "monthly", "2026-08-28", "2026-09-11")).toEqual([
      "2026-09-01",
    ]);
  });

  it("returns nothing when the bill falls outside the window", () => {
    expect(occurrencesInWindow("2026-10-01", "monthly", "2026-08-28", "2026-09-11")).toEqual([]);
  });

  it("skips ancient occurrences instead of counting them repeatedly", () => {
    // A monthly bill anchored a year ago must contribute one charge, not twelve.
    const occurrences = occurrencesInWindow("2025-09-01", "monthly", "2026-08-21", "2026-09-11");
    expect(occurrences).toEqual(["2026-09-01"]);
  });

  it("handles one_time bills as a single event", () => {
    expect(occurrencesInWindow("2026-09-01", "one_time", "2026-08-28", "2026-09-11")).toEqual([
      "2026-09-01",
    ]);
    expect(occurrencesInWindow("2025-09-01", "one_time", "2026-08-28", "2026-09-11")).toEqual([]);
  });

  it("includes a recently overdue occurrence when the window reaches back", () => {
    const occurrences = occurrencesInWindow("2026-08-25", "monthly", "2026-08-21", "2026-09-11");
    expect(occurrences).toEqual(["2026-08-25"]);
  });
});

describe("withDayOfMonth / isIsoDate", () => {
  it("clamps the day to the month length", () => {
    expect(withDayOfMonth("2026-02-10", 31)).toBe("2026-02-28");
    expect(withDayOfMonth("2026-08-10", 31)).toBe("2026-08-31");
  });

  it("rejects dates that do not exist", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("08/28/2026")).toBe(false);
  });
});
