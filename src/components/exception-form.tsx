"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createException } from "@/app/actions/goals";
import { addDays, daysBetween, mediumDate, type DateStr } from "@/lib/engine/dates";
import { OCCASIONS } from "@/lib/engine/goals";
import type { GoalException } from "@/lib/engine/types";
import { Stepper } from "./stepper";
import { Button, Notice, cx, inputStyles } from "./ui";

export function ExceptionForm({ today, normalRule }: { today: DateStr; normalRule: string | null }) {
  const router = useRouter();
  const [occasion, setOccasion] = useState<GoalException["occasion"]>("vacation");
  const [label, setLabel] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 4));
  const [rule, setRule] = useState<GoalException["rule"]>("total");
  const [allowance, setAllowance] = useState(5);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const days = end >= start ? daysBetween(start, end) : 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createException({ occasion, label, startDate: start, endDate: end, rule, allowance, note });
      if (!res.ok) return setError(res.error);
      router.push("/goals?saved=1");
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-bold">What’s the occasion?</p>
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={occasion === o.value} onClick={() => setOccasion(o.value)}
              className={cx("inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold",
                occasion === o.value ? "border-special bg-special-soft text-special" : "border-line bg-surface text-ink-2")}>
              <span aria-hidden>{o.emoji}</span>{o.label}
            </button>
          ))}
        </div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60}
          placeholder="Name it (optional), e.g. Goa trip" aria-label="Name (optional)" className={cx(inputStyles, "mt-3")} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-ink-2">Starts</span>
          <input type="date" value={start} min={addDays(today, -60)} onChange={(e) => {
            if (!e.target.value) return;
            setStart(e.target.value);
            if (end < e.target.value) setEnd(e.target.value);
          }} className={cx(inputStyles, "px-3")} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-ink-2">Ends</span>
          <input type="date" value={end} min={start} onChange={(e) => e.target.value && setEnd(e.target.value)} className={cx(inputStyles, "px-3")} />
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">Temporary allowance</p>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Allowance type">
          {([["total", "Total for the occasion"], ["per_day", "Per day"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={rule === v} onClick={() => setRule(v)}
              className={cx("h-10 rounded-xl text-sm font-semibold", rule === v ? "bg-surface shadow-sm" : "text-ink-2")}>{l}</button>
          ))}
        </div>
        <Stepper label="temporary allowance" value={allowance} onChange={setAllowance} max={200} />
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} aria-label="Note (optional)"
        placeholder="Note (optional)" className={inputStyles} />

      <div className="rounded-2xl bg-special-soft p-4 text-special">
        <p className="text-xs font-bold uppercase tracking-wide">Here’s what happens</p>
        <p className="mt-1 text-sm font-semibold text-ink">
          {days > 0 ? <>From {mediumDate(start)} to {mediumDate(end)} ({days} day{days === 1 ? "" : "s"}) you can have up to{" "}
            {rule === "total" ? `${allowance} cheat meal${allowance === 1 ? "" : "s"} in total` : `${allowance} cheat meal${allowance === 1 ? "" : "s"} a day`}.</> : "Pick an end date on or after the start date."}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {normalRule ? `Afterwards your usual goal (${normalRule.toLowerCase()}) comes back automatically.` : "You don’t have a goal right now — this allowance still shows on your calendar and reports."}
        </p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <Button className="w-full" onClick={submit} disabled={pending || days === 0}>{pending ? "Saving…" : "Save special occasion"}</Button>
    </div>
  );
}
