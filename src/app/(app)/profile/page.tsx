import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, ButtonLink, Card, CardTitle, Notice } from "@/components/ui";
import { DeleteAccount, PushSetup, ReminderTime, SettingToggle } from "@/components/settings-controls";
import { signOut } from "@/app/(auth)/actions";
import { getAllLogs, getExceptions, getGoals, requireViewer } from "@/lib/data";
import { endOfMonth, monthName, startOfMonth } from "@/lib/engine/dates";
import { currentGoal, describeAllowance, goalPhase, windowProgress } from "@/lib/engine/goals";
import { loggingStreak, longestLoggingStreak, summarize } from "@/lib/engine/stats";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const [logs, goals, exceptions] = await Promise.all([getAllLogs(), getGoals(), getExceptions()]);
  const { profile, settings, today } = viewer;
  const goal = currentGoal(goals);
  const win = goal && goalPhase(goal, today) === "active" ? windowProgress(goal, goals, exceptions, logs, today, today) : null;
  const month = summarize(logs, startOfMonth(today), endOfMonth(today), today);

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-4 pt-2">
        <Avatar emoji={profile.avatar_emoji} color={profile.avatar_color} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{profile.display_name}</h1>
          <p className="text-sm text-ink-2">@{profile.username}{profile.is_private ? " · Private" : ""}</p>
        </div>
        <ButtonLink href="/profile/edit" variant="small">Edit</ButtonLink>
      </header>
      {sp.saved && <Notice tone="good">Profile saved.</Notice>}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-surface p-3 ring-1 ring-line"><p className="text-xl font-extrabold">{loggingStreak(logs, today)}</p><p className="text-xs text-ink-2">Day streak</p></div>
        <div className="rounded-2xl bg-surface p-3 ring-1 ring-line"><p className="text-xl font-extrabold">{month.meals}</p><p className="text-xs text-ink-2">{monthName(today)} cheat meals</p></div>
        <div className="rounded-2xl bg-surface p-3 ring-1 ring-line"><p className="text-xl font-extrabold">{longestLoggingStreak(logs)}</p><p className="text-xs text-ink-2">Best streak</p></div>
      </div>

      <Link href="/goals" className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-xl" aria-hidden>🎯</span>
        <span className="flex-1">
          <span className="block font-bold">Goals & special occasions</span>
          <span className="block text-sm text-ink-2">
            {goal ? `${describeAllowance(goal)}${win ? ` · ${win.used} of ${win.allowance} used` : ""}` : "No goal set"}
          </span>
        </span>
        <span aria-hidden className="text-ink-3">›</span>
      </Link>

      <Card id="privacy">
        <CardTitle>What friends can see</CardTitle>
        <p className="-mt-1 text-xs text-ink-2">Only approved friends ever see these. Everyone else sees nothing.</p>
        <div className="divide-y divide-line">
          <SettingToggle setting="share_log_status" value={settings.share_log_status} label="Daily logging status" hint="Whether you’ve logged today, and your streak" />
          <SettingToggle setting="share_daily_counts" value={settings.share_daily_counts} label="Daily cheat meal counts" />
          <SettingToggle setting="share_categories" value={settings.share_categories} label="Food categories" hint="What kind of food you logged" />
          <SettingToggle setting="share_monthly_totals" value={settings.share_monthly_totals} label="Monthly totals" />
          <SettingToggle setting="share_goal_progress" value={settings.share_goal_progress} label="Goal progress" hint="Your allowance, how much you’ve used, and special occasions" />
          <SettingToggle setting="share_history" value={settings.share_history} label="Historical records" hint="Your calendar of past days" />
        </div>
      </Card>

      <Card id="notifications">
        <CardTitle>Notifications</CardTitle>
        <div className="divide-y divide-line">
          <SettingToggle setting="reminder_enabled" value={settings.reminder_enabled} label="Daily reminder to log" hint="Only sent if you haven’t logged yet that day" />
          <ReminderTime value={settings.reminder_time} />
          <SettingToggle setting="notify_goal_ending" value={settings.notify_goal_ending} label="Goal period ending soon" />
          <SettingToggle setting="notify_monthly_summary" value={settings.notify_monthly_summary} label="Monthly summary" hint="On the 1st, when your recap is ready" />
          <SettingToggle setting="notify_monthly_review" value={settings.notify_monthly_review} label="Mid-month check-in" hint="A gentle nudge to review your progress on the 15th" />
          <SettingToggle setting="notify_friend_activity" value={settings.notify_friend_activity} label="Friend requests & cheers" />
          <PushSetup vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined} />
        </div>
      </Card>

      <Card>
        <CardTitle>Account</CardTitle>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-ink-2">Email</dt><dd className="truncate font-medium">{viewer.email}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-ink-2">Timezone</dt><dd className="font-medium">{settings.timezone}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-ink-3">Your timezone follows your device, so each entry lands on your local date.</p>
        <form action={signOut} className="mt-4">
          <button className="h-12 w-full rounded-2xl bg-surface-2 font-semibold hover:bg-line">Log out</button>
        </form>
        <div className="mt-3"><DeleteAccount username={profile.username} /></div>
      </Card>
    </div>
  );
}
