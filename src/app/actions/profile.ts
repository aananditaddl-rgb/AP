"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/data";

export async function updateTimezone(timezone: string) {
  const viewer = await requireViewer();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return;
  }
  const supabase = await createClient();
  await supabase.from("user_settings").update({ timezone }).eq("user_id", viewer.id);
  revalidatePath("/", "layout");
}

export type ProfileResult = { ok: true } | { ok: false; error: string };

const AVATAR_COLORS = ["peach", "mint", "sky", "lilac", "lemon", "rose"];

export async function updateProfile(input: {
  displayName: string; username: string; avatarEmoji: string; avatarColor: string; isPrivate: boolean;
}): Promise<ProfileResult> {
  const viewer = await requireViewer();
  const displayName = input.displayName.trim();
  const username = input.username.trim().toLowerCase();
  if (displayName.length < 1 || displayName.length > 40) return { ok: false, error: "Your name should be 1–40 characters." };
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { ok: false, error: "Usernames are 3–20 characters: lowercase letters, numbers or _." };
  const emoji = [...new Intl.Segmenter().segment(input.avatarEmoji.trim())].map((s) => s.segment)[0] ?? "";
  if (!emoji || /^[\p{L}\p{N}\s]$/u.test(emoji)) return { ok: false, error: "Pick an emoji for your avatar." };
  if (!AVATAR_COLORS.includes(input.avatarColor)) return { ok: false, error: "Pick a colour." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({
    display_name: displayName, username, avatar_emoji: emoji, avatar_color: input.avatarColor,
    is_private: Boolean(input.isPrivate),
  }).eq("id", viewer.id);
  if (error) {
    return { ok: false, error: error.code === "23505" ? `@${username} is taken. Try another.` : "Couldn't save your profile." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

const SETTING_KEYS = [
  "share_log_status", "share_daily_counts", "share_categories", "share_monthly_totals", "share_goal_progress",
  "share_history", "reminder_enabled", "notify_goal_ending", "notify_monthly_summary", "notify_friend_activity",
  "notify_monthly_review",
] as const;
export type BoolSetting = (typeof SETTING_KEYS)[number];

export async function updateSetting(key: BoolSetting, value: boolean): Promise<ProfileResult> {
  const viewer = await requireViewer();
  if (!SETTING_KEYS.includes(key)) return { ok: false, error: "Unknown setting." };
  const supabase = await createClient();
  const { error } = await supabase.from("user_settings").update({ [key]: Boolean(value) }).eq("user_id", viewer.id);
  if (error) return { ok: false, error: "Couldn't save that setting." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateReminderTime(time: string): Promise<ProfileResult> {
  const viewer = await requireViewer();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: "Choose a valid time." };
  const supabase = await createClient();
  const { error } = await supabase.from("user_settings").update({ reminder_time: time }).eq("user_id", viewer.id);
  if (error) return { ok: false, error: "Couldn't save the reminder time." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAccount(confirmation: string): Promise<ProfileResult> {
  const viewer = await requireViewer();
  if (confirmation.trim().toLowerCase() !== viewer.profile.username) {
    return { ok: false, error: "Type your username to confirm." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { ok: false, error: "Couldn't delete your account. Please try again." };
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
