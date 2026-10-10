import "server-only";
import { addDays, type DateStr } from "@/lib/engine/dates";
import { completedWindows, currentGoal, mealsBetween, sumAllowance } from "@/lib/engine/goals";
import { loggingStreak } from "@/lib/engine/stats";
import type { FoodLog, Goal, GoalException } from "@/lib/engine/types";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const STREAK_MILESTONES = [7, 14, 30, 60, 100, 180, 365];

/** Post an activity once (dedupe_key makes repeats a no-op). */
export async function postActivity(
  supabase: Supabase, userId: string, kind: string, payload: Record<string, unknown>, dedupeKey: string,
) {
  await supabase
    .from("activities")
    .upsert({ user_id: userId, kind, payload, dedupe_key: dedupeKey }, {
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true,
    });
}

/** Feed updates that follow from logging: today's check-in, streaks, goals met. */
export async function activitiesAfterLogging(
  supabase: Supabase, userId: string, today: DateStr, loggedDate: DateStr,
  logs: FoodLog[], goals: Goal[], exceptions: GoalException[],
) {
  if (loggedDate === today) {
    await postActivity(supabase, userId, "logged", { date: today }, `logged:${today}`);
  }

  const streak = loggingStreak(logs, today);
  const milestone = [...STREAK_MILESTONES].reverse().find((m) => streak >= m);
  if (milestone) {
    const streakStart = addDays(logs.some((l) => l.log_date === today) ? today : addDays(today, -1), -(streak - 1));
    await postActivity(supabase, userId, "streak", { days: milestone }, `streak:${milestone}:${streakStart}`);
  }

  // A recently finished week/month/period that stayed within its allowance.
  const goal = currentGoal(goals) ?? goals.find((g) => g.status === "active");
  if (goal && goal.goal_type !== "daily") {
    const last = completedWindows(goal, today).at(-1);
    if (last && last.end >= addDays(today, -7)) {
      const logged = logs.some((l) => l.log_date >= last.start && l.log_date <= last.end);
      const { allowance } = sumAllowance(goals, exceptions, last.start, last.end);
      const used = mealsBetween(logs, last.start, last.end);
      if (logged && used <= allowance) {
        await postActivity(supabase, userId, "goal_met",
          { goal_type: goal.goal_type, start: last.start, end: last.end },
          `goal_met:${goal.id}:${last.start}`);
      }
    }
  }
}
