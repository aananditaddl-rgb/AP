import Link from "next/link";
import { mediumDate } from "@/lib/engine/dates";
import type { Progress } from "@/lib/engine/goals";
import { ProgressBar, StatusPill } from "./ui";

export function statusMessage(p: Progress): string {
  if (p.status === "over") {
    return `${p.used - p.allowance} over your allowance — no stress, keep logging honestly.`;
  }
  if (p.status === "reached") return "You've used your full allowance for this period.";
  if (p.remaining === 1) return "1 cheat meal left in this period.";
  return `${p.remaining} cheat meals left in this period.`;
}

export function GoalProgressBlock({ p, title, compact }: { p: Progress; title: string; compact?: boolean }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-2">{title}</p>
          <p className="mt-0.5 text-[28px] font-extrabold leading-tight tabular-nums">
            {p.used} <span className="text-lg font-bold text-ink-2">of {p.allowance}</span>
          </p>
          <p className="text-sm text-ink-2">cheat meals used</p>
        </div>
        <StatusPill status={p.status} />
      </div>
      <div className="mt-3">
        <ProgressBar used={p.used} allowance={p.allowance} status={p.status} label={title} />
      </div>
      <div className="mt-2 flex justify-between text-xs font-medium text-ink-2">
        <span>{p.pctUsed}% of allowance used</span>
        <span>
          {p.daysLeft > 0 ? `${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left` : `Ended ${mediumDate(p.end)}`}
        </span>
      </div>
      {!compact && <p className="mt-3 text-sm font-medium">{statusMessage(p)}</p>}
    </div>
  );
}

export function NoGoalCard() {
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-2xl" aria-hidden>🎯</span>
      <div className="flex-1">
        <p className="font-bold">Set a cheat meal goal</p>
        <p className="text-sm text-ink-2">Choose how many treats fit your plan — weekly, monthly or your own schedule.</p>
      </div>
      <Link href="/goals/new" className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-ink">Set goal</Link>
    </div>
  );
}
