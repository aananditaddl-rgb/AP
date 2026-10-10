"use client";

import { useState, useTransition } from "react";
import { deleteLog, saveLog } from "@/app/actions/logs";
import { relativeDay, type DateStr } from "@/lib/engine/dates";
import type { Category, FoodLog } from "@/lib/engine/types";
import { Button, Notice, cx, inputStyles } from "./ui";

const MAX_MEALS = 20;

type Mode = "ask" | "details" | "summary";

export function LogFlow({
  date, today, log, categories, onDone,
}: {
  date: DateStr;
  today: DateStr;
  log: FoodLog | null;
  categories: Category[];
  /** Called after a successful save or delete (e.g. to close a sheet). */
  onDone?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(log ? "summary" : "ask");
  const [meals, setMeals] = useState(log?.had_cheat ? log.meal_count : 1);
  const [selected, setSelected] = useState<string[]>(log?.categories ?? []);
  const [note, setNote] = useState(log?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  // Follow the server's copy when it changes (after a save, or a different date).
  const [synced, setSynced] = useState({ log, date });
  if (synced.log !== log || synced.date !== date) {
    setSynced({ log, date });
    setMode(log ? "summary" : "ask");
    setMeals(log?.had_cheat ? log.meal_count : 1);
    setSelected(log?.categories ?? []);
    setNote(log?.note ?? "");
    setConfirmDelete(false);
  }

  const isToday = date === today;
  const rel = relativeDay(date, today);
  const dayWord = isToday ? "today" : rel === "Yesterday" ? "yesterday" : `on ${rel}`;
  const catMap = new Map(categories.map((c) => [c.key, c]));

  function submit(hadCheat: boolean) {
    setError(null);
    if (hadCheat && selected.length === 0) {
      setError("Pick at least one food category.");
      return;
    }
    startTransition(async () => {
      const res = await saveLog({ date, hadCheat, mealCount: meals, categories: selected, note });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setJustSaved(true);
      setMode("summary");
      onDone?.();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteLog(date);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setJustSaved(false);
      setMode("ask");
      onDone?.();
    });
  }

  if (mode === "summary" && log) {
    return (
      <div className="animate-pop space-y-4" aria-live="polite">
        {log.had_cheat ? (
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-2xl" aria-hidden>
              {catMap.get(log.categories[0])?.emoji ?? "🍽️"}
            </span>
            <div className="min-w-0">
              <p className="text-lg font-extrabold">
                {log.meal_count} cheat meal{log.meal_count === 1 ? "" : "s"} {dayWord}
              </p>
              <p className="text-sm text-ink-2">
                {log.categories.map((k) => catMap.get(k)?.label ?? k).join(" · ")}
              </p>
              {log.note && <p className="mt-1 text-sm italic text-ink-2">“{log.note}”</p>}
              {justSaved && <p className="mt-2 text-sm font-semibold text-good">Logged. Every entry helps you see the bigger picture.</p>}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-good-soft text-2xl" aria-hidden>🥗</span>
            <div>
              <p className="text-lg font-extrabold">No cheat meals {dayWord}</p>
              <p className="text-sm font-semibold text-good">
                {justSaved ? "Logged! You’re staying on track." : "Logged — you’re staying on track."}
              </p>
            </div>
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}

        {confirmDelete ? (
          <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3">
            <p className="flex-1 text-sm font-medium">Delete this entry? The day will show as not logged.</p>
            <Button variant="small" onClick={() => setConfirmDelete(false)} disabled={pending}>Keep</Button>
            <Button variant="smallPrimary" onClick={remove} disabled={pending}>Delete</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setJustSaved(false); setMode(log.had_cheat ? "details" : "ask"); }}>
              Edit entry
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete entry">Delete</Button>
          </div>
        )}
      </div>
    );
  }

  if (mode === "details") {
    return (
      <div className="animate-pop space-y-5">
        <div className="flex items-center justify-between">
          <p className="font-bold">Tell us a little more</p>
          <button type="button" className="text-sm font-semibold text-ink-2 hover:text-ink" onClick={() => setMode(log ? "summary" : "ask")}>
            Back
          </button>
        </div>

        <div>
          <p id={`meals-${date}`} className="text-sm font-semibold">How many cheat meals did you have {dayWord}?</p>
          <div className="mt-2 flex items-center justify-between rounded-2xl bg-surface-2 p-2" role="group" aria-labelledby={`meals-${date}`}>
            <button type="button" aria-label="One fewer meal" disabled={meals <= 1}
              onClick={() => setMeals((m) => Math.max(1, m - 1))}
              className="h-12 w-12 rounded-xl bg-surface text-2xl font-bold shadow-sm disabled:opacity-40">−</button>
            <output aria-live="polite" className="text-3xl font-extrabold tabular-nums">{meals}</output>
            <button type="button" aria-label="One more meal" disabled={meals >= MAX_MEALS}
              onClick={() => setMeals((m) => Math.min(MAX_MEALS, m + 1))}
              className="h-12 w-12 rounded-xl bg-surface text-2xl font-bold shadow-sm disabled:opacity-40">+</button>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">What did you eat? <span className="font-normal text-ink-2">Pick all that apply</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = selected.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected((s) => (on ? s.filter((k) => k !== c.key) : [...s, c.key]))}
                  className={cx(
                    "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition",
                    on ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-ink-2 hover:border-ink-3",
                  )}
                >
                  <span aria-hidden>{c.emoji}</span> {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor={`note-${date}`} className="text-sm font-semibold">
            Anything to add? <span className="font-normal text-ink-2">Optional</span>
          </label>
          <input id={`note-${date}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280}
            placeholder="e.g. Pizza and ice cream" className={inputStyles} />
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <Button className="w-full" onClick={() => submit(true)} disabled={pending}>
          {pending ? "Saving…" : `Save ${meals} cheat meal${meals === 1 ? "" : "s"}`}
        </Button>
        {log?.had_cheat && (
          <button type="button" className="w-full text-center text-sm font-semibold text-ink-2 hover:text-ink" disabled={pending}
            onClick={() => submit(false)}>
            Actually, I didn&apos;t have any
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-extrabold leading-snug">
        Did you eat any junk food or have a cheat meal {dayWord}?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => { setError(null); setMode("details"); }}
          disabled={pending}
          className="flex h-20 flex-col items-center justify-center rounded-3xl bg-brand-soft text-2xl font-extrabold text-brand-strong transition hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
        >
          YES
          <span className="text-xs font-semibold opacity-80">I had a treat</span>
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={pending}
          className="flex h-20 flex-col items-center justify-center rounded-3xl bg-good-soft text-2xl font-extrabold text-good transition hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "…" : "NO"}
          <span className="text-xs font-semibold opacity-80">{isToday ? "Nothing today" : "Nothing that day"}</span>
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {log && (
        <button type="button" className="w-full text-center text-sm font-semibold text-ink-2" onClick={() => setMode("summary")}>
          Cancel
        </button>
      )}
    </div>
  );
}
