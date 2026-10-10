// Calendar dates are plain "YYYY-MM-DD" strings in the user's local timezone.
// Arithmetic is done in UTC so it never drifts across DST changes.

export type DateStr = string;

const DAY_MS = 86_400_000;

export function toDate(d: DateStr): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function fromDate(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: DateStr, n: number): DateStr {
  return fromDate(new Date(toDate(d).getTime() + n * DAY_MS));
}

/** Inclusive number of days from a to b (a <= b gives >= 1). */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS) + 1;
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a < b ? a : b;
}

export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a > b ? a : b;
}

/** Every date from a to b inclusive. */
export function eachDay(a: DateStr, b: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Monday … 6 = Sunday (ISO order). */
export function weekdayIndex(d: DateStr): number {
  return (toDate(d).getUTCDay() + 6) % 7;
}

export function startOfWeek(d: DateStr): DateStr {
  return addDays(d, -weekdayIndex(d));
}

export function endOfWeek(d: DateStr): DateStr {
  return addDays(startOfWeek(d), 6);
}

export function startOfMonth(d: DateStr): DateStr {
  return d.slice(0, 8) + "01";
}

export function daysInMonth(d: DateStr): number {
  const dt = toDate(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
}

export function endOfMonth(d: DateStr): DateStr {
  return d.slice(0, 8) + String(daysInMonth(d)).padStart(2, "0");
}

export function addMonths(d: DateStr, n: number): DateStr {
  const dt = toDate(d);
  const target = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + n, 1));
  const dim = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(dt.getUTCDate(), dim));
  return fromDate(target);
}

/** "2026-10" style key for a month. */
export function monthKey(d: DateStr): string {
  return d.slice(0, 7);
}

export function monthStartFromKey(key: string): DateStr {
  return `${key}-01`;
}

export function isValidDateStr(s: unknown): s is DateStr {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromDate(toDate(s)) === s;
}

/** Today's date in an IANA timezone, e.g. "Asia/Kolkata". */
export function todayIn(timeZone: string, now: Date = new Date()): DateStr {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return fromDate(now);
  }
}

/** Local wall-clock time "HH:MM" in an IANA timezone. */
export function timeIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function monthName(d: DateStr): string {
  return MONTHS[toDate(d).getUTCMonth()];
}

export function monthLabel(d: DateStr): string {
  return `${monthName(d)} ${toDate(d).getUTCFullYear()}`;
}

export function weekdayShort(i: number): string {
  return WEEKDAYS_SHORT[i];
}

export function weekdayLong(i: number): string {
  return WEEKDAYS_LONG[i];
}

/** "Sat 10 Oct" */
export function shortDate(d: DateStr): string {
  const dt = toDate(d);
  return `${WEEKDAYS_SHORT[weekdayIndex(d)]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()].slice(0, 3)}`;
}

/** "10 Oct 2026" */
export function mediumDate(d: DateStr): string {
  const dt = toDate(d);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()].slice(0, 3)} ${dt.getUTCFullYear()}`;
}

export function relativeDay(d: DateStr, today: DateStr): string {
  if (d === today) return "Today";
  if (d === addDays(today, -1)) return "Yesterday";
  return shortDate(d);
}
