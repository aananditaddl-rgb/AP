import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar-view";
import { Stat } from "@/components/ui";
import { getCategories, getExceptions, getLogs, requireViewer } from "@/lib/data";
import { addMonths, endOfMonth, isValidDateStr, monthKey, startOfMonth } from "@/lib/engine/dates";
import { summarize } from "@/lib/engine/stats";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const today = viewer.today;
  const date = isValidDateStr(sp.date) && sp.date <= today ? sp.date : null;
  const monthParam = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : null;
  let month = startOfMonth(date ?? (monthParam && isValidDateStr(monthParam) ? monthParam : today));
  if (month > startOfMonth(today)) month = startOfMonth(today);

  const [logs, exceptions, categories] = await Promise.all([
    getLogs(month, endOfMonth(month)), getExceptions(), getCategories(),
  ]);
  const s = summarize(logs, month, endOfMonth(month), today);
  const next = addMonths(month, 1);

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Calendar</h1>
        <p className="text-sm text-ink-2">Your daily records. Missed a day? Tap it to add it.</p>
      </header>
      <CalendarView
        key={month}
        month={month}
        prevMonth={monthKey(addMonths(month, -1))}
        nextMonth={next <= today ? monthKey(next) : null}
        today={today}
        logs={logs}
        exceptions={exceptions}
        categories={categories}
        initialDate={date}
      />
      <div className="grid grid-cols-4 gap-2">
        <Stat value={s.meals} label="Cheat meals" tone="brand" />
        <Stat value={s.cheatDays} label="Cheat days" />
        <Stat value={s.cleanDays} label="Clean days" tone="good" />
        <Stat value={s.notLoggedDays} label="Not logged" />
      </div>
    </div>
  );
}
