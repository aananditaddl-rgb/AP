"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAllLogs, getCategories, getExceptions, getGoals, requireViewer } from "@/lib/data";
import { startOfMonth } from "@/lib/engine/dates";
import { buildRecap } from "@/lib/recap";
import { postActivity } from "@/lib/activity";

export type SocialResult = { ok: true; status?: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(status?: string): SocialResult {
  revalidatePath("/", "layout");
  return { ok: true, status };
}

export async function sendFriendRequest(userId: string): Promise<SocialResult> {
  await requireViewer();
  if (!UUID.test(userId)) return { ok: false, error: "User not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_friend_request", { p_target: userId });
  if (error) return { ok: false, error: error.message.includes("not found") ? "User not found." : "Couldn't send the request." };
  return done(data as string);
}

export async function respondToRequest(requestId: string, accept: boolean): Promise<SocialResult> {
  await requireViewer();
  if (!UUID.test(requestId)) return { ok: false, error: "Request not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_friend_request", { p_request: requestId, p_accept: accept });
  if (error) return { ok: false, error: "That request is no longer available." };
  return done();
}

/** Cancel an outgoing request or remove a friend. */
export async function removeFriendship(friendshipId: string): Promise<SocialResult> {
  await requireViewer();
  if (!UUID.test(friendshipId)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
  if (error) return { ok: false, error: "Couldn't update your friends list." };
  return done();
}

export async function acceptInvite(code: string): Promise<SocialResult> {
  await requireViewer();
  if (!/^[0-9a-f]{6,32}$/i.test(code)) return { ok: false, error: "This invite link isn't valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error) return { ok: false, error: "This invite link isn't valid any more." };
  return done();
}

export async function regenerateInviteCode(): Promise<SocialResult> {
  await requireViewer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_invite_code");
  if (error) return { ok: false, error: "Couldn't create a new link." };
  return done();
}

export async function toggleCheer(activityId: string, cheer: boolean): Promise<SocialResult> {
  const viewer = await requireViewer();
  if (!UUID.test(activityId)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { error } = cheer
    ? await supabase.from("activity_cheers").upsert({ activity_id: activityId, user_id: viewer.id }, { ignoreDuplicates: true })
    : await supabase.from("activity_cheers").delete().eq("activity_id", activityId).eq("user_id", viewer.id);
  if (error) return { ok: false, error: "Couldn't send your cheer." };
  return done();
}

/** Post the month's recap card (highlights only) to the friends feed. */
export async function shareRecap(month: string): Promise<SocialResult> {
  const viewer = await requireViewer();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Invalid month." };
  const start = startOfMonth(`${month}-01`);
  if (start > viewer.today) return { ok: false, error: "That month hasn't started yet." };
  const [logs, goals, exceptions, categories] = await Promise.all([getAllLogs(), getGoals(), getExceptions(), getCategories()]);
  const recap = buildRecap(start, logs, goals, exceptions, viewer.today, categories);
  const supabase = await createClient();
  // Re-sharing replaces the earlier post for the same month.
  await supabase.from("activities").delete().eq("user_id", viewer.id).eq("dedupe_key", `recap:${month}`);
  await postActivity(supabase, viewer.id, "recap", { ...recap }, `recap:${month}`);
  return done();
}

export interface SearchResult {
  id: string; username: string; display_name: string; avatar_emoji: string; avatar_color: string;
  relation: "friend" | "outgoing" | "incoming" | "none";
}

export async function searchPeople(query: string): Promise<SearchResult[]> {
  await requireViewer();
  const q = query.trim().replace(/^@/, "").slice(0, 40);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_profiles", { p_query: q });
  return (data ?? []) as SearchResult[];
}
