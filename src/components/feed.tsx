import Link from "next/link";
import { mediumDate } from "@/lib/engine/dates";
import type { FeedItem } from "@/lib/social";
import type { Recap } from "@/lib/recap";
import { recapChangeLine, recapGoalLine } from "@/lib/recap";
import { CheerButton } from "./social-controls";
import { Avatar } from "./ui";

const GOAL_WORD: Record<string, string> = {
  daily: "daily", weekly: "weekly", monthly: "monthly", weekday_schedule: "weekly", period_total: "",
};

function describe(item: FeedItem, own: boolean): { emoji: string; text: string } {
  const who = own ? "You" : item.display_name;
  const p = item.payload;
  switch (item.kind) {
    case "logged": return { emoji: "✅", text: `${who} logged today’s food intake.` };
    case "streak": return { emoji: "🔥", text: `${who} completed a ${p.days}-day tracking streak.` };
    case "goal_met": {
      const word = GOAL_WORD[String(p.goal_type)];
      const until = p.end ? ` (to ${mediumDate(String(p.end))})` : "";
      return { emoji: "🏆", text: `${who} stayed within ${own ? "your" : "their"} ${word ? `${word} ` : ""}goal${until}.` };
    }
    case "goal_started": return { emoji: "🎯", text: `${who} started a new goal: ${String(p.text ?? "").toLowerCase()}.` };
    case "goal_updated": return { emoji: "✏️", text: `${who} updated ${own ? "your" : "their"} goal: ${String(p.text ?? "").toLowerCase()}.` };
    case "exception": return { emoji: "🏖️", text: `${who} updated ${own ? "your" : "their"} goal for ${String(p.title ?? "a special occasion")} (${mediumDate(String(p.start))} – ${mediumDate(String(p.end))}).` };
    case "recap": return { emoji: "🎁", text: `${who} shared ${own ? "your" : "their"} ${String((p as unknown as Recap).title ?? "")} recap.` };
    default: return { emoji: "👋", text: `${who} joined Treatly.` };
  }
}

function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function Feed({ items, viewerId, now }: { items: FeedItem[]; viewerId: string; now: number }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const own = item.user_id === viewerId;
        const d = describe(item, own);
        const recap = item.kind === "recap" ? (item.payload as unknown as Recap) : null;
        return (
          <li key={item.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="flex gap-3">
              {own ? <Avatar emoji={item.avatar_emoji} color={item.avatar_color} size={40} /> : (
                <Link href={`/friends/${item.username}`}><Avatar emoji={item.avatar_emoji} color={item.avatar_color} size={40} /></Link>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm"><span aria-hidden>{d.emoji} </span>{d.text}</p>
                <p className="mt-0.5 text-xs text-ink-3">{timeAgo(item.created_at, now)}</p>
              </div>
            </div>
            {recap && (
              <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#ff6f4f] to-[#ffb36b] p-4 text-white">
                <p className="text-xs font-bold uppercase tracking-widest opacity-90">{recap.title} recap</p>
                <p className="mt-1 text-3xl font-extrabold">{recap.meals} <span className="text-base">cheat meal{recap.meals === 1 ? "" : "s"}</span></p>
                <p className="text-sm font-semibold">{recapGoalLine(recap.goal)}</p>
                <p className="text-sm opacity-90">
                  {recap.topCategory ? `Top treat: ${recap.topCategory.emoji} ${recap.topCategory.label}` : ""}
                  {recapChangeLine(recap.change, recap.inProgress) ? ` · ${recapChangeLine(recap.change, recap.inProgress)}` : ""}
                </p>
              </div>
            )}
            {(!own || item.cheers > 0) && (
              <div className="mt-3 flex justify-end">
                <CheerButton id={item.id} cheers={item.cheers} cheered={item.cheered} own={own} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
