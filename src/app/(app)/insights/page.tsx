import type { Metadata } from "next";
import Link from "next/link";
import { BarList, ColumnChart } from "@/components/charts";
import { Card, CardTitle, EmptyState, Stat, StatusPill, cx } from "@/components/ui";
import { categoryLabeler, getAllLogs, getCategories, getExceptions, getGoals, requireViewer } from "@/lib/data";
import { addMonths, mediumDate, monthKey, monthLabel, monthName, startOfMonth, weekdayLong, weekdayShort } from "@/lib/engine/dates";
import { describeAllowance } from "@/lib/engine/goals";
import { frequencyTrend, goalResult, monthReport, monthSeries } from "@/lib/engine/report";
import { rankCategories } from "@/lib/engine/stats";

export const metadata: Metadata = { title: "Insights" };

const STATUS_TEXT = { within: "text-good", reached: "text-warn", over: "text-over" } as const;
const STATUS_MARK = { within: "✓", reached: "=", over: "↑" } as const;

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const today = viewer.today;
  const [logs, goals, exceptions, categories] = await Promise.all([
    getAllLogs(), getGoals(), getExceptions(), getCategories(),
  ]);
  const label = categoryLabeler(categories);
  const emoji = new Map(categories.map((c) => [c.key, c.emoji]));

  const requested = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : null;
  let month = startOfMonth(requested ?? today);
  if (month > startOfMonth(today)) month = startOfMonth(today);
  const firstLog = logs[0]?.log_date;
  const r = monthReport(month, logs, goals, exceptions, today, label);
  const s = r.summary;
  const prevMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);
  const series = monthSeries(month, 6, logs, goals, exceptions, today);
  const trend = frequencyTrend(monthSeries(month, 3, logs, goals, exceptions, today));
  const cats = rankCategories(s.categoryDays);
  const goalResults = goals.map((g) => goalResult(g, logs, goals, exceptions, today)).filter((x) => x !== null).slice(0, 4);
  const prev = r.previous;
  const busiestDay = s.weekdayMeals.indexOf(Math.max(...s.weekdayMeals));

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Insights</h1>
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-surface p-1.5 ring-1 ring-line">
          <Link href={`/insights?month=${monthKey(prevMonth)}`} aria-label="Previous month"
            className={cx("flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface-2", firstLog && prevMonth < startOfMonth(firstLog) && "pointer-events-none opacity-30")}>‹</Link>
          <p className="font-bold">{monthLabel(month)}{r.inProgress && <span className="ml-1.5 text-xs font-semibold text-ink-3">so far</span>}</p>
          {nextMonth <= today ? (
            <Link href={`/insights?month=${monthKey(nextMonth)}`} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface-2">›</Link>
          ) : <span className="h-9 w-9" />}
        </div>
      </header>

      {s.loggedDays === 0 ? (
        <Card>
          <EmptyState emoji="📊" title={`Nothing logged in ${monthName(month)}`}>
            Once you log a few days, your summary, patterns and insights will appear here.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle action={r.goal && <StatusPill status={r.goal.status} />}>Monthly summary</CardTitle>
            <div className="grid grid-cols-3 gap-2">
              <Stat value={s.meals} label="Cheat meals" tone="brand" />
              <Stat value={r.goal ? r.goal.allowance : "—"} label="Allowance" />
              <Stat value={r.goal ? r.goal.remaining : "—"} label="Remaining" tone={r.goal?.status === "over" ? "over" : "good"} />
              <Stat value={s.cheatDays} label="Days with cheat meals" />
              <Stat value={s.cleanDays} label="Days without" tone="good" />
              <Stat value={`${s.loggingRate}%`} label={`Logged (${s.loggedDays} of ${s.elapsedDays} days)`} />
            </div>
            {r.goal && r.goal.used < s.meals && (
              <p className="mt-3 text-xs text-ink-3">{s.meals - r.goal.used} cheat meal{s.meals - r.goal.used === 1 ? " was" : "s were"} logged on days without a goal and {s.meals - r.goal.used === 1 ? "isn’t" : "aren’t"} counted against the allowance.</p>
            )}
            {s.notLoggedDays > 0 && (
              <p className="mt-3 text-xs text-ink-3">{s.notLoggedDays} day{s.notLoggedDays === 1 ? " was" : "s were"} not logged and {s.notLoggedDays === 1 ? "isn’t" : "aren’t"} counted either way.</p>
            )}
          </Card>

          <Card>
            <CardTitle>Goal performance</CardTitle>
            {!r.goal && <p className="mb-2 text-sm text-ink-2">You didn’t have a goal during {monthName(month)}. <Link href="/goals/new" className="font-semibold text-brand">Set one</Link> to track against an allowance.</p>}
            <ul className="space-y-2">
              {r.goalStatements.map((t) => (
                <li key={t} className="flex gap-2.5 text-sm"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{t}</li>
              ))}
            </ul>
          </Card>

          {r.insights.length > 0 && (
            <Card>
              <CardTitle>Personal insights</CardTitle>
              <ul className="space-y-3">
                {r.insights.map((i) => (
                  <li key={i.text} className="flex gap-3 text-sm">
                    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2">{i.icon}</span>
                    <span className="pt-1.5">{i.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {cats.length > 0 && (
            <Card>
              <CardTitle>What you ate</CardTitle>
              <p className="-mt-1 mb-3 text-xs text-ink-2">Number of days each category was logged. A day with several meals counts each category once.</p>
              <BarList caption="Food categories by days logged" valueLabel="Days"
                data={cats.map((c) => ({
                  key: c.key, label: `${emoji.get(c.key) ?? ""} ${label(c.key)}`, value: c.days,
                  detail: `${c.days} day${c.days === 1 ? "" : "s"}`,
                }))} />
            </Card>
          )}

          {s.meals > 0 && (
            <Card>
              <CardTitle>Cheat meals by day of the week</CardTitle>
              <ColumnChart caption="Cheat meals by weekday" valueLabel="Cheat meals" height={110}
                data={s.weekdayMeals.map((v, i) => ({
                  key: String(i), label: weekdayShort(i).slice(0, 2), value: v, emphasis: i === busiestDay,
                  detail: `${weekdayLong(i)}: ${v} cheat meal${v === 1 ? "" : "s"} on ${s.weekdayCheatDays[i]} day${s.weekdayCheatDays[i] === 1 ? "" : "s"}`,
                }))} />
            </Card>
          )}

          <Card>
            <CardTitle>Habit patterns</CardTitle>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-surface-2 p-3">
                <dt className="text-xs font-semibold text-ink-2">Longest stretch without a cheat meal</dt>
                <dd className="mt-1 text-lg font-extrabold">{s.longestCleanRun} logged day{s.longestCleanRun === 1 ? "" : "s"}</dd>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3">
                <dt className="text-xs font-semibold text-ink-2">Logging consistency</dt>
                <dd className="mt-1 text-lg font-extrabold">{s.loggingRate}% of days</dd>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3">
                <dt className="text-xs font-semibold text-ink-2">Meals per cheat day</dt>
                <dd className="mt-1 text-lg font-extrabold">{s.cheatDays ? (s.meals / s.cheatDays).toFixed(1) : "—"}</dd>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3">
                <dt className="text-xs font-semibold text-ink-2">3-month frequency</dt>
                <dd className="mt-1 text-lg font-extrabold">{trend === "less" ? "📉 Decreasing" : trend === "more" ? "📈 Increasing" : "Not enough data"}</dd>
              </div>
            </dl>
          </Card>
        </>
      )}

      <Card>
        <CardTitle>{monthName(month)} vs {monthName(prevMonth)}</CardTitle>
        {prev.loggedDays === 0 ? (
          <p className="text-sm text-ink-2">No entries in {monthName(prevMonth)} to compare with yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-2"><th className="pb-2 font-semibold"></th><th className="pb-2 text-right font-semibold">{monthName(month).slice(0, 3)}{r.inProgress ? " (so far)" : ""}</th><th className="pb-2 text-right font-semibold">{monthName(prevMonth).slice(0, 3)}</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {[
                ["Cheat meals", s.meals, prev.meals],
                ["Days with cheat meals", s.cheatDays, prev.cheatDays],
                ["Days logged", `${s.loggedDays}/${s.elapsedDays}`, `${prev.loggedDays}/${prev.elapsedDays}`],
                ["Cheat meals per logged day", s.loggedDays ? (s.meals / s.loggedDays).toFixed(2) : "—", prev.loggedDays ? (prev.meals / prev.loggedDays).toFixed(2) : "—"],
              ].map(([k, a, b]) => (
                <tr key={k as string} className="border-t border-line"><td className="py-2">{k}</td><td className="py-2 text-right font-bold">{a}</td><td className="py-2 text-right">{b}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardTitle>Cheat meals over time</CardTitle>
        <ColumnChart caption="Cheat meals per month" valueLabel="Cheat meals"
          data={series.map((p) => ({
            key: p.month, label: p.label, value: p.meals, emphasis: p.month === month, marker: p.allowance,
            detail: `${monthLabel(p.month)}: ${p.meals} cheat meal${p.meals === 1 ? "" : "s"}${p.allowance != null ? ` of ${p.allowance} allowed` : ""} · logged ${p.loggedDays}/${p.elapsedDays} days`,
            note: p.status ? <span className={STATUS_TEXT[p.status]}>{STATUS_MARK[p.status]}</span> : null,
          }))} />
        <p className="mt-2 text-xs text-ink-2">Dark tick = allowance for that month. ✓ within · = reached · ↑ over.</p>
      </Card>

      {goalResults.length > 0 && (
        <Card>
          <CardTitle action={<Link href="/goals" className="text-sm font-semibold text-brand">Goals</Link>}>Goal periods compared</CardTitle>
          <ul className="space-y-3">
            {goalResults.map((g) => (
              <li key={g.goal.id} className="rounded-2xl bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{describeAllowance(g.goal)}</p>
                  <StatusPill status={g.status} />
                </div>
                <p className="mt-0.5 text-xs text-ink-2">{mediumDate(g.start)} → {g.finished ? mediumDate(g.end) : "now"} · {g.days} day{g.days === 1 ? "" : "s"}</p>
                <p className="mt-1 text-sm">{g.used} of {g.allowance} cheat meals ({pct(g.used, g.allowance)}%) · logged {pct(g.loggedDays, g.days)}% of days</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.loggedDays > 0 && (
        <Link href={`/insights/recap?month=${monthKey(month)}`}
          className="flex items-center gap-3 rounded-[var(--radius-card)] bg-gradient-to-br from-brand to-[#ff9d6c] p-5 text-white">
          <span className="text-3xl" aria-hidden>🎁</span>
          <span className="flex-1">
            <span className="block font-extrabold">Your {monthName(month)} recap</span>
            <span className="block text-sm opacity-90">A shareable card with your month’s highlights</span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}
