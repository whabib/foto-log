/**
 * Calendar arithmetic for the photo calendar. Months are "YYYY-MM" and days
 * "YYYY-MM-DD", the member's own calendar dates as photos record them, so
 * no time zones are involved.
 */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");
const year4 = (n: number) => String(n).padStart(4, "0");

/** A "YYYY-MM" month, or null. Any four-digit year from 0001, like the photo record's dates. */
export function parseMonth(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = MONTH_RE.exec(value);
  return m && Number(m[1]) >= 1 ? value : null;
}

/** A real "YYYY-MM-DD" day, or null. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = DAY_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1) return null;
  const date = utc(value);
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? value : null;
}

/** Midnight UTC on `day`. setUTCFullYear keeps years below 100, which Date.UTC would read as 19xx. */
function utc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date;
}

function dayKey(date: Date): string {
  return `${year4(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The day `n` days after `day` (before, if negative). */
export function addDays(day: string, n: number): string {
  const date = utc(day);
  date.setUTCDate(date.getUTCDate() + n);
  return dayKey(date);
}

/** The month `n` months after `month` (before, if negative). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${year4(Math.floor(total / 12))}-${pad((total % 12) + 1)}`;
}

/** The Sunday that starts `day`'s week. */
export function weekStart(day: string): string {
  return addDays(day, -utc(day).getUTCDay());
}

/** The seven days, Sunday to Saturday, of the week starting `sunday`. */
export function weekDays(sunday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

/**
 * `month` as weeks of seven days, Sunday first. Days outside the month are
 * null, so the first and last weeks may be partly empty.
 */
export function monthWeeks(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const weeks: (string | null)[][] = [];
  for (let sunday = weekStart(first); sunday.slice(0, 7) <= month; sunday = addDays(sunday, 7)) {
    weeks.push(weekDays(sunday).map((d) => (d.startsWith(month) ? d : null)));
  }
  return weeks;
}

/** "November 2026". */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    utc(`${month}-01`),
  );
}

/** "Nov 15, 2026". */
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(utc(day));
}

/** "Sun 15". */
export function weekdayLabel(day: string): string {
  const date = utc(day);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date);
  return `${weekday} ${date.getUTCDate()}`;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
