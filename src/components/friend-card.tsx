import Link from "next/link";
import { monthName, mediumDate, type DateStr } from "@/lib/engine/dates";
import { exceptionTitle, occasionMeta, progressStatus } from "@/lib/engine/goals";
import type { GoalType } from "@/lib/engine/types";
import type { FriendSnapshot } from "@/lib/social";
import { Avatar, ProgressBar, StatusPill } from "./ui";

export function friendWindowLabel(type: GoalType, start: DateStr, today: DateStr): string {
  switch (type) {
    case "daily": return "Today";
    case "weekly":
    case "weekday_schedule": return "This week";
    case "monthly": return `${monthName(today)} goal`;
    case "period_total": return `Goal since ${mediumDate(start)}`;
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-ink-2">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

const Private = () => <span className="font-medium text-ink-3">Private</span>;

export function FriendCard({ f, link = true }: { f: FriendSnapshot; link?: boolean }) {
  const g = f.goal;
  const status = g ? progressStatus(g.used, g.allowance) : null;
  const header = (
    <div className="flex items-center gap-3">
      <Avatar emoji={f.avatar_emoji} color={f.avatar_color} size={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold">{f.display_name}</p>
        <p className="truncate text-xs text-ink-2">@{f.username}</p>
        {f.streak ? <p className="text-xs font-semibold text-warn">🔥 {f.streak}-day streak</p> : null}
      </div>
      {f.logged_today !== null && (
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${f.logged_today ? "bg-good-soft text-good" : "bg-surface-2 text-ink-2"}`}>
          {f.logged_today ? "Logged today" : "Not logged yet"}
        </span>
      )}
    </div>
  );

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      {link ? <Link href={`/friends/${f.username}`} className="block">{header}</Link> : header}
      <div className="mt-3 space-y-1.5">
        <Row label="Today’s log">{f.logged_today === null ? <Private /> : f.logged_today ? "Completed" : "Not yet"}</Row>
        <Row label="Cheat meals today">
          {!f.share.daily_counts ? <Private /> : f.logged_today === false || f.meals_today === null ? "—" : f.meals_today}
        </Row>
        <Row label={`${monthName(f.today)} cheat meals`}>{f.month_meals === undefined ? <Private /> : f.month_meals}</Row>
      </div>
      {f.exception && (
        <p className="mt-3 rounded-xl bg-special-soft px-3 py-2 text-xs font-semibold text-special">
          {occasionMeta(f.exception.occasion).emoji} {exceptionTitle(f.exception)} until {mediumDate(f.exception.end_date)}
        </p>
      )}
      {f.share.goal_progress ? (
        g && status ? (
          <div className="mt-3 rounded-2xl bg-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{friendWindowLabel(g.goal_type, g.window_start, f.today)}: {g.used} of {g.allowance} used</p>
              <StatusPill status={status} />
            </div>
            <ProgressBar used={g.used} allowance={g.allowance} status={status} label={`${f.display_name}'s goal progress`} />
            <p className="mt-1.5 text-xs text-ink-2">Remaining: {Math.max(0, g.allowance - g.used)}</p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-3">No active goal right now.</p>
        )
      ) : (
        <p className="mt-3 text-xs text-ink-3">Goal progress is private.</p>
      )}
    </article>
  );
}
