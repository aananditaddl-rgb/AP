"use client";

import { useState, useTransition } from "react";
import { cancelException, endGoal, pauseGoal, resumeGoal, updateExceptionDates } from "@/app/actions/goals";
import { addDays, type DateStr } from "@/lib/engine/dates";
import type { GoalException } from "@/lib/engine/types";
import { Button, ButtonLink, Notice, cx, inputStyles } from "./ui";

export function GoalControls({ status, started }: { status: "active" | "paused"; started: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    setConfirmEnd(false);
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink href="/goals/edit" variant="secondary">Edit goal</ButtonLink>
        {status === "paused" ? (
          <Button onClick={() => run(resumeGoal)} disabled={pending}>Resume</Button>
        ) : (
          <Button variant="secondary" onClick={() => run(pauseGoal)} disabled={pending || !started}>Pause</Button>
        )}
        <ButtonLink href="/goals/new" variant="secondary">New goal</ButtonLink>
        <Button variant="danger" onClick={() => setConfirmEnd(true)} disabled={pending}>End goal</Button>
      </div>
      {confirmEnd && (
        <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3">
          <p className="flex-1 text-sm">End this goal today? It’ll move to your goal history.</p>
          <Button variant="small" onClick={() => setConfirmEnd(false)}>Keep</Button>
          <Button variant="smallPrimary" onClick={() => run(endGoal)} disabled={pending}>End</Button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function ExceptionControls({ ex, today }: { ex: GoalException; today: DateStr }) {
  const started = ex.start_date <= today;
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(ex.start_date);
  const [end, setEnd] = useState(ex.end_date);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => startTransition(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    else { setEditing(false); setConfirm(false); }
  });

  return (
    <div className="mt-3 space-y-2">
      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-ink-2">Starts</span>
              <input type="date" value={start} disabled={started} min={today} onChange={(e) => e.target.value && setStart(e.target.value)} className={cx(inputStyles, "h-10 px-2 text-sm")} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-ink-2">Ends</span>
              <input type="date" value={end} min={started ? addDays(today, -1) : start} onChange={(e) => e.target.value && setEnd(e.target.value)} className={cx(inputStyles, "h-10 px-2 text-sm")} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="small" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="smallPrimary" disabled={pending} onClick={() => run(() => updateExceptionDates(ex.id, start, end))}>Save dates</Button>
          </div>
        </div>
      ) : confirm ? (
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2.5">
          <p className="flex-1 text-sm">{started ? "End it now? Days already passed keep their allowance." : "Cancel this special occasion?"}</p>
          <Button variant="small" onClick={() => setConfirm(false)}>Keep</Button>
          <Button variant="smallPrimary" disabled={pending} onClick={() => run(() => cancelException(ex.id))}>{started ? "End now" : "Cancel it"}</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="small" onClick={() => setEditing(true)}>{started ? "Extend or shorten" : "Change dates"}</Button>
          <Button variant="small" onClick={() => setConfirm(true)}>{started ? "End early" : "Cancel"}</Button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
