"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getGoals, requireViewer } from "@/lib/data";
import { addDays, daysBetween, isValidDateStr, maxDate, minDate } from "@/lib/engine/dates";
import { currentGoal, describeAllowance, exceptionTitle, goalCovers, OCCASIONS } from "@/lib/engine/goals";
import type { Goal, GoalException, GoalType } from "@/lib/engine/types";
import { postActivity } from "@/lib/activity";

export type GoalActionResult = { ok: true } | { ok: false; error: string };

export interface GoalInput {
  goalType: GoalType;
  allowance: number;
  schedule?: number[] | null;
  startDate: string;
  endDate: string | null;
}

const GOAL_TYPES: GoalType[] = ["daily", "weekly", "monthly", "weekday_schedule", "period_total"];

function validateGoal(input: GoalInput, today: string, { checkStart }: { checkStart: boolean }):
  { ok: true; value: Omit<Goal, "id" | "status" | "paused_from" | "created_at"> } | { ok: false; error: string } {
  if (!GOAL_TYPES.includes(input.goalType)) return { ok: false, error: "Choose a goal type." };
  if (!isValidDateStr(input.startDate)) return { ok: false, error: "Choose a start date." };
  if (checkStart && input.startDate < addDays(today, -366)) {
    return { ok: false, error: "Goals can start at most a year in the past." };
  }
  if (input.endDate !== null && !isValidDateStr(input.endDate)) return { ok: false, error: "Choose an end date." };
  if (input.endDate && input.endDate < input.startDate) return { ok: false, error: "The end date must be after the start date." };
  if (input.endDate && daysBetween(input.startDate, input.endDate) > 3 * 366) {
    return { ok: false, error: "Goal periods can be up to 3 years long." };
  }
  if (input.goalType === "period_total" && !input.endDate) {
    return { ok: false, error: "A total-allowance goal needs an end date." };
  }

  let schedule: number[] | null = null;
  let allowance = Number(input.allowance);
  if (input.goalType === "weekday_schedule") {
    schedule = (input.schedule ?? []).map(Number);
    if (schedule.length !== 7 || schedule.some((n) => !Number.isInteger(n) || n < 0 || n > 20)) {
      return { ok: false, error: "Set 0–20 cheat meals for each day of the week." };
    }
    allowance = schedule.reduce((a, b) => a + b, 0);
  } else if (!Number.isInteger(allowance) || allowance < 0 || allowance > 500) {
    return { ok: false, error: "Choose an allowance between 0 and 500." };
  }

  return {
    ok: true,
    value: {
      goal_type: input.goalType, allowance, schedule,
      start_date: input.startDate, end_date: input.endDate,
    },
  };
}

/** Close a goal on `lastDay`, or cancel it if it never got going. */
function closingPatch(goal: Goal, lastDay: string): Partial<Goal> {
  if (goal.status === "paused" && goal.paused_from) lastDay = minDate(lastDay, addDays(goal.paused_from, -1));
  const effLast = goal.end_date ? minDate(goal.end_date, lastDay) : lastDay;
  if (effLast < goal.start_date) return { status: "cancelled", paused_from: null };
  return { status: "ended", end_date: effLast, paused_from: null };
}

function done(): GoalActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Start a new goal. Any current goal ends the day before (its history is kept). */
export async function createGoal(input: GoalInput): Promise<GoalActionResult> {
  const viewer = await requireViewer();
  const v = validateGoal(input, viewer.today, { checkStart: true });
  if (!v.ok) return v;
  const supabase = await createClient();
  const goals = await getGoals();
  const existing = currentGoal(goals);
  // Back-dating is only allowed over days no earlier goal tracked, so history never changes.
  if (v.value.start_date < viewer.today) {
    for (let d = v.value.start_date; d < viewer.today; d = addDays(d, 1)) {
      if (goals.some((g) => goalCovers(g, d))) {
        return { ok: false, error: "That start date overlaps an earlier goal. Start from today instead." };
      }
    }
  }

  if (existing) {
    const patch = closingPatch(existing, addDays(v.value.start_date, -1));
    const { error } = await supabase.from("goals").update(patch).eq("id", existing.id);
    if (error) return { ok: false, error: "Couldn't update your previous goal." };
  }
  const { error } = await supabase.from("goals").insert({
    ...v.value, user_id: viewer.id, previous_goal_id: existing?.id ?? null,
  });
  if (error) return { ok: false, error: "Couldn't save your goal. Please try again." };

  await postActivity(supabase, viewer.id, "goal_started",
    { text: describeAllowance(v.value) }, `goal_started:${Date.now()}`);
  return done();
}

/**
 * Change the current goal. Changing only the end date edits it in place.
 * Changing the allowance of a goal that has already been running creates a new
 * version from today, so past days keep the rules they were tracked under.
 */
export async function updateGoal(input: GoalInput): Promise<GoalActionResult> {
  const viewer = await requireViewer();
  const goal = currentGoal(await getGoals());
  if (!goal) return { ok: false, error: "You don't have a current goal to edit." };
  const today = viewer.today;

  const started = goal.start_date < today;
  const startDate = started ? goal.start_date : input.startDate;
  const v = validateGoal({ ...input, startDate }, today, { checkStart: !started });
  if (!v.ok) return v;
  if (started && v.value.end_date && v.value.end_date < addDays(today, -1)) {
    return { ok: false, error: "The end date can't be earlier than yesterday." };
  }

  const ruleChanged = goal.goal_type !== v.value.goal_type || goal.allowance !== v.value.allowance ||
    JSON.stringify(goal.schedule) !== JSON.stringify(v.value.schedule);
  const supabase = await createClient();

  if (!ruleChanged || !started) {
    const { error } = await supabase.from("goals").update({
      goal_type: v.value.goal_type, allowance: v.value.allowance, schedule: v.value.schedule,
      start_date: v.value.start_date, end_date: v.value.end_date,
    }).eq("id", goal.id);
    if (error) return { ok: false, error: "Couldn't update your goal." };
  } else {
    // Version it: the old rules cover up to yesterday, the new ones start today.
    if (v.value.end_date && v.value.end_date < today) {
      return { ok: false, error: "To change the allowance, the goal needs to run until at least today." };
    }
    const wasPaused = goal.status === "paused";
    const { error: e1 } = await supabase.from("goals")
      .update(closingPatch(goal, addDays(today, -1))).eq("id", goal.id);
    if (e1) return { ok: false, error: "Couldn't update your goal." };
    const { error: e2 } = await supabase.from("goals").insert({
      ...v.value, start_date: today, user_id: viewer.id, previous_goal_id: goal.id,
      status: wasPaused ? "paused" : "active", paused_from: wasPaused ? today : null,
    });
    if (e2) return { ok: false, error: "Couldn't save the new allowance." };
  }

  await postActivity(supabase, viewer.id, "goal_updated",
    { text: describeAllowance(v.value) }, `goal_updated:${Date.now()}`);
  return done();
}

export async function pauseGoal(): Promise<GoalActionResult> {
  const viewer = await requireViewer();
  const goal = currentGoal(await getGoals());
  if (!goal || goal.status !== "active") return { ok: false, error: "There's no active goal to pause." };
  if (goal.start_date > viewer.today) return { ok: false, error: "This goal hasn't started yet." };
  const supabase = await createClient();
  const { error } = await supabase.from("goals")
    .update({ status: "paused", paused_from: viewer.today }).eq("id", goal.id);
  if (error) return { ok: false, error: "Couldn't pause your goal." };
  return done();
}

/** Resume a paused goal. The paused stretch stays out of the goal's history. */
export async function resumeGoal(): Promise<GoalActionResult> {
  const viewer = await requireViewer();
  const goal = currentGoal(await getGoals());
  if (!goal || goal.status !== "paused" || !goal.paused_from) return { ok: false, error: "Your goal isn't paused." };
  const supabase = await createClient();
  const today = viewer.today;

  if (goal.paused_from >= today) {
    const { error } = await supabase.from("goals").update({ status: "active", paused_from: null }).eq("id", goal.id);
    return error ? { ok: false, error: "Couldn't resume your goal." } : done();
  }
  const { error: e1 } = await supabase.from("goals").update(closingPatch(goal, today)).eq("id", goal.id);
  if (e1) return { ok: false, error: "Couldn't resume your goal." };
  if (goal.end_date && goal.end_date < today) return done(); // the period is already over
  const { error: e2 } = await supabase.from("goals").insert({
    user_id: viewer.id, goal_type: goal.goal_type, allowance: goal.allowance, schedule: goal.schedule,
    start_date: today, end_date: goal.end_date, previous_goal_id: goal.id,
  });
  return e2 ? { ok: false, error: "Couldn't resume your goal." } : done();
}

export async function endGoal(): Promise<GoalActionResult> {
  const viewer = await requireViewer();
  const goal = currentGoal(await getGoals());
  if (!goal) return { ok: false, error: "There's no current goal." };
  const supabase = await createClient();
  const { error } = await supabase.from("goals").update(closingPatch(goal, viewer.today)).eq("id", goal.id);
  return error ? { ok: false, error: "Couldn't end your goal." } : done();
}

// ---------------------------------------------------------------------------
// Special-occasion exceptions
// ---------------------------------------------------------------------------

export interface ExceptionInput {
  occasion: GoalException["occasion"];
  label?: string;
  startDate: string;
  endDate: string;
  rule: GoalException["rule"];
  allowance: number;
  note?: string;
}

function overlapError(message: string) {
  return /no_overlap|exclusion/i.test(message)
    ? "These dates overlap another special occasion. Adjust or cancel that one first."
    : "Couldn't save. Please try again.";
}

export async function createException(input: ExceptionInput): Promise<GoalActionResult> {
  const viewer = await requireViewer();
  if (!OCCASIONS.some((o) => o.value === input.occasion)) return { ok: false, error: "Choose an occasion." };
  if (!isValidDateStr(input.startDate) || !isValidDateStr(input.endDate)) return { ok: false, error: "Choose the dates." };
  if (input.endDate < input.startDate) return { ok: false, error: "The end date must be on or after the start date." };
  if (daysBetween(input.startDate, input.endDate) > 366) return { ok: false, error: "Special occasions can last up to a year." };
  if (input.endDate < addDays(viewer.today, -60)) return { ok: false, error: "That's too far in the past to adjust." };
  if (input.rule !== "per_day" && input.rule !== "total") return { ok: false, error: "Choose how the allowance works." };
  const allowance = Number(input.allowance);
  if (!Number.isInteger(allowance) || allowance < 0 || allowance > 200) return { ok: false, error: "Choose an allowance between 0 and 200." };

  const goal = currentGoal(await getGoals());
  const supabase = await createClient();
  const row = {
    user_id: viewer.id, goal_id: goal?.id ?? null, occasion: input.occasion,
    label: input.label?.trim().slice(0, 60) || null, start_date: input.startDate, end_date: input.endDate,
    rule: input.rule, allowance, note: input.note?.trim().slice(0, 280) || null,
  };
  const { error } = await supabase.from("goal_exceptions").insert(row);
  if (error) return { ok: false, error: overlapError(error.message) };

  await postActivity(supabase, viewer.id, "exception",
    { occasion: row.occasion, title: exceptionTitle(row), start: row.start_date, end: row.end_date },
    `exception:${row.start_date}:${Date.now()}`);
  return done();
}

async function getOwnException(id: string): Promise<GoalException | null> {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase.from("goal_exceptions").select("*").eq("id", id).eq("user_id", viewer.id).maybeSingle();
  return (data as GoalException) ?? null;
}

/** Extend or shorten an exception. Days that have already passed stay as they were. */
export async function updateExceptionDates(
  id: string, startDate: string, endDate: string, allowance?: number,
): Promise<GoalActionResult> {
  const viewer = await requireViewer();
  const ex = await getOwnException(id);
  if (!ex || ex.status !== "active") return { ok: false, error: "Special occasion not found." };
  if (!isValidDateStr(startDate) || !isValidDateStr(endDate)) return { ok: false, error: "Choose the dates." };
  const today = viewer.today;
  const started = ex.start_date <= today;
  if (started && startDate !== ex.start_date) return { ok: false, error: "It has already started, so the start date can't change." };
  if (!started && startDate < today) return { ok: false, error: "The start date can't be in the past." };
  if (endDate < startDate) return { ok: false, error: "The end date must be on or after the start date." };
  if (endDate < minDate(ex.end_date, addDays(today, -1))) {
    return { ok: false, error: "You can only shorten it to yesterday or later." };
  }
  if (daysBetween(startDate, endDate) > 366) return { ok: false, error: "Special occasions can last up to a year." };

  const patch: Partial<GoalException> = { start_date: startDate, end_date: maxDate(endDate, startDate) };
  if (allowance !== undefined && !started) {
    if (!Number.isInteger(allowance) || allowance < 0 || allowance > 200) return { ok: false, error: "Choose an allowance between 0 and 200." };
    patch.allowance = allowance;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("goal_exceptions").update(patch).eq("id", id);
  if (error) return { ok: false, error: overlapError(error.message) };
  return done();
}

/** Cancel an upcoming exception, or end a running one early (keeping the days already used). */
export async function cancelException(id: string): Promise<GoalActionResult> {
  const viewer = await requireViewer();
  const ex = await getOwnException(id);
  if (!ex || ex.status !== "active") return { ok: false, error: "Special occasion not found." };
  const supabase = await createClient();
  const yesterday = addDays(viewer.today, -1);
  const patch: Partial<GoalException> =
    ex.start_date > yesterday ? { status: "cancelled" } : { end_date: minDate(ex.end_date, yesterday) };
  const { error } = await supabase.from("goal_exceptions").update(patch).eq("id", id);
  return error ? { ok: false, error: "Couldn't cancel it. Please try again." } : done();
}
