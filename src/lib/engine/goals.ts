// Goal & allowance engine. Mirrors public.day_allowance / public.goal_window in
// the database so friends see the same numbers you do.
//
// One rule everywhere: allowances accrue per day.
//   daily            → allowance each day
//   weekly           → allowance / 7 each day (weeks run Monday–Sunday)
//   monthly          → allowance / days-in-month each day (calendar months)
//   weekday_schedule → schedule[weekday] each day
//   period_total     → allowance / period length each day
// An active exception (vacation, birthday…) replaces the goal's allowance on its
// dates. A window's allowance is the rounded sum of its days, so partial weeks
// or months at the edges of a goal are prorated fairly.

import {
  addDays, daysBetween, daysInMonth, eachDay, endOfMonth, endOfWeek, maxDate, minDate,
  monthName, mediumDate, startOfMonth, startOfWeek, weekdayIndex, weekdayShort,
  type DateStr,
} from "./dates";
import type { FoodLog, Goal, GoalException, ProgressStatus } from "./types";

const FAR_FUTURE = "9999-12-31";

/** Rounds a summed allowance; the epsilon absorbs floating-point drift. */
export function roundAllowance(x: number): number {
  return Math.round(x + 1e-9);
}

/** Last day a goal applies to (null = open-ended), or null range if cancelled. */
export function effectiveEnd(goal: Goal): DateStr | null {
  if (goal.status === "cancelled") return addDays(goal.start_date, -1);
  let end = goal.end_date;
  if (goal.status === "paused" && goal.paused_from) {
    const pausedEnd = addDays(goal.paused_from, -1);
    end = end ? minDate(end, pausedEnd) : pausedEnd;
  }
  return end;
}

export function goalCovers(goal: Goal, day: DateStr): boolean {
  if (goal.status === "cancelled") return false;
  return day >= goal.start_date && day <= (effectiveEnd(goal) ?? FAR_FUTURE);
}

export function goalForDay(goals: Goal[], day: DateStr): Goal | null {
  let best: Goal | null = null;
  for (const g of goals) {
    if (goalCovers(g, day) && (!best || g.created_at > best.created_at)) best = g;
  }
  return best;
}

export function exceptionForDay(exceptions: GoalException[], day: DateStr): GoalException | null {
  return (
    exceptions.find((e) => e.status === "active" && day >= e.start_date && day <= e.end_date) ?? null
  );
}

/** The user's current goal (active or paused), if any. */
export function currentGoal(goals: Goal[]): Goal | null {
  return goals.find((g) => g.status === "active" || g.status === "paused") ?? null;
}

function goalDayRate(goal: Goal, day: DateStr): number {
  switch (goal.goal_type) {
    case "daily":
      return goal.allowance;
    case "weekly":
      return goal.allowance / 7;
    case "monthly":
      return goal.allowance / daysInMonth(day);
    case "weekday_schedule":
      return goal.schedule?.[weekdayIndex(day)] ?? 0;
    case "period_total":
      return goal.allowance / daysBetween(goal.start_date, goal.end_date ?? goal.start_date);
  }
}

/** Allowance accrued on one day, or null when no goal or exception applies. */
export function dayAllowance(goals: Goal[], exceptions: GoalException[], day: DateStr): number | null {
  const ex = exceptionForDay(exceptions, day);
  if (ex) {
    return ex.rule === "per_day" ? ex.allowance : ex.allowance / daysBetween(ex.start_date, ex.end_date);
  }
  const goal = goalForDay(goals, day);
  return goal ? goalDayRate(goal, day) : null;
}

export interface AllowanceSum {
  /** Rounded allowance over the days that have a goal or exception. */
  allowance: number;
  /** Number of days in the range covered by a goal or exception. */
  coveredDays: number;
}

export function sumAllowance(
  goals: Goal[], exceptions: GoalException[], from: DateStr, to: DateStr,
): AllowanceSum {
  let total = 0;
  let coveredDays = 0;
  for (const d of eachDay(from, to)) {
    const a = dayAllowance(goals, exceptions, d);
    if (a !== null) {
      total += a;
      coveredDays++;
    }
  }
  return { allowance: roundAllowance(total), coveredDays };
}

export function mealsBetween(logs: FoodLog[], from: DateStr, to: DateStr): number {
  let n = 0;
  for (const l of logs) if (l.log_date >= from && l.log_date <= to) n += l.meal_count;
  return n;
}

export function progressStatus(used: number, allowance: number): ProgressStatus {
  if (used > allowance) return "over";
  if (used === allowance && allowance > 0) return "reached";
  return "within";
}

export interface Window {
  start: DateStr;
  end: DateStr;
}

/** The goal's evaluation window containing `day`, clipped to the goal's dates. */
export function goalWindow(goal: Goal, day: DateStr): Window {
  let start: DateStr;
  let end: DateStr;
  switch (goal.goal_type) {
    case "daily":
      start = day;
      end = day;
      break;
    case "weekly":
    case "weekday_schedule":
      start = startOfWeek(day);
      end = endOfWeek(day);
      break;
    case "monthly":
      start = startOfMonth(day);
      end = endOfMonth(day);
      break;
    case "period_total":
      start = goal.start_date;
      end = goal.end_date ?? goal.start_date;
      break;
  }
  return {
    start: maxDate(start, goal.start_date),
    end: minDate(end, effectiveEnd(goal) ?? FAR_FUTURE),
  };
}

export function windowLabel(goal: Goal, win: Window, today: DateStr): string {
  const current = today >= win.start && today <= win.end;
  switch (goal.goal_type) {
    case "daily":
      return current ? "Today" : mediumDate(win.start);
    case "weekly":
    case "weekday_schedule":
      return current ? "This week" : `Week of ${mediumDate(startOfWeek(win.start))}`;
    case "monthly":
      return `${monthName(win.start)} goal`;
    case "period_total":
      return "Goal period";
  }
}

export interface Progress {
  label: string;
  start: DateStr;
  end: DateStr;
  allowance: number;
  used: number;
  remaining: number;
  /** Share of the allowance used, 0–100+ (can exceed 100). */
  pctUsed: number;
  status: ProgressStatus;
  /** Days left in the window including today (0 once the window is over). */
  daysLeft: number;
}

function buildProgress(
  label: string, win: Window, allowance: number, used: number, today: DateStr,
): Progress {
  const daysLeft = today > win.end ? 0 : daysBetween(maxDate(today, win.start), win.end);
  return {
    label,
    start: win.start,
    end: win.end,
    allowance,
    used,
    remaining: Math.max(0, allowance - used),
    pctUsed: allowance > 0 ? Math.round((used / allowance) * 100) : used > 0 ? 100 : 0,
    status: progressStatus(used, allowance),
    daysLeft,
  };
}

/** Progress in the goal window that contains `day` (usually today). */
export function windowProgress(
  goal: Goal, goals: Goal[], exceptions: GoalException[], logs: FoodLog[],
  day: DateStr, today: DateStr,
): Progress {
  const win = goalWindow(goal, day);
  const { allowance } = sumAllowance(goals, exceptions, win.start, win.end);
  const used = mealsBetween(logs, win.start, minDate(win.end, today));
  return buildProgress(windowLabel(goal, win, today), win, allowance, used, today);
}

/** Progress over the whole goal period. Null for open-ended goals. */
export function periodProgress(
  goal: Goal, goals: Goal[], exceptions: GoalException[], logs: FoodLog[], today: DateStr,
): Progress | null {
  const end = effectiveEnd(goal);
  if (!end || end < goal.start_date) return null;
  const win = { start: goal.start_date, end };
  const { allowance } = sumAllowance(goals, exceptions, win.start, win.end);
  const used = mealsBetween(logs, win.start, minDate(win.end, today));
  return buildProgress("Whole goal", win, allowance, used, today);
}

/** All of a goal's windows that have fully finished on or before `today`. */
export function completedWindows(goal: Goal, today: DateStr): Window[] {
  const end = effectiveEnd(goal);
  const last = minDate(end ?? FAR_FUTURE, addDays(today, -1));
  const out: Window[] = [];
  let d = goal.start_date;
  while (d <= last) {
    const w = goalWindow(goal, d);
    if (w.end <= last) out.push(w);
    d = addDays(w.end, 1);
  }
  return out;
}

export type GoalPhase = "scheduled" | "active" | "paused" | "completed" | "ended" | "cancelled";

export function goalPhase(goal: Goal, today: DateStr): GoalPhase {
  if (goal.status === "cancelled") return "cancelled";
  if (goal.status === "ended") return "ended";
  if (goal.status === "paused") return "paused";
  if (goal.start_date > today) return "scheduled";
  if (goal.end_date && goal.end_date < today) return "completed";
  return "active";
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function describeAllowance(goal: Pick<Goal, "goal_type" | "allowance" | "schedule">): string {
  const meals = plural(goal.allowance, "cheat meal");
  switch (goal.goal_type) {
    case "daily":
      return `Up to ${meals} a day`;
    case "weekly":
      return `Up to ${meals} a week`;
    case "monthly":
      return `Up to ${meals} a month`;
    case "period_total":
      return `Up to ${meals} in total`;
    case "weekday_schedule": {
      const days = (goal.schedule ?? [])
        .map((n, i) => (n > 0 ? `${weekdayShort(i)} ${n}` : null))
        .filter(Boolean);
      return days.length
        ? `Weekly plan: ${days.join(", ")}`
        : "No cheat meals planned on any day";
    }
  }
}

export function describeDuration(goal: Pick<Goal, "start_date" | "end_date">): string {
  if (!goal.end_date) return `From ${mediumDate(goal.start_date)}, ongoing`;
  const days = daysBetween(goal.start_date, goal.end_date);
  return `${mediumDate(goal.start_date)} – ${mediumDate(goal.end_date)} (${plural(days, "day")})`;
}

export const OCCASIONS: { value: GoalException["occasion"]; label: string; emoji: string }[] = [
  { value: "vacation", label: "Vacation", emoji: "🏖️" },
  { value: "birthday", label: "Birthday", emoji: "🎂" },
  { value: "wedding", label: "Wedding", emoji: "💍" },
  { value: "festival", label: "Festival", emoji: "🪔" },
  { value: "holiday", label: "Holiday", emoji: "🎄" },
  { value: "celebration", label: "Celebration", emoji: "🎉" },
  { value: "other", label: "Special occasion", emoji: "✨" },
];

export function occasionMeta(o: GoalException["occasion"]) {
  return OCCASIONS.find((x) => x.value === o) ?? OCCASIONS[OCCASIONS.length - 1];
}

export function exceptionTitle(e: Pick<GoalException, "occasion" | "label">): string {
  return e.label?.trim() || occasionMeta(e.occasion).label;
}

export function describeException(e: GoalException): string {
  const days = daysBetween(e.start_date, e.end_date);
  const rule =
    e.rule === "per_day"
      ? `up to ${plural(e.allowance, "cheat meal")} a day`
      : `up to ${plural(e.allowance, "cheat meal")} in total`;
  return `${mediumDate(e.start_date)} – ${mediumDate(e.end_date)} (${plural(days, "day")}): ${rule}`;
}
