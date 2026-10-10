// Decides which notifications a user is due, given their local date/time.
// Pure so it can be unit tested; the cron route does the I/O.

import { addMonths, daysBetween, monthKey, monthName, type DateStr } from "./engine/dates";

export interface NotifyContext {
  today: DateStr;
  /** Local wall-clock time "HH:MM". */
  time: string;
  settings: {
    reminder_enabled: boolean; reminder_time: string; notify_goal_ending: boolean;
    notify_monthly_summary: boolean; notify_friend_activity: boolean; notify_monthly_review: boolean;
  };
  loggedToday: boolean;
  goal: { id: string; end_date: DateStr | null; status: string } | null;
  pendingRequests: { id: string; from: string }[];
}

export interface DueNotification {
  key: string;
  title: string;
  body: string;
  url: string;
}

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function dueNotifications(c: NotifyContext): DueNotification[] {
  const out: DueNotification[] = [];
  const now = minutes(c.time);
  const day = Number(c.today.slice(8, 10));

  if (c.settings.reminder_enabled && !c.loggedToday) {
    const at = minutes(c.settings.reminder_time.slice(0, 5));
    // Within 3 hours of the chosen time, so a delayed job never nags at midnight.
    if (now >= at && now < at + 180) {
      out.push({
        key: `reminder:${c.today}`, title: "Quick check-in 👋",
        body: "Did you have any junk food or cheat meals today? It takes two seconds.", url: "/home",
      });
    }
  }

  if (c.settings.notify_goal_ending && c.goal?.status === "active" && c.goal.end_date && now >= 9 * 60) {
    const left = daysBetween(c.today, c.goal.end_date) - 1;
    if (left >= 0 && left <= 2) {
      out.push({
        key: `goal_ending:${c.goal.id}`, title: "Your goal period is almost done",
        body: left === 0 ? "Today is the last day of your goal period." : `${left} day${left === 1 ? "" : "s"} left in your goal period.`,
        url: "/goals",
      });
    }
  }

  if (c.settings.notify_monthly_summary && day === 1 && now >= 9 * 60) {
    const prev = addMonths(c.today, -1);
    out.push({
      key: `monthly:${monthKey(prev)}`, title: `Your ${monthName(prev)} recap is ready 🎁`,
      body: "See your month at a glance and share it with friends.", url: `/insights/recap?month=${monthKey(prev)}`,
    });
  }

  if (c.settings.notify_monthly_review && day === 15 && now >= 18 * 60) {
    out.push({
      key: `review:${monthKey(c.today)}`, title: "Halfway through the month",
      body: "Take a moment to review your progress so far.", url: "/insights",
    });
  }

  if (c.settings.notify_friend_activity) {
    for (const r of c.pendingRequests.slice(0, 3)) {
      out.push({ key: `friendreq:${r.id}`, title: "New friend request", body: `${r.from} wants to be friends on Treatly.`, url: "/friends?tab=add" });
    }
  }
  return out;
}

