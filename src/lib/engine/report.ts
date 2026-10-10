// Monthly report: summary, goal performance, comparisons and factual insights.

import {
  addDays, addMonths, daysBetween, endOfMonth, maxDate, minDate, monthName, startOfMonth,
  weekdayLong, type DateStr,
} from "./dates";
import {
  completedWindows, effectiveEnd, exceptionTitle, goalForDay, mealsBetween, progressStatus,
  sumAllowance, dayAllowance,
} from "./goals";
import { rankCategories, summarize, type RangeSummary } from "./stats";
import type { FoodLog, Goal, GoalException, ProgressStatus } from "./types";

export interface GoalPerformance {
  /** Allowance for the days of the month that had a goal or exception. */
  allowance: number;
  /** Cheat meals on those covered days (so far, if the month is in progress). */
  used: number;
  remaining: number;
  status: ProgressStatus;
  coveredDays: number;
  /** For daily/weekly goals: finished windows in this month and how many stayed within. */
  windows: { kind: "day" | "week"; total: number; within: number } | null;
  exceptions: GoalException[];
}

export interface MonthReport {
  month: DateStr; // first day of month
  monthEnd: DateStr;
  inProgress: boolean;
  isFuture: boolean;
  summary: RangeSummary;
  /** Previous month in full. */
  previous: RangeSummary;
  /** Previous month up to the same day-of-month (only meaningful while in progress). */
  previousSamePoint: RangeSummary;
  goal: GoalPerformance | null;
  goalStatements: string[];
  insights: Insight[];
}

export interface Insight {
  icon: string;
  text: string;
}

export type CategoryLabeler = (key: string) => string;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function coveredMeals(
  logs: FoodLog[], goals: Goal[], exceptions: GoalException[], from: DateStr, to: DateStr,
): number {
  let n = 0;
  for (const l of logs) {
    if (l.log_date < from || l.log_date > to) continue;
    if (dayAllowance(goals, exceptions, l.log_date) !== null) n += l.meal_count;
  }
  return n;
}

export function goalPerformance(
  logs: FoodLog[], goals: Goal[], exceptions: GoalException[],
  from: DateStr, to: DateStr, today: DateStr,
): GoalPerformance | null {
  const { allowance, coveredDays } = sumAllowance(goals, exceptions, from, to);
  if (coveredDays === 0) return null;
  const used = coveredMeals(logs, goals, exceptions, from, minDate(to, today));

  // Finished day/week windows that ended inside this range.
  let windows: GoalPerformance["windows"] = null;
  for (const g of goals) {
    if (g.status === "cancelled") continue;
    if (g.goal_type !== "daily" && g.goal_type !== "weekly" && g.goal_type !== "weekday_schedule") continue;
    const end = effectiveEnd(g);
    if (g.start_date > to || (end && end < from)) continue;
    const kind = g.goal_type === "daily" ? "day" : "week";
    for (const w of completedWindows(g, today)) {
      if (w.end < from || w.end > to) continue;
      const a = sumAllowance(goals, exceptions, w.start, w.end).allowance;
      const u = mealsBetween(logs, w.start, w.end);
      windows ??= { kind, total: 0, within: 0 };
      windows.total++;
      if (u <= a) windows.within++;
    }
  }

  const monthExceptions = exceptions.filter(
    (e) => e.status === "active" && e.start_date <= to && e.end_date >= from,
  );

  return {
    allowance,
    used,
    remaining: Math.max(0, allowance - used),
    status: progressStatus(used, allowance),
    coveredDays,
    windows,
    exceptions: monthExceptions,
  };
}

function goalStatements(r: Omit<MonthReport, "goalStatements" | "insights">): string[] {
  const out: string[] = [];
  const g = r.goal;
  if (g) {
    const soFar = r.inProgress ? " so far" : "";
    if (g.status === "over") {
      out.push(`You went over your allowance by ${plural(g.used - g.allowance, "cheat meal")}${soFar}.`);
    } else if (r.inProgress) {
      out.push(`You've used ${g.used} of your ${plural(g.allowance, "allotted cheat meal")} so far.`);
    } else {
      out.push(`You stayed within your allowance, using ${g.used} of ${plural(g.allowance, "cheat meal")}.`);
    }
    if (g.windows && g.windows.total > 0) {
      const unit = g.windows.kind === "day" ? "day" : "week";
      out.push(`You stayed within your ${unit === "day" ? "daily" : "weekly"} allowance in ${g.windows.within} of ${plural(g.windows.total, `finished ${unit}`)}.`);
    }
    for (const e of g.exceptions) {
      out.push(`Includes your adjusted allowance for ${exceptionTitle(e)}.`);
    }
  }
  if (r.summary.elapsedDays > 0) {
    out.push(`You logged your food intake on ${r.summary.loggingRate}% of the days${r.inProgress ? " so far" : ""} this month.`);
  }
  const prev = r.inProgress ? r.previousSamePoint : r.previous;
  if (prev.loggedDays > 0 && r.summary.loggedDays > 0) {
    const when = r.inProgress ? "at this point last month" : "last month";
    if (r.summary.meals < prev.meals) out.push(`You recorded fewer cheat meals than ${when}.`);
    else if (r.summary.meals > prev.meals) out.push(`You recorded more cheat meals than ${when}.`);
    else out.push(`You recorded the same number of cheat meals as ${when}.`);
  }
  return out;
}

export function buildInsights(
  r: Pick<MonthReport, "summary" | "previous" | "previousSamePoint" | "inProgress">,
  label: CategoryLabeler,
): Insight[] {
  const s = r.summary;
  const out: Insight[] = [];
  if (s.loggedDays === 0) return out;

  // Weekend vs weekday
  const weekend = s.weekdayMeals[5] + s.weekdayMeals[6];
  if (s.meals >= 3) {
    if (weekend / s.meals > 0.5) {
      out.push({ icon: "📅", text: "Most of your recorded cheat meals were on weekends." });
    } else if (weekend / s.meals < 0.2) {
      out.push({ icon: "📅", text: "Most of your recorded cheat meals were on weekdays." });
    }
  }

  // Most common weekday
  const max = Math.max(...s.weekdayMeals);
  if (max >= 2 && s.weekdayMeals.filter((n) => n === max).length === 1) {
    const day = s.weekdayMeals.indexOf(max);
    out.push({ icon: "🗓️", text: `${weekdayLong(day)} was your most common cheat-meal day (${plural(max, "meal")}).` });
  }

  // Month over month
  const prev = r.inProgress ? r.previousSamePoint : r.previous;
  if (prev.loggedDays > 0 && s.meals !== prev.meals) {
    out.push({
      icon: s.meals < prev.meals ? "📉" : "📈",
      text: r.inProgress
        ? `${plural(Math.abs(s.meals - prev.meals), "cheat meal")} ${s.meals < prev.meals ? "fewer" : "more"} than at this point last month.`
        : `Your cheat meal count went from ${prev.meals} last month to ${s.meals} this month.`,
    });
  }

  // Top category
  const ranked = rankCategories(s.categoryDays);
  if (ranked.length && ranked[0].days >= 2 && (ranked.length === 1 || ranked[0].days > ranked[1].days)) {
    out.push({
      icon: "🍽️",
      text: `You recorded ${label(ranked[0].key).toLowerCase()} more often than any other category (${plural(ranked[0].days, "day")}).`,
    });
  }

  // Logging consistency
  if (s.elapsedDays >= 7) {
    if (s.loggingRate >= 90) {
      out.push({ icon: "✅", text: `You logged your food intake consistently — ${s.loggingRate}% of days.` });
    } else if (s.loggingRate < 50) {
      out.push({
        icon: "📝",
        text: `You logged ${s.loggedDays} of ${s.elapsedDays} days. Logging more days gives you a clearer picture.`,
      });
    }
  }

  if (s.longestCleanRun >= 3) {
    out.push({ icon: "🌱", text: `Your longest stretch without a cheat meal was ${s.longestCleanRun} logged days.` });
  }
  return out;
}

export function monthReport(
  month: DateStr, logs: FoodLog[], goals: Goal[], exceptions: GoalException[],
  today: DateStr, label: CategoryLabeler,
): MonthReport {
  const start = startOfMonth(month);
  const end = endOfMonth(start);
  const prevStart = addMonths(start, -1);
  const prevEnd = endOfMonth(prevStart);
  const summary = summarize(logs, start, end, today);
  const samePointEnd = minDate(prevEnd, addDays(prevStart, Math.max(summary.elapsedDays, 1) - 1));

  const base = {
    month: start,
    monthEnd: end,
    inProgress: today >= start && today <= end,
    isFuture: start > today,
    summary,
    previous: summarize(logs, prevStart, prevEnd, today),
    previousSamePoint: summarize(logs, prevStart, samePointEnd, today),
    goal: goalPerformance(logs, goals, exceptions, start, end, today),
  };
  return { ...base, goalStatements: goalStatements(base), insights: buildInsights(base, label) };
}

export interface MonthPoint {
  month: DateStr;
  label: string;
  meals: number;
  cheatDays: number;
  loggedDays: number;
  elapsedDays: number;
  allowance: number | null;
  status: ProgressStatus | null;
}

/** The last `count` months ending with the month containing `endMonth`. */
export function monthSeries(
  endMonth: DateStr, count: number, logs: FoodLog[], goals: Goal[], exceptions: GoalException[],
  today: DateStr,
): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = addMonths(startOfMonth(endMonth), -i);
    const end = endOfMonth(start);
    const s = summarize(logs, start, end, today);
    const perf = start <= today ? goalPerformance(logs, goals, exceptions, start, end, today) : null;
    out.push({
      month: start,
      label: monthName(start).slice(0, 3),
      meals: s.meals,
      cheatDays: s.cheatDays,
      loggedDays: s.loggedDays,
      elapsedDays: s.elapsedDays,
      allowance: perf?.allowance ?? null,
      status: perf?.status ?? null,
    });
  }
  return out;
}

/** Direction of cheat meals per logged day across the series' months with data. */
export function frequencyTrend(series: MonthPoint[]): "less" | "more" | null {
  const rates = series.filter((p) => p.loggedDays >= 5).map((p) => p.meals / p.loggedDays);
  if (rates.length < 3) return null;
  const last3 = rates.slice(-3);
  if (last3[0] > last3[1] && last3[1] > last3[2]) return "less";
  if (last3[0] < last3[1] && last3[1] < last3[2]) return "more";
  return null;
}

export interface GoalResult {
  goal: Goal;
  start: DateStr;
  end: DateStr;
  allowance: number;
  used: number;
  loggedDays: number;
  days: number;
  status: ProgressStatus;
  finished: boolean;
}

/** How a goal went over its (elapsed) life, for comparing goal periods. */
export function goalResult(
  goal: Goal, logs: FoodLog[], goals: Goal[], exceptions: GoalException[], today: DateStr,
): GoalResult | null {
  const effEnd = effectiveEnd(goal);
  if (goal.status === "cancelled" || (effEnd && effEnd < goal.start_date) || goal.start_date > today) {
    return null;
  }
  const end = effEnd ?? today;
  const last = minDate(end, today);
  // Allowance only for days this goal (or an exception during it) governed.
  let total = 0;
  for (let d = goal.start_date; d <= end; d = addDays(d, 1)) {
    const owner = goalForDay(goals, d);
    if (owner?.id !== goal.id) continue;
    total += dayAllowance(goals, exceptions, d) ?? 0;
  }
  const s = summarize(logs, goal.start_date, last, today);
  const allowance = Math.round(total + 1e-9);
  return {
    goal,
    start: goal.start_date,
    end,
    allowance,
    used: s.meals,
    loggedDays: s.loggedDays,
    days: daysBetween(goal.start_date, maxDate(goal.start_date, last)),
    status: progressStatus(s.meals, allowance),
    finished: end < today,
  };
}
