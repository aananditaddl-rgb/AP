import type { Metadata } from "next";
import { Card, CardTitle, ButtonLink, EmptyState, Notice, StatusPill, cx } from "@/components/ui";
import { GoalProgressBlock } from "@/components/goal-progress";
import { ExceptionControls, GoalControls } from "@/components/goal-controls";
import { getAllLogs, getExceptions, getGoals, requireViewer } from "@/lib/data";
import { mediumDate } from "@/lib/engine/dates";
import {
  currentGoal, describeAllowance, describeDuration, describeException, exceptionTitle, goalPhase,
  occasionMeta, periodProgress, windowProgress,
} from "@/lib/engine/goals";
import { goalResult } from "@/lib/engine/report";

export const metadata: Metadata = { title: "Goals" };

const PHASE_LABEL = {
  active: "Active", paused: "Paused", scheduled: "Starts soon", completed: "Period finished",
  ended: "Ended", cancelled: "Cancelled",
} as const;

export default async function GoalsPage({ searchParams }: PageProps<"/goals">) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const [logs, goals, exceptions] = await Promise.all([getAllLogs(), getGoals(), getExceptions()]);
  const today = viewer.today;
  const goal = currentGoal(goals);
  const phase = goal ? goalPhase(goal, today) : null;
  const win = goal && phase === "active" ? windowProgress(goal, goals, exceptions, logs, today, today) : null;
  const period = goal && phase === "active" && goal.end_date && goal.goal_type !== "period_total"
    ? periodProgress(goal, goals, exceptions, logs, today) : null;

  const upcoming = exceptions.filter((e) => e.status === "active" && e.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const pastExceptions = exceptions.filter((e) => e.status === "cancelled" || e.end_date < today);
  const history = goals
    .filter((g) => g.id !== goal?.id || phase === "completed")
    .map((g) => ({ g, r: goalResult(g, logs, goals, exceptions, today) }));

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Your goals</h1>
        <p className="text-sm text-ink-2">Set your own allowance. Change it whenever life changes.</p>
      </header>
      {sp.saved && <Notice tone="good">Saved! Your progress has been updated.</Notice>}

      <Card>
        <CardTitle action={goal && phase && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2">{PHASE_LABEL[phase]}</span>}>
          Current goal
        </CardTitle>
        {!goal ? (
          <EmptyState emoji="🎯" title="No goal yet">
            <p>Pick an allowance that feels right for you.</p>
            <ButtonLink href="/goals/new" className="mt-4">Set a goal</ButtonLink>
          </EmptyState>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-extrabold">{describeAllowance(goal)}</p>
              <p className="text-sm text-ink-2">{describeDuration(goal)}</p>
              {goal.status === "paused" && <p className="mt-1 text-sm text-ink-2">Paused since {mediumDate(goal.paused_from!)}. Paused days don’t count toward this goal.</p>}
            </div>
            {win && <GoalProgressBlock p={win} title={win.label} />}
            {period && <div className="border-t border-line pt-4"><GoalProgressBlock compact p={period} title="Whole goal period" /></div>}
            {phase !== "completed" && (goal.status === "active" || goal.status === "paused") && (
              <GoalControls status={goal.status} started={goal.start_date <= today} />
            )}
            {phase === "completed" && <ButtonLink href="/goals/new" className="w-full">Start a new goal</ButtonLink>}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle action={<ButtonLink href="/goals/occasion" variant="smallPrimary">+ Add</ButtonLink>}>
          Vacations & special occasions
        </CardTitle>
        <p className="-mt-1 mb-3 text-sm text-ink-2">
          Going away or celebrating? Set a temporary allowance for those dates. Your usual goal returns automatically afterwards.
        </p>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">Nothing planned right now.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((e) => (
              <li key={e.id} className="rounded-2xl border border-special/30 bg-special-soft/50 p-3.5">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-xl">{occasionMeta(e.occasion).emoji}</span>
                  <p className="flex-1 font-bold">{exceptionTitle(e)}</p>
                  <span className="text-xs font-semibold text-special">{e.start_date <= today ? "Happening now" : "Upcoming"}</span>
                </div>
                <p className="mt-1 text-sm text-ink-2">{describeException(e)}</p>
                {e.note && <p className="mt-1 text-sm italic text-ink-2">{e.note}</p>}
                <ExceptionControls ex={e} today={today} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(history.length > 0 || pastExceptions.length > 0) && (
        <Card>
          <CardTitle>History</CardTitle>
          <ul className="divide-y divide-line">
            {history.map(({ g, r }) => (
              <li key={g.id} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{describeAllowance(g)}</p>
                    <p className="text-xs text-ink-2">{g.status === "cancelled" ? "Replaced before it started" : describeDuration(g)}</p>
                  </div>
                  {r && <StatusPill status={r.status} />}
                </div>
                {r && (
                  <p className="mt-1 text-sm text-ink-2">
                    {r.used} of {r.allowance} cheat meals used · logged {r.loggedDays} of {r.days} days
                  </p>
                )}
              </li>
            ))}
            {pastExceptions.map((e) => (
              <li key={e.id} className={cx("py-3 first:pt-0", e.status === "cancelled" && "opacity-70")}>
                <p className="font-semibold">{occasionMeta(e.occasion).emoji} {exceptionTitle(e)}</p>
                <p className="text-xs text-ink-2">{e.status === "cancelled" ? "Cancelled · " : ""}{describeException(e)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
