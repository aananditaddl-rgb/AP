import { monthLabel, type DateStr } from "@/lib/engine/dates";
import { monthReport } from "@/lib/engine/report";
import { rankCategories } from "@/lib/engine/stats";
import type { Category, FoodLog, Goal, GoalException, ProgressStatus } from "@/lib/engine/types";

/** The shareable "Food Habit Recap" — highlights only, never the full log. */
export interface Recap {
  month: DateStr;
  title: string;
  inProgress: boolean;
  meals: number;
  cheatDays: number;
  loggedDays: number;
  elapsedDays: number;
  loggingRate: number;
  longestCleanRun: number;
  topCategory: { label: string; emoji: string; days: number } | null;
  goal: { used: number; allowance: number; status: ProgressStatus } | null;
  /** Change in cheat meals vs the previous month (negative = fewer), null if no data. */
  change: number | null;
}

export function buildRecap(
  month: DateStr, logs: FoodLog[], goals: Goal[], exceptions: GoalException[], today: DateStr, categories: Category[],
): Recap {
  const byKey = new Map(categories.map((c) => [c.key, c]));
  const r = monthReport(month, logs, goals, exceptions, today, (k) => byKey.get(k)?.label ?? k);
  const top = rankCategories(r.summary.categoryDays)[0];
  const prev = r.inProgress ? r.previousSamePoint : r.previous;
  return {
    month: r.month,
    title: monthLabel(r.month),
    inProgress: r.inProgress,
    meals: r.summary.meals,
    cheatDays: r.summary.cheatDays,
    loggedDays: r.summary.loggedDays,
    elapsedDays: r.summary.elapsedDays,
    loggingRate: r.summary.loggingRate,
    longestCleanRun: r.summary.longestCleanRun,
    topCategory: top ? { label: byKey.get(top.key)?.label ?? top.key, emoji: byKey.get(top.key)?.emoji ?? "🍽️", days: top.days } : null,
    goal: r.goal ? { used: r.goal.used, allowance: r.goal.allowance, status: r.goal.status } : null,
    change: prev.loggedDays > 0 ? r.summary.meals - prev.meals : null,
  };
}

export function recapGoalLine(g: Recap["goal"]): string {
  if (!g) return "No goal this month";
  if (g.status === "over") return `${g.used - g.allowance} over a ${g.allowance}-meal allowance`;
  return `${g.used} of ${g.allowance} allowed · within goal`;
}

export function recapChangeLine(change: number | null, inProgress: boolean): string | null {
  if (change === null) return null;
  const when = inProgress ? "than this point last month" : "than last month";
  if (change === 0) return `Same as ${inProgress ? "this point " : ""}last month`;
  return `${Math.abs(change)} ${change < 0 ? "fewer" : "more"} ${when}`;
}
