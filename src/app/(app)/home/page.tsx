import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardTitle, Stat } from "@/components/ui";
import { LogFlow } from "@/components/log-flow";
import { GoalProgressBlock, NoGoalCard } from "@/components/goal-progress";
import { getAllLogs, getCategories, getExceptions, getGoals, requireViewer } from "@/lib/data";
import {
  addDays, addMonths, daysBetween, endOfMonth, mediumDate, monthName, relativeDay, shortDate, startOfMonth,
} from "@/lib/engine/dates";
import {
  currentGoal, describeAllowance, exceptionForDay, exceptionTitle, goalPhase, occasionMeta, periodProgress,
  windowProgress,
} from "@/lib/engine/goals";
import { goalPerformance } from "@/lib/engine/report";
import { loggingStreak, summarize } from "@/lib/engine/stats";

export const metadata: Metadata = { title: "Home" };

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const [logs, goals, exceptions, categories] = await Promise.all([
    getAllLogs(), getGoals(), getExceptions(), getCategories(),
  ]);
  const today = viewer.today;
  const todayLog = logs.find((l) => l.log_date === today) ?? null;
  const streak = loggingStreak(logs, today);

  const goal = currentGoal(goals);
  const phase = goal ? goalPhase(goal, today) : null;
  const window = goal && phase === "active" ? windowProgress(goal, goals, exceptions, logs, today, today) : null;
  const period = goal && phase === "active" && goal.goal_type !== "period_total" && goal.end_date
    ? periodProgress(goal, goals, exceptions, logs, today)
    : null;

  const monthStart = startOfMonth(today);
  const month = summarize(logs, monthStart, endOfMonth(today), today);
  const monthGoal = goalPerformance(logs, goals, exceptions, monthStart, endOfMonth(today), today);
  const uncovered = monthGoal ? month.meals - monthGoal.used : 0;

  // Quick insights, only from real data
  const last14 = summarize(logs, addDays(today, -13), today, today);
  const prevSamePoint = summarize(logs, addMonths(monthStart, -1),
    addDays(addMonths(monthStart, -1), month.elapsedDays - 1), today);
  const insights: string[] = [];
  if (last14.loggedDays > 0) insights.push(`You’ve logged your food intake on ${last14.loggedDays} of the last 14 days.`);
  if (month.loggedDays > 0) {
    insights.push(`You had cheat meals on ${month.cheatDays} day${month.cheatDays === 1 ? "" : "s"} this month (${month.meals} meal${month.meals === 1 ? "" : "s"} in total).`);
  }
  if (prevSamePoint.loggedDays > 0 && month.loggedDays > 0 && prevSamePoint.meals !== month.meals) {
    const diff = Math.abs(prevSamePoint.meals - month.meals);
    insights.push(`${diff} ${month.meals < prevSamePoint.meals ? "fewer" : "more"} cheat meal${diff === 1 ? "" : "s"} than at this point last month.`);
  }

  const activeException = exceptionForDay(exceptions, today);
  const upcomingException = activeException ? null : exceptions
    .filter((e) => e.status === "active" && e.start_date > today && e.start_date <= addDays(today, 14))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  const yesterday = addDays(today, -1);
  const missedYesterday = !logs.some((l) => l.log_date === yesterday) &&
    viewer.profile.created_at.slice(0, 10) <= yesterday && logs.length > 0;

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: viewer.settings.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const firstName = viewer.profile.display_name.split(" ")[0];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm font-medium text-ink-2">{shortDate(today)}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{greeting(hour)}, {firstName}</h1>
        </div>
        {streak > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-warn-soft px-3 py-1.5 text-sm font-bold text-warn" title="Days logged in a row">
            🔥 {streak}-day streak
          </span>
        )}
      </header>

      {sp.welcome && (
        <Card className="animate-pop border-brand/30 bg-brand-soft">
          <p className="font-extrabold">Welcome to Treatly! 🎉</p>
          <p className="mt-1 text-sm">Answer one quick question each day. Then set a goal so you can see how you’re doing.</p>
        </Card>
      )}

      <Card aria-labelledby="today-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="today-title" className="text-[15px] font-bold">Today’s log</h2>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${todayLog ? "bg-good-soft text-good" : "bg-surface-2 text-ink-2"}`}>
            {todayLog ? "Completed" : "Not logged yet"}
          </span>
        </div>
        <LogFlow date={today} today={today} log={todayLog} categories={categories} />
      </Card>

      {missedYesterday && (
        <Link href={`/calendar?date=${yesterday}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-4 py-3 text-sm">
          <span aria-hidden>🗓️</span>
          <span className="flex-1">You didn’t log yesterday. <strong>Add it now</strong></span>
          <span aria-hidden className="text-ink-3">→</span>
        </Link>
      )}

      {(activeException || upcomingException) && (() => {
        const e = (activeException ?? upcomingException)!;
        return (
          <Link href="/goals" className="flex items-center gap-3 rounded-2xl bg-special-soft px-4 py-3 text-sm text-special">
            <span className="text-xl" aria-hidden>{occasionMeta(e.occasion).emoji}</span>
            <span className="flex-1">
              <strong>{exceptionTitle(e)}</strong>{" "}
              {activeException
                ? `allowance is on until ${mediumDate(e.end_date)} — then your usual goal returns.`
                : `starts ${relativeDay(e.start_date, today).toLowerCase()}, ${mediumDate(e.start_date)}.`}
            </span>
          </Link>
        );
      })()}

      <Card>
        <CardTitle action={<Link href="/goals" className="text-sm font-semibold text-brand">{goal ? "Manage" : ""}</Link>}>
          Goal progress
        </CardTitle>
        {!goal && <NoGoalCard />}
        {goal && phase === "paused" && (
          <p className="text-sm text-ink-2">Your goal ({describeAllowance(goal).toLowerCase()}) is paused. <Link className="font-semibold text-brand" href="/goals">Resume it</Link> whenever you’re ready.</p>
        )}
        {goal && phase === "scheduled" && (
          <p className="text-sm text-ink-2">Your new goal ({describeAllowance(goal).toLowerCase()}) starts on {mediumDate(goal.start_date)}.</p>
        )}
        {goal && phase === "completed" && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Your goal period ended on {mediumDate(goal.end_date!)}. 🎉 See how it went, or start a new one.</p>
            <Link href="/goals/new" className="inline-flex rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-ink">Start a new goal</Link>
          </div>
        )}
        {window && (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">{describeAllowance(goal!)}</p>
            <GoalProgressBlock p={window} title={window.label === `${monthName(today)} goal` ? `Your ${monthName(today)} goal` : window.label} />
            {period && (
              <div className="mt-4 border-t border-line pt-4">
                <GoalProgressBlock compact p={period} title={`Whole goal · ends ${mediumDate(period.end)}`} />
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardTitle action={<Link href="/insights" className="text-sm font-semibold text-brand">Details</Link>}>
          {monthName(today)} overview
        </CardTitle>
        <div className="grid grid-cols-3 gap-2">
          <Stat value={month.meals} label="Cheat meals" tone="brand" />
          <Stat value={monthGoal ? monthGoal.allowance : "—"} label="Monthly allowance" />
          <Stat
            value={monthGoal ? monthGoal.remaining : "—"}
            label="Remaining"
            tone={monthGoal?.status === "over" ? "over" : "good"}
          />
          <Stat value={month.cheatDays} label="Days with junk food" />
          <Stat value={month.cleanDays} label="Days without" tone="good" />
          <Stat value={`${month.loggedDays}/${month.elapsedDays}`} label="Days logged" />
        </div>
        {monthGoal?.status === "over" && (
          <p className="mt-3 text-sm text-ink-2">
            You’re {monthGoal.used - monthGoal.allowance} over this month’s allowance. That’s okay — logging is what counts.
          </p>
        )}
        {uncovered > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            {uncovered} cheat meal{uncovered === 1 ? " was" : "s were"} logged on days without a goal, so {uncovered === 1 ? "it doesn’t" : "they don’t"} count against your allowance.
          </p>
        )}
        {monthGoal && goal?.goal_type !== "monthly" && (
          <p className="mt-3 text-xs text-ink-3">
            Monthly allowance is worked out from your goal{exceptions.some((e) => e.status === "active") ? " and any special-occasion allowances" : ""} for the days of {monthName(today)}.
          </p>
        )}
      </Card>

      {insights.length > 0 && (
        <Card>
          <CardTitle>Quick insights</CardTitle>
          <ul className="space-y-2.5">
            {insights.map((t) => (
              <li key={t} className="flex gap-2.5 text-sm">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {logs.length > 0 && daysBetween(logs[0].log_date, today) >= 28 && (
        <p className="text-center text-xs text-ink-3">Tracking since {mediumDate(logs[0].log_date)}</p>
      )}
    </div>
  );
}
