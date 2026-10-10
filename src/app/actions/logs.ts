"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAllLogs, getCategories, getExceptions, getGoals, requireViewer } from "@/lib/data";
import { isValidDateStr } from "@/lib/engine/dates";
import { activitiesAfterLogging } from "@/lib/activity";
import type { FoodLog } from "@/lib/engine/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface LogInput {
  date: string;
  hadCheat: boolean;
  mealCount?: number;
  categories?: string[];
  note?: string;
}

const MAX_MEALS_PER_DAY = 20;

/** Create or update the log for a date. One log per user per day. */
export async function saveLog(input: LogInput): Promise<ActionResult> {
  const viewer = await requireViewer();
  const { date } = input;
  if (!isValidDateStr(date)) return { ok: false, error: "That date doesn't look right." };
  if (date > viewer.today) return { ok: false, error: "You can't log a day that hasn't happened yet." };

  let row: Omit<FoodLog, "log_date">;
  if (input.hadCheat) {
    const meals = Number(input.mealCount);
    if (!Number.isInteger(meals) || meals < 1 || meals > MAX_MEALS_PER_DAY) {
      return { ok: false, error: `Choose between 1 and ${MAX_MEALS_PER_DAY} cheat meals.` };
    }
    const known = new Set((await getCategories()).map((c) => c.key));
    const categories = [...new Set(input.categories ?? [])].filter((c) => known.has(c));
    if (categories.length === 0) return { ok: false, error: "Pick at least one food category." };
    const note = (input.note ?? "").trim().slice(0, 280) || null;
    row = { had_cheat: true, meal_count: meals, categories, note };
  } else {
    row = { had_cheat: false, meal_count: 0, categories: [], note: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("food_logs")
    .upsert({ user_id: viewer.id, log_date: date, ...row }, { onConflict: "user_id,log_date" });
  if (error) return { ok: false, error: "Couldn't save your entry. Please try again." };

  try {
    const [logs, goals, exceptions] = await Promise.all([getAllLogs(), getGoals(), getExceptions()]);
    await activitiesAfterLogging(supabase, viewer.id, viewer.today, date, logs, goals, exceptions);
  } catch {
    // Feed updates are best-effort; the log itself is saved.
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteLog(date: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (!isValidDateStr(date)) return { ok: false, error: "That date doesn't look right." };
  const supabase = await createClient();
  const { error } = await supabase.from("food_logs").delete().eq("user_id", viewer.id).eq("log_date", date);
  if (error) return { ok: false, error: "Couldn't delete the entry. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}
