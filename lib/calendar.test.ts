import { describe, expect, it } from "vitest";
import { addDays, addMonths, monthLabel, monthWeeks, parseDay, parseMonth, weekDays, weekStart } from "./calendar";

describe("calendar", () => {
  it("parses months and days, rejecting junk", () => {
    expect(parseMonth("2026-11")).toBe("2026-11");
    expect(parseMonth("1999-12")).toBe("1999-12");
    for (const v of ["2026-13", "2026-1", "0000-01", "x", undefined, ["2026-11"]]) expect(parseMonth(v)).toBeNull();
    expect(parseDay("2024-02-29")).toBe("2024-02-29");
    for (const v of ["2026-02-29", "2026-11-31", "2026-11-1", "abc"]) expect(parseDay(v)).toBeNull();
  });

  it("moves by days and months across year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", -23)).toBe("2024-12");
  });

  it("finds a week's Sunday and its days", () => {
    expect(weekStart("2026-11-17")).toBe("2026-11-15");
    expect(weekStart("2026-11-15")).toBe("2026-11-15");
    expect(weekDays("2026-11-29")).toEqual([
      "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05",
    ]);
  });

  it("lays a month out in Sunday-first weeks", () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const weeks = monthWeeks("2026-11");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks[4]).toEqual(["2026-11-29", "2026-11-30", null, null, null, null, null]);
    // February 2026 starts on a Sunday and is exactly four weeks.
    expect(monthWeeks("2026-02")).toHaveLength(4);
    // August 2026 starts on a Saturday and needs six rows.
    const aug = monthWeeks("2026-08");
    expect(aug).toHaveLength(6);
    expect(aug[0].slice(0, 6).every((d) => d === null)).toBe(true);
    expect(aug[0][6]).toBe("2026-08-01");
  });

  it("keeps four-digit years below 0100 and around 2000", () => {
    expect(addMonths("0099-12", 1)).toBe("0100-01");
    expect(addDays("0099-01-01", -1)).toBe("0098-12-31");
    expect(weekStart("2000-01-01")).toBe("1999-12-26");
    expect(parseDay("1999-12-26")).toBe("1999-12-26");
    expect(monthWeeks("0099-01")[0].includes("0099-01-01")).toBe(true);
    expect(monthLabel("0099-01")).toMatch(/January 99/);
  });

  it("names months", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
});
