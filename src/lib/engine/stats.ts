// Facts about a range of days, computed only from what the user actually logged.
// An unlogged day is "not logged" — never treated as a day without junk food.

import { addDays, daysBetween, eachDay, minDate, weekdayIndex, type DateStr } from "./dates";
import type { FoodLog } from "./types";

export type DayState = "clean" | "cheat" | "not_logged" | "future";

export function indexLogs(logs: FoodLog[]): Map<DateStr, FoodLog> {
  return new Map(logs.map((l) => [l.log_date, l]));
}

export function dayState(byDate: Map<DateStr, FoodLog>, day: DateStr, today: DateStr): DayState {
  if (day > today) return "future";
  const log = byDate.get(day);
  if (!log) return "not_logged";
  return log.had_cheat ? "cheat" : "clean";
}

export interface RangeSummary {
  from: DateStr;
  to: DateStr;
  /** Days in the range up to today (days that could have been logged). */
  elapsedDays: number;
  loggedDays: number;
  notLoggedDays: number;
  /** Days with at least one cheat meal. */
  cheatDays: number;
  /** Logged days with no cheat meal. */
  cleanDays: number;
  /** Total cheat meals (a day can have several). */
  meals: number;
  /** % of elapsed days that were logged (0–100). */
  loggingRate: number;
  /** Number of days each category was recorded on. */
  categoryDays: Record<string, number>;
  /** Cheat meals by weekday, Mon..Sun. */
  weekdayMeals: number[];
  /** Days with a cheat meal by weekday, Mon..Sun. */
  weekdayCheatDays: number[];
  /** Longest run of consecutive logged no-cheat days. */
  longestCleanRun: number;
}

export function summarize(logs: FoodLog[], from: DateStr, to: DateStr, today: DateStr): RangeSummary {
  const last = minDate(to, today);
  const elapsedDays = last >= from ? daysBetween(from, last) : 0;
  const byDate = indexLogs(logs);
  const s: RangeSummary = {
    from, to, elapsedDays,
    loggedDays: 0, notLoggedDays: 0, cheatDays: 0, cleanDays: 0, meals: 0, loggingRate: 0,
    categoryDays: {}, weekdayMeals: [0, 0, 0, 0, 0, 0, 0], weekdayCheatDays: [0, 0, 0, 0, 0, 0, 0],
    longestCleanRun: 0,
  };
  if (elapsedDays === 0) return s;

  let run = 0;
  for (const d of eachDay(from, last)) {
    const log = byDate.get(d);
    if (!log) {
      s.notLoggedDays++;
      run = 0;
      continue;
    }
    s.loggedDays++;
    if (log.had_cheat) {
      s.cheatDays++;
      s.meals += log.meal_count;
      const wd = weekdayIndex(d);
      s.weekdayMeals[wd] += log.meal_count;
      s.weekdayCheatDays[wd]++;
      for (const c of log.categories) s.categoryDays[c] = (s.categoryDays[c] ?? 0) + 1;
      run = 0;
    } else {
      s.cleanDays++;
      run++;
      s.longestCleanRun = Math.max(s.longestCleanRun, run);
    }
  }
  s.loggingRate = Math.round((s.loggedDays / elapsedDays) * 100);
  return s;
}

/** Consecutive logged days ending today — or yesterday if today isn't logged yet. */
export function loggingStreak(logs: FoodLog[], today: DateStr): number {
  const byDate = indexLogs(logs);
  let d = byDate.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (byDate.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Consecutive logged no-cheat days ending today (or yesterday). */
export function cleanStreak(logs: FoodLog[], today: DateStr): number {
  const byDate = indexLogs(logs);
  let d = byDate.has(today) ? today : addDays(today, -1);
  let n = 0;
  for (let log = byDate.get(d); log && !log.had_cheat; log = byDate.get(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function longestLoggingStreak(logs: FoodLog[]): number {
  const dates = [...new Set(logs.map((l) => l.log_date))].sort();
  let best = 0;
  let run = 0;
  let prev: DateStr | null = null;
  for (const d of dates) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Categories sorted by how many days they were recorded on. */
export function rankCategories(categoryDays: Record<string, number>): { key: string; days: number }[] {
  return Object.entries(categoryDays)
    .map(([key, days]) => ({ key, days }))
    .sort((a, b) => b.days - a.days || a.key.localeCompare(b.key));
}
