import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { timeIn, todayIn } from "@/lib/engine/dates";
import { dueNotifications } from "@/lib/notifications";

// Called by a scheduler (e.g. every 15 minutes) with "Authorization: Bearer $CRON_SECRET".
// Sends due reminders as web push. Every send is recorded so nothing goes out twice.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  if ((!pub || !priv) && !dryRun) return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  if (pub && priv) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);

  const db = createAdminClient();
  const { data: subs, error } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let sent = 0;
  const planned: { user: string; key: string }[] = [];
  for (const [userId, userSubs] of byUser) {
    const { data: settings } = await db.from("user_settings").select("*").eq("user_id", userId).single();
    if (!settings) continue;
    const now = new Date();
    const today = todayIn(settings.timezone, now);
    const [{ data: log }, { data: goal }, { data: reqs }, { data: already }] = await Promise.all([
      db.from("food_logs").select("id").eq("user_id", userId).eq("log_date", today).maybeSingle(),
      db.from("goals").select("id, end_date, status").eq("user_id", userId).in("status", ["active", "paused"]).maybeSingle(),
      db.from("friendships").select("id, requester:profiles!friendships_requester_id_fkey(display_name)")
        .eq("addressee_id", userId).eq("status", "pending"),
      db.from("notification_log").select("dedupe_key").eq("user_id", userId).gte("sent_at", new Date(now.getTime() - 40 * 86400_000).toISOString()),
    ]);
    const sentKeys = new Set((already ?? []).map((r) => r.dedupe_key));
    const due = dueNotifications({
      today, time: timeIn(settings.timezone, now), settings, loggedToday: Boolean(log), goal,
      pendingRequests: ((reqs ?? []) as unknown as { id: string; requester: { display_name: string } }[])
        .map((r) => ({ id: r.id, from: r.requester?.display_name ?? "Someone" })),
    }).filter((n) => !sentKeys.has(n.key));

    for (const n of due) {
      planned.push({ user: userId, key: n.key });
      if (dryRun) continue;
      // Claim the key first so overlapping runs can't double-send.
      const { error: claimErr } = await db.from("notification_log").insert({ user_id: userId, dedupe_key: n.key });
      if (claimErr) continue;
      for (const s of userSubs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.key }), { TTL: 6 * 3600 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }
  }
  return NextResponse.json({ users: byUser.size, planned: planned.length, sent, dryRun });
}
