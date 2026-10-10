import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIn, type DateStr } from "@/lib/engine/dates";
import type { Category, FoodLog, Goal, GoalException } from "@/lib/engine/types";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_color: AvatarColor;
  is_private: boolean;
  created_at: string;
}

export type AvatarColor = "peach" | "mint" | "sky" | "lilac" | "lemon" | "rose";

export interface Settings {
  user_id: string;
  timezone: string;
  share_log_status: boolean;
  share_daily_counts: boolean;
  share_categories: boolean;
  share_monthly_totals: boolean;
  share_goal_progress: boolean;
  share_history: boolean;
  reminder_enabled: boolean;
  reminder_time: string;
  notify_goal_ending: boolean;
  notify_monthly_summary: boolean;
  notify_friend_activity: boolean;
  notify_monthly_review: boolean;
  invite_code: string;
}

export interface Viewer {
  id: string;
  email: string | null;
  profile: Profile;
  settings: Settings;
  today: DateStr;
}

/** The signed-in user, their profile/settings and local "today". Redirects if signed out. */
export const requireViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect("/login");

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", claims.sub).single(),
    supabase.from("user_settings").select("*").eq("user_id", claims.sub).single(),
  ]);
  if (!profile || !settings) redirect("/login?error=profile");

  return {
    id: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    profile: profile as Profile,
    settings: settings as Settings,
    today: todayIn((settings as Settings).timezone),
  };
});

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("food_categories")
    .select("key, label, emoji, sort_order")
    .order("sort_order");
  return (data ?? []) as Category[];
});

export async function getLogs(from: DateStr, to: DateStr): Promise<(FoodLog & { id: string })[]> {
  const { id } = await requireViewer();
  const supabase = await createClient();
  const out: (FoodLog & { id: string })[] = [];
  // The API caps rows per request, so page through long histories.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("food_logs")
      .select("id, log_date, had_cheat, meal_count, categories, note")
      .eq("user_id", id)
      .gte("log_date", from)
      .lte("log_date", to)
      .order("log_date")
      .range(offset, offset + 999);
    if (error) throw error;
    out.push(...((data ?? []) as (FoodLog & { id: string })[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Every log the user has (dates are cheap; used for streaks and history). */
export const getAllLogs = cache(async () => getLogs("2000-01-01", "9999-12-31"));

export const getGoals = cache(async (): Promise<Goal[]> => {
  const { id } = await requireViewer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", id)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Goal[];
});

export const getExceptions = cache(async (): Promise<GoalException[]> => {
  const { id } = await requireViewer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goal_exceptions")
    .select("*")
    .eq("user_id", id)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GoalException[];
});

export const getPendingRequestCount = cache(async (): Promise<number> => {
  const { id } = await requireViewer();
  const supabase = await createClient();
  const { count } = await supabase
    .from("friendships")
    .select("id", { count: "exact", head: true })
    .eq("addressee_id", id)
    .eq("status", "pending");
  return count ?? 0;
});

export function categoryLabeler(categories: Category[]) {
  const map = new Map(categories.map((c) => [c.key, c]));
  return (key: string) => map.get(key)?.label ?? key;
}
