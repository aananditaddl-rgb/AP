import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireViewer, type AvatarColor } from "@/lib/data";
import type { DateStr } from "@/lib/engine/dates";
import type { GoalType, Occasion } from "@/lib/engine/types";

/** What a friend lets you see (null = not shared). Built by public.friend_snapshot(). */
export interface FriendSnapshot {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_color: AvatarColor;
  today: DateStr;
  share: {
    log_status: boolean; daily_counts: boolean; categories: boolean;
    monthly_totals: boolean; goal_progress: boolean; history: boolean;
  };
  logged_today: boolean | null;
  streak: number | null;
  had_cheat_today: boolean | null;
  meals_today: number | null;
  categories_today: string[] | null;
  month_meals?: number;
  month_cheat_days?: number;
  month_logged_days?: number;
  goal?: {
    goal_type: GoalType; goal_allowance: number; window_start: DateStr; window_end: DateStr;
    allowance: number; used: number;
  };
  exception?: { occasion: Occasion; label: string | null; start_date: DateStr; end_date: DateStr } | null;
}

export interface FriendRequest {
  id: string;
  created_at: string;
  direction: "incoming" | "outgoing";
  other: { id: string; username: string; display_name: string; avatar_emoji: string; avatar_color: AvatarColor };
}

export interface FeedItem {
  id: string; user_id: string; kind: string; payload: Record<string, unknown>; created_at: string;
  username: string; display_name: string; avatar_emoji: string; avatar_color: AvatarColor;
  cheers: number; cheered: boolean;
}

export async function getFriends(): Promise<FriendSnapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("friends_overview");
  if (error) throw error;
  return ((data ?? []) as FriendSnapshot[])
    .filter(Boolean)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export async function getFriendByUsername(username: string): Promise<{ snapshot: FriendSnapshot; friendshipId: string } | null> {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("id").eq("username", username.toLowerCase()).maybeSingle();
  if (!profile) return null;
  const { data: f } = await supabase.from("friendships").select("id")
    .eq("status", "accepted")
    .or(`and(requester_id.eq.${viewer.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${viewer.id})`)
    .maybeSingle();
  if (!f) return null;
  const { data } = await supabase.rpc("friend_snapshot", { p_friend: profile.id });
  return data ? { snapshot: data as FriendSnapshot, friendshipId: f.id } : null;
}

export async function getFriendHistory(friendId: string, month: DateStr) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("friend_history", { p_friend: friendId, p_month: month });
  return (data ?? []) as { log_date: DateStr; had_cheat: boolean | null; meal_count: number | null; categories: string[] | null }[];
}

export async function getRequests(): Promise<FriendRequest[]> {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase
    .from("friendships")
    .select("id, created_at, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_emoji, avatar_color), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_emoji, avatar_color)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  type Row = { id: string; created_at: string; requester_id: string; requester: FriendRequest["other"]; addressee: FriendRequest["other"] };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    direction: r.requester_id === viewer.id ? "outgoing" : "incoming",
    other: r.requester_id === viewer.id ? r.addressee : r.requester,
  }));
}

export async function getFeed(limit = 30): Promise<{ items: FeedItem[]; fetchedAt: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_feed", { p_limit: limit });
  if (error) throw error;
  return { items: (data ?? []) as FeedItem[], fetchedAt: Date.now() };
}
