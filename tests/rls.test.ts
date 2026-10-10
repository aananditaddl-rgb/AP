// Integration tests against a running local Supabase (`npx supabase start`).
// Verifies row-level security, privacy filtering and that the SQL allowance
// engine agrees with the TypeScript one.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, startOfMonth, todayIn } from "../src/lib/engine/dates";
import { windowProgress } from "../src/lib/engine/goals";
import type { Goal, GoalException } from "../src/lib/engine/types";

import { LOCAL_SUPABASE } from "./local-supabase";

const { url: URL, anonKey: ANON, secretKey: SECRET } = LOCAL_SUPABASE;

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const today = todayIn("UTC");
const run = Date.now().toString(36);

async function makeUser(name: string): Promise<{ id: string; db: SupabaseClient }> {
  const email = `${name}-${run}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: "password123", email_confirm: true,
    user_metadata: { username: `${name}_${run}`.slice(0, 20), display_name: name, timezone: "UTC" },
  });
  if (error) throw error;
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await db.auth.signInWithPassword({ email, password: "password123" });
  if (e2) throw e2;
  return { id: data.user.id, db };
}

let A: Awaited<ReturnType<typeof makeUser>>;
let B: Awaited<ReturnType<typeof makeUser>>;
let C: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  [A, B, C] = await Promise.all([makeUser("alice"), makeUser("bob"), makeUser("cara")]);
});

describe("own data only", () => {
  it("users can only read and write their own logs", async () => {
    const ins = await A.db.from("food_logs").insert({ user_id: A.id, log_date: today, had_cheat: true, meal_count: 2, categories: ["pizza", "sweets_desserts"] });
    expect(ins.error).toBeNull();
    const peek = await B.db.from("food_logs").select("*").eq("user_id", A.id);
    expect(peek.data).toEqual([]);
    const forge = await B.db.from("food_logs").insert({ user_id: A.id, log_date: addDays(today, -1), had_cheat: false });
    expect(forge.error).not.toBeNull();
    const upd = await B.db.from("food_logs").update({ meal_count: 9 }).eq("user_id", A.id).select();
    expect(upd.data).toEqual([]);
  });
  it("prevents duplicate days, future days and inconsistent rows", async () => {
    const dup = await A.db.from("food_logs").insert({ user_id: A.id, log_date: today, had_cheat: false });
    expect(dup.error?.code).toBe("23505");
    const future = await A.db.from("food_logs").insert({ user_id: A.id, log_date: addDays(today, 3), had_cheat: false });
    expect(future.error).not.toBeNull();
    const bad = await A.db.from("food_logs").insert({ user_id: A.id, log_date: addDays(today, -5), had_cheat: false, meal_count: 2 });
    expect(bad.error).not.toBeNull();
    const badCat = await A.db.from("food_logs").insert({ user_id: A.id, log_date: addDays(today, -6), had_cheat: true, meal_count: 1, categories: ["caviar"] });
    expect(badCat.error).not.toBeNull();
  });
  it("hides settings and invite codes from other users", async () => {
    const s = await B.db.from("user_settings").select("*").eq("user_id", A.id);
    expect(s.data).toEqual([]);
    const forge = await B.db.from("user_settings").update({ share_history: true }).eq("user_id", A.id).select();
    expect(forge.data ?? []).toEqual([]);
  });
  it("keeps server-only helpers private", async () => {
    const r = await B.db.rpc("day_allowance", { p_user: A.id, p_day: today });
    expect(r.error).not.toBeNull();
    const f = await B.db.from("friendships").insert({ requester_id: B.id, addressee_id: A.id, status: "accepted" });
    expect(f.error).not.toBeNull();
  });
});

describe("friends and privacy", () => {
  it("non-friends see nothing", async () => {
    const snap = await B.db.rpc("friend_snapshot", { p_friend: A.id });
    expect(snap.data).toBeNull();
    const hist = await B.db.rpc("friend_history", { p_friend: A.id, p_month: today });
    expect(hist.data).toEqual([]);
  });

  it("private profiles can't be searched or requested, but invites work", async () => {
    await A.db.from("profiles").update({ is_private: true }).eq("id", A.id);
    const search = await B.db.rpc("search_profiles", { p_query: `alice_${run}` });
    expect(search.data).toEqual([]);
    const req = await B.db.rpc("send_friend_request", { p_target: A.id });
    expect(req.error).not.toBeNull();

    const { data: s } = await admin.from("user_settings").select("invite_code").eq("user_id", A.id).single();
    const acc = await B.db.rpc("accept_invite", { p_code: s!.invite_code });
    expect(acc.error).toBeNull();
    expect((await B.db.rpc("is_my_friend", { other: A.id })).data).toBe(true);
  });

  it("friend requests need the other person to accept", async () => {
    const r = await C.db.rpc("send_friend_request", { p_target: B.id });
    expect(r.data).toBe("outgoing");
    expect((await C.db.rpc("friend_snapshot", { p_friend: B.id })).data).toBeNull();
    const { data: pending } = await B.db.from("friendships").select("id").eq("requester_id", C.id).single();
    expect((await C.db.rpc("respond_friend_request", { p_request: pending!.id, p_accept: true })).error).not.toBeNull();
    expect((await B.db.rpc("respond_friend_request", { p_request: pending!.id, p_accept: true })).error).toBeNull();
    expect((await C.db.rpc("is_my_friend", { other: B.id })).data).toBe(true);
  });

  it("applies each privacy setting", async () => {
    // A shares: log status, daily counts, monthly totals, goal progress (defaults). Not categories/history.
    let snap = (await B.db.rpc("friend_snapshot", { p_friend: A.id })).data;
    expect(snap).toMatchObject({ logged_today: true, meals_today: 2, had_cheat_today: true, categories_today: null, month_meals: 2 });

    await A.db.from("user_settings").update({ share_daily_counts: false, share_monthly_totals: false, share_log_status: false }).eq("user_id", A.id);
    snap = (await B.db.rpc("friend_snapshot", { p_friend: A.id })).data;
    expect(snap.logged_today).toBeNull();
    expect(snap.meals_today).toBeNull();
    expect(snap.streak).toBeNull();
    expect(snap).not.toHaveProperty("month_meals");

    expect((await B.db.rpc("friend_history", { p_friend: A.id, p_month: today })).data).toEqual([]);
    await A.db.from("user_settings").update({ share_history: true, share_categories: true }).eq("user_id", A.id);
    const hist = (await B.db.rpc("friend_history", { p_friend: A.id, p_month: today })).data;
    expect(hist).toEqual([{ log_date: today, had_cheat: null, meal_count: null, categories: ["pizza", "sweets_desserts"] }]);
  });

  it("filters the feed by privacy and only friends can cheer", async () => {
    const { data: act } = await A.db.from("activities").insert({ user_id: A.id, kind: "logged", payload: {}, dedupe_key: `l-${run}` }).select().single();
    await A.db.from("activities").insert({ user_id: A.id, kind: "recap", payload: { meals: 3 }, dedupe_key: `r-${run}` });
    const feed = (await B.db.rpc("get_feed", {})).data as { kind: string; user_id: string }[];
    const fromA = feed.filter((f) => f.user_id === A.id).map((f) => f.kind);
    expect(fromA).toEqual(["recap"]); // log status is private now
    expect((await C.db.rpc("get_feed", {})).data.filter((f: { user_id: string }) => f.user_id === A.id)).toEqual([]);

    expect((await B.db.from("activity_cheers").insert({ activity_id: act!.id, user_id: B.id })).error).toBeNull();
    expect((await C.db.from("activity_cheers").insert({ activity_id: act!.id, user_id: C.id })).error).not.toBeNull();
  });
});

describe("SQL and TypeScript engines agree", () => {
  it("computes the same goal window, with an exception", async () => {
    const start = addDays(startOfMonth(today), 3) > today ? startOfMonth(today) : addDays(startOfMonth(today), 3);
    const { data: g } = await C.db.from("goals").insert({ user_id: C.id, goal_type: "monthly", allowance: 5, start_date: start }).select().single();
    const exStart = today;
    const { data: ex } = await C.db.from("goal_exceptions").insert({ user_id: C.id, goal_id: g!.id, occasion: "vacation", start_date: exStart, end_date: addDays(exStart, 2), rule: "total", allowance: 4 }).select().single();
    await C.db.from("food_logs").insert({ user_id: C.id, log_date: today, had_cheat: true, meal_count: 3, categories: ["pizza"] });

    const snap = (await B.db.rpc("friend_snapshot", { p_friend: C.id })).data;
    const ts = windowProgress(g as Goal, [g as Goal], [ex as GoalException], [{ log_date: today, had_cheat: true, meal_count: 3, categories: ["pizza"], note: null }], today, today);
    expect(snap.goal).toMatchObject({ allowance: ts.allowance, used: ts.used, window_start: ts.start, window_end: ts.end });
    expect(snap.exception).toMatchObject({ occasion: "vacation" });

    const overlap = await C.db.from("goal_exceptions").insert({ user_id: C.id, occasion: "birthday", start_date: addDays(exStart, 1), end_date: addDays(exStart, 1), rule: "per_day", allowance: 2 });
    expect(overlap.error).not.toBeNull();
  });
});
