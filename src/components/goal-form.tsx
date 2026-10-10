"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createGoal, updateGoal } from "@/app/actions/goals";
import { addDays, addMonths, daysBetween, mediumDate, weekdayShort, type DateStr } from "@/lib/engine/dates";
import { describeAllowance } from "@/lib/engine/goals";
import type { Goal, GoalType } from "@/lib/engine/types";
import { Stepper } from "./stepper";
import { Button, Notice, cx, inputStyles } from "./ui";

const TYPES: { value: GoalType; title: string; hint: string; emoji: string }[] = [
  { value: "monthly", title: "Monthly allowance", hint: "e.g. 4 cheat meals each calendar month", emoji: "🗓️" },
  { value: "weekly", title: "Weekly allowance", hint: "e.g. 2 a week (weeks run Monday–Sunday)", emoji: "📆" },
  { value: "daily", title: "Daily allowance", hint: "e.g. up to 1 a day", emoji: "☀️" },
  { value: "weekday_schedule", title: "Weekday plan", hint: "Choose days, e.g. 2 on Saturday and 1 on Sunday", emoji: "🧩" },
  { value: "period_total", title: "Total for a set period", hint: "e.g. 8 cheat meals over 45 days", emoji: "🎯" },
];

type Preset = "ongoing" | "7d" | "14d" | "30d" | "3m" | "6m" | "custom";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "ongoing", label: "Ongoing" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "custom", label: "Custom dates" },
];

function endFor(preset: Preset, start: DateStr, customEnd: DateStr): DateStr | null {
  switch (preset) {
    case "ongoing": return null;
    case "7d": return addDays(start, 6);
    case "14d": return addDays(start, 13);
    case "30d": return addDays(start, 29);
    case "3m": return addDays(addMonths(start, 3), -1);
    case "6m": return addDays(addMonths(start, 6), -1);
    case "custom": return customEnd;
  }
}

function defaultAllowance(t: GoalType) {
  return { monthly: 4, weekly: 2, daily: 1, weekday_schedule: 0, period_total: 8 }[t];
}

export function GoalForm({ today, goal }: { today: DateStr; goal?: Goal }) {
  const router = useRouter();
  const editing = Boolean(goal);
  const started = goal ? goal.start_date < today : false;
  const [type, setType] = useState<GoalType>(goal?.goal_type ?? "monthly");
  const [allowance, setAllowance] = useState(goal?.allowance ?? 4);
  const [schedule, setSchedule] = useState<number[]>(goal?.schedule ?? [0, 0, 0, 0, 1, 2, 1]);
  const [start, setStart] = useState<DateStr>(goal?.start_date ?? today);
  const [preset, setPreset] = useState<Preset>(goal ? (goal.end_date ? "custom" : "ongoing") : "ongoing");
  const [customEnd, setCustomEnd] = useState<DateStr>(goal?.end_date ?? addDays(today, 44));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectivePreset = type === "period_total" && preset === "ongoing" ? "30d" : preset;
  const end = endFor(effectivePreset, start, customEnd);
  const weeklyTotal = schedule.reduce((a, b) => a + b, 0);
  const preview = useMemo(() => {
    const rule = describeAllowance({ goal_type: type, allowance: type === "weekday_schedule" ? weeklyTotal : allowance, schedule });
    const when = end
      ? `from ${mediumDate(start)} to ${mediumDate(end)} (${daysBetween(start, end)} days)`
      : `starting ${start === today ? "today" : mediumDate(start)}, with no end date`;
    return `${rule}, ${when}.`;
  }, [type, allowance, schedule, weeklyTotal, start, end, today]);

  const ruleChanged = goal && (goal.goal_type !== type ||
    (type === "weekday_schedule" ? JSON.stringify(goal.schedule) !== JSON.stringify(schedule) : goal.allowance !== allowance));

  function submit() {
    setError(null);
    startTransition(async () => {
      const input = {
        goalType: type, allowance: type === "weekday_schedule" ? weeklyTotal : allowance,
        schedule: type === "weekday_schedule" ? schedule : null, startDate: start, endDate: end,
      };
      const res = editing ? await updateGoal(input) : await createGoal(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/goals?saved=1");
    });
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold">How do you want to set your allowance?</legend>
        {TYPES.map((t) => (
          <label key={t.value}
            className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition",
              type === t.value ? "border-brand bg-brand-soft/60" : "border-line bg-surface hover:border-ink-3")}>
            <input type="radio" name="goal_type" value={t.value} checked={type === t.value} className="sr-only"
              onChange={() => {
                setType(t.value);
                if (!goal || goal.goal_type !== t.value) setAllowance(defaultAllowance(t.value));
                else setAllowance(goal.allowance);
              }} />
            <span className="text-xl" aria-hidden>{t.emoji}</span>
            <span className="flex-1">
              <span className="block font-bold">{t.title}</span>
              <span className="block text-xs text-ink-2">{t.hint}</span>
            </span>
            <span aria-hidden className={cx("h-5 w-5 rounded-full border-2", type === t.value ? "border-brand bg-brand shadow-[inset_0_0_0_3px_var(--surface)]" : "border-line")} />
          </label>
        ))}
      </fieldset>

      {type === "weekday_schedule" ? (
        <div>
          <p className="mb-2 text-sm font-bold">Cheat meals allowed on each day</p>
          <div className="space-y-2">
            {schedule.map((n, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-10 text-sm font-semibold">{weekdayShort(i)}</span>
                <div className="flex-1">
                  <Stepper size="sm" label={`${weekdayShort(i)} allowance`} value={n} max={20}
                    onChange={(v) => setSchedule((s) => s.map((x, j) => (j === i ? v : x)))} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-2">{weeklyTotal} cheat meal{weeklyTotal === 1 ? "" : "s"} a week in total.</p>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm font-bold">
            {{ monthly: "Cheat meals per month", weekly: "Cheat meals per week", daily: "Cheat meals per day", period_total: "Cheat meals in total" }[type]}
          </p>
          <Stepper label="allowance" value={allowance} onChange={setAllowance} max={type === "period_total" ? 500 : type === "daily" ? 20 : 200} />
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-bold">How long do you want to follow it?</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.filter((p) => !(type === "period_total" && p.value === "ongoing")).map((p) => (
            <button key={p.value} type="button" aria-pressed={effectivePreset === p.value} onClick={() => setPreset(p.value)}
              className={cx("h-10 rounded-full border px-4 text-sm font-semibold transition",
                effectivePreset === p.value ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-ink-2")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-ink-2">Starts</span>
            <input type="date" value={start} disabled={started} min={editing ? today : undefined}
              onChange={(e) => e.target.value && setStart(e.target.value)} className={cx(inputStyles, "px-3")} />
          </label>
          {effectivePreset === "custom" ? (
            <label className="space-y-1">
              <span className="text-xs font-semibold text-ink-2">Ends</span>
              <input type="date" value={customEnd} min={start} onChange={(e) => e.target.value && setCustomEnd(e.target.value)}
                className={cx(inputStyles, "px-3")} />
            </label>
          ) : (
            <div className="space-y-1">
              <span className="text-xs font-semibold text-ink-2">Ends</span>
              <p className="flex h-12 items-center px-1 font-semibold">{end ? mediumDate(end) : "No end date"}</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-surface-2 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Your goal</p>
        <p className="mt-1 font-semibold">{preview}</p>
        {type === "weekly" && <p className="mt-1 text-xs text-ink-2">Weeks run Monday to Sunday. A partial first or last week gets a fair share of the allowance.</p>}
        {type === "monthly" && <p className="mt-1 text-xs text-ink-2">Uses calendar months. If you start mid-month, this month’s allowance is prorated.</p>}
        {editing && started && ruleChanged && (
          <p className="mt-2 text-xs font-medium text-special">
            The new allowance applies from today. Past days keep the goal they were tracked under.
          </p>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <Button className="w-full" onClick={submit} disabled={pending}>
        {pending ? "Saving…" : editing ? "Save changes" : "Start this goal"}
      </Button>
    </div>
  );
}
