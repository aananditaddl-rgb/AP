import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { FriendCard } from "@/components/friend-card";
import { RemoveFriendButton } from "@/components/social-controls";
import { getCategories } from "@/lib/data";
import {
  addDays, addMonths, daysInMonth, mediumDate, monthKey, monthLabel, startOfMonth, weekdayIndex, weekdayShort,
} from "@/lib/engine/dates";
import { getFriendByUsername, getFriendHistory } from "@/lib/social";

export const metadata: Metadata = { title: "Friend" };

export default async function FriendPage({ params, searchParams }: PageProps<"/friends/[username]">) {
  const { username } = await params;
  const sp = await searchParams;
  const found = await getFriendByUsername(username);
  if (!found) notFound();
  const { snapshot: f, friendshipId } = found;
  const today = f.today;
  const requested = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : null;
  let month = startOfMonth(requested ?? today);
  if (month > startOfMonth(today)) month = startOfMonth(today);
  const [history, categories] = await Promise.all([
    f.share.history ? getFriendHistory(f.id, month) : Promise.resolve([]), getCategories(),
  ]);
  const byDate = new Map(history.map((h) => [h.log_date, h]));
  const cat = new Map(categories.map((c) => [c.key, c]));
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => addDays(month, i));
  const recent = [...history].reverse().filter((h) => h.had_cheat && h.categories?.length).slice(0, 5);

  return (
    <div className="space-y-4">
      <PageHeader title={f.display_name} subtitle={`@${f.username}`} back="/friends" />
      <FriendCard f={f} link={false} />

      <Card>
        <CardTitle>History</CardTitle>
        {!f.share.history ? (
          <p className="text-sm text-ink-2">{f.display_name} keeps their daily history private.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <Link href={`?month=${monthKey(addMonths(month, -1))}`} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface-2">‹</Link>
              <p className="font-bold">{monthLabel(month)}</p>
              {addMonths(month, 1) <= today ? (
                <Link href={`?month=${monthKey(addMonths(month, 1))}`} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface-2">›</Link>
              ) : <span className="h-9 w-9" />}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {Array.from({ length: 7 }, (_, i) => <div key={i} className="text-[11px] font-bold uppercase text-ink-3">{weekdayShort(i).slice(0, 2)}</div>)}
              {Array.from({ length: weekdayIndex(month) }, (_, i) => <div key={`p${i}`} />)}
              {days.map((d) => {
                const h = byDate.get(d);
                const future = d > today;
                const cls = future ? "text-ink-3/60" : !h ? "border border-dashed border-line text-ink-2"
                  : h.had_cheat === null ? "bg-surface-2" : h.had_cheat ? "bg-brand-soft text-brand-strong" : "bg-good-soft text-good";
                const label = `${mediumDate(d)}: ${future ? "upcoming" : !h ? "not logged" : h.had_cheat === null ? "logged" : h.had_cheat ? `${h.meal_count} cheat meal(s)` : "no cheat meals"}`;
                return (
                  <div key={d} aria-label={label} title={label} className={`flex aspect-square flex-col items-center justify-center rounded-xl text-xs font-semibold ${cls}`}>
                    {Number(d.slice(8))}
                    {h?.had_cheat && h.meal_count ? <span className="text-[9px] font-extrabold">×{h.meal_count}</span> : null}
                  </div>
                );
              })}
            </div>
            {!f.share.daily_counts && <p className="mt-3 text-xs text-ink-3">Shows which days were logged. Daily counts are private.</p>}
            {recent.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-sm">
                {recent.map((h) => (
                  <li key={h.log_date} className="flex justify-between gap-2">
                    <span className="text-ink-2">{mediumDate(h.log_date)}</span>
                    <span className="text-right">{h.categories!.map((k) => `${cat.get(k)?.emoji ?? ""} ${cat.get(k)?.label ?? k}`).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      <RemoveFriendButton id={friendshipId} name={f.display_name} />
    </div>
  );
}
