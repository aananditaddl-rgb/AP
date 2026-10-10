"use client";

import Link from "next/link";
import { useState } from "react";
import {
  addDays, daysInMonth, mediumDate, monthLabel, relativeDay, weekdayIndex, weekdayShort, type DateStr,
} from "@/lib/engine/dates";
import { exceptionForDay, exceptionTitle, occasionMeta } from "@/lib/engine/goals";
import type { Category, FoodLog, GoalException } from "@/lib/engine/types";
import { LogFlow } from "./log-flow";
import { Card, cx } from "./ui";

export function CalendarView({
  month, prevMonth, nextMonth, today, logs, exceptions, categories, initialDate,
}: {
  month: DateStr; prevMonth: string; nextMonth: string | null; today: DateStr;
  logs: FoodLog[]; exceptions: GoalException[]; categories: Category[]; initialDate: DateStr | null;
}) {
  const [selected, setSelected] = useState<DateStr | null>(initialDate);
  const byDate = new Map(logs.map((l) => [l.log_date, l]));
  const lead = weekdayIndex(month);
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => addDays(month, i));
  const selLog = selected ? byDate.get(selected) ?? null : null;
  const selEx = selected ? exceptionForDay(exceptions, selected) : null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <Link href={`/calendar?month=${prevMonth}`} aria-label="Previous month" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-2">‹</Link>
          <h2 className="font-extrabold" aria-live="polite">{monthLabel(month)}</h2>
          {nextMonth ? (
            <Link href={`/calendar?month=${nextMonth}`} aria-label="Next month" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-2">›</Link>
          ) : <span className="h-10 w-10" />}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={monthLabel(month)}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} role="columnheader" className="pb-1 text-[11px] font-bold uppercase text-ink-3">{weekdayShort(i).slice(0, 2)}</div>
          ))}
          {Array.from({ length: lead }, (_, i) => <div key={`pad${i}`} />)}
          {days.map((d) => {
            const log = byDate.get(d);
            const future = d > today;
            const ex = exceptionForDay(exceptions, d);
            const state = future ? "future" : !log ? "none" : log.had_cheat ? "cheat" : "clean";
            const label = `${mediumDate(d)}: ${state === "future" ? "upcoming" : state === "none" ? "not logged" : state === "clean" ? "no cheat meals" : `${log!.meal_count} cheat meal${log!.meal_count === 1 ? "" : "s"}`}${ex ? `, ${exceptionTitle(ex)}` : ""}`;
            return (
              <button
                key={d}
                type="button"
                aria-label={label}
                aria-pressed={selected === d}
                disabled={future}
                onClick={() => setSelected(d)}
                className={cx(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-semibold transition",
                  state === "clean" && "bg-good-soft text-good",
                  state === "cheat" && "bg-brand-soft text-brand-strong",
                  state === "none" && "border border-dashed border-line text-ink-2",
                  state === "future" && "text-ink-3/60",
                  d === today && "ring-2 ring-ink/70",
                  selected === d && "outline-2 outline-offset-2 outline-brand",
                )}
              >
                <span className="leading-none">{Number(d.slice(8))}</span>
                {state === "cheat" && <span className="mt-0.5 text-[10px] font-extrabold leading-none">×{log!.meal_count}</span>}
                {state === "clean" && <span className="mt-0.5 text-[10px] leading-none" aria-hidden>✓</span>}
                {ex && <span aria-hidden className="absolute inset-x-1.5 bottom-0.5 h-1 rounded-full bg-special" />}
              </button>
            );
          })}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-ink-2">
          <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-good-soft ring-1 ring-good/40" /> No cheat meal</li>
          <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-brand-soft ring-1 ring-brand/40" /> Cheat meal(s)</li>
          <li className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded border border-dashed border-ink-3" /> Not logged</li>
          <li className="flex items-center gap-2"><span className="h-1.5 w-3.5 rounded-full bg-special" /> Special occasion</li>
        </ul>
      </Card>

      {selected ? (
        <Card className="animate-pop" aria-label={`Entry for ${mediumDate(selected)}`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold">{relativeDay(selected, today)} · {mediumDate(selected)}</h2>
            <button type="button" className="text-sm font-semibold text-ink-2" onClick={() => setSelected(null)}>Close</button>
          </div>
          {selEx && (
            <p className="mb-4 rounded-xl bg-special-soft px-3 py-2 text-sm text-special">
              {occasionMeta(selEx.occasion).emoji} {exceptionTitle(selEx)} — special allowance on this day
            </p>
          )}
          <LogFlow key={selected} date={selected} today={today} log={selLog} categories={categories} />
        </Card>
      ) : (
        <p className="text-center text-sm text-ink-2">Tap a day to see, add or edit its entry.</p>
      )}
    </div>
  );
}
