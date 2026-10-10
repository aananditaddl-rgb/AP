"use server";

import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/data";

export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }) {
  const viewer = await requireViewer();
  if (!/^https:\/\//.test(sub.endpoint) || !sub.p256dh || !sub.auth || sub.endpoint.length > 1000) {
    return { ok: false as const };
  }
  const supabase = await createClient();
  // An endpoint belongs to one browser; re-subscribing replaces any old row we own.
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({ user_id: viewer.id, ...sub });
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string) {
  await requireViewer();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true as const };
}
