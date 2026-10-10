import { describe, expect, it } from "vitest";
import { addMonths, daysInMonth, startOfWeek, todayIn, weekdayIndex } from "../dates";
import {
  dayAllowance, describeAllowance, goalWindow, periodProgress, sumAllowance, windowProgress,
  completedWindows,
} from "../goals";
import { cleanStreak, loggingStreak, summarize } from "../stats";
import { goalResult, monthReport, monthSeries, frequencyTrend } from "../report";
import type { FoodLog, Goal, GoalException } from "../types";

const yes = (log_date: string, meal_count: number, categories = ["pizza"]): FoodLog => ({
  log_date, had_cheat: true, meal_count, categories, note: null,
});
const no = (log_date: string): FoodLog => ({ log_date, had_cheat: false, meal_count: 0, categories: [], note: null });

function goal(p: Partial<Goal>): Goal {
  return {
    id: p.id ?? "g1", goal_type: "monthly", allowance: 5, schedule: null,
    start_date: "2026-01-01", end_date: null, status: "active", paused_from: null,
    created_at: "2026-01-01T00:00:00Z", ...p,
  };
}

function exc(p: Partial<GoalException>): GoalException {
  return {
    id: "e1", goal_id: "g1", occasion: "vacation", label: null, start_date: "2026-10-10",
    end_date: "2026-10-14", rule: "total", allowance: 6, status: "active", note: null, ...p,
  };
}

const label = (k: string) => ({ pizza: "Pizza", sweets_desserts: "Sweets & desserts" })[k] ?? k;

describe("dates", () => {
  it("handles month math and ISO weekdays", () => {
    expect(daysInMonth("2028-02-10")).toBe(29);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(weekdayIndex("2026-10-12")).toBe(0); // Monday
    expect(weekdayIndex("2026-10-11")).toBe(6); // Sunday
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05");
  });
  it("computes the local date in a timezone", () => {
    const now = new Date("2026-10-10T20:00:00Z");
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-10-11");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-10-10");
  });
});

describe("cheat meals vs cheat days", () => {
  it("counts meals separately from days and never infers unlogged days", () => {
    const logs = [yes("2026-10-05", 3, ["pizza", "sweets_desserts"]), no("2026-10-06"), yes("2026-10-07", 1)];
    const s = summarize(logs, "2026-10-01", "2026-10-31", "2026-10-10");
    expect(s.meals).toBe(4);
    expect(s.cheatDays).toBe(2);
    expect(s.cleanDays).toBe(1);
    expect(s.loggedDays).toBe(3);
    expect(s.notLoggedDays).toBe(7);
    expect(s.elapsedDays).toBe(10);
    expect(s.loggingRate).toBe(30);
    // categories describe a day; they don't multiply the meal count
    expect(s.categoryDays).toEqual({ pizza: 2, sweets_desserts: 1 });
  });
  it("clean runs are broken by unlogged days", () => {
    const logs = [no("2026-10-01"), no("2026-10-02"), no("2026-10-04"), no("2026-10-05"), no("2026-10-06")];
    expect(summarize(logs, "2026-10-01", "2026-10-31", "2026-10-10").longestCleanRun).toBe(3);
  });
  it("streaks continue from yesterday until today is logged", () => {
    const logs = [no("2026-10-07"), yes("2026-10-08", 1), no("2026-10-09")];
    expect(loggingStreak(logs, "2026-10-10")).toBe(3);
    expect(cleanStreak(logs, "2026-10-10")).toBe(1);
    expect(loggingStreak(logs, "2026-10-11")).toBe(0);
  });
});

describe("goal allowances", () => {
  it("monthly goal gives exactly the allowance over a calendar month", () => {
    const g = goal({ allowance: 5 });
    expect(sumAllowance([g], [], "2026-10-01", "2026-10-31").allowance).toBe(5);
    expect(sumAllowance([g], [], "2026-02-01", "2026-02-28").allowance).toBe(5);
  });
  it("prorates a monthly goal that starts mid-month", () => {
    const g = goal({ allowance: 4, start_date: "2026-10-16" });
    const p = windowProgress(g, [g], [], [], "2026-10-20", "2026-10-20");
    expect(p.start).toBe("2026-10-16");
    expect(p.allowance).toBe(2); // 4 * 16/31 = 2.06
  });
  it("weekly windows run Monday to Sunday", () => {
    const g = goal({ goal_type: "weekly", allowance: 2 });
    expect(goalWindow(g, "2026-10-10")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    const logs = [yes("2026-10-05", 1), yes("2026-10-09", 2), yes("2026-10-12", 1)];
    const p = windowProgress(g, [g], [], logs, "2026-10-10", "2026-10-10");
    expect(p).toMatchObject({ allowance: 2, used: 3, remaining: 0, status: "over", pctUsed: 150, daysLeft: 2 });
  });
  it("daily and weekday-schedule goals", () => {
    const d = goal({ goal_type: "daily", allowance: 1 });
    expect(windowProgress(d, [d], [], [yes("2026-10-10", 1)], "2026-10-10", "2026-10-10").status).toBe("reached");
    const s = goal({ goal_type: "weekday_schedule", allowance: 3, schedule: [0, 0, 0, 0, 0, 2, 1] });
    expect(dayAllowance([s], [], "2026-10-10")).toBe(2); // Saturday
    expect(dayAllowance([s], [], "2026-10-12")).toBe(0); // Monday
    expect(windowProgress(s, [s], [], [], "2026-10-10", "2026-10-10").allowance).toBe(3);
    expect(describeAllowance(s)).toBe("Weekly plan: Sat 2, Sun 1");
  });
  it("a fixed period total differs from a recurring monthly allowance", () => {
    const fixed = goal({ goal_type: "period_total", allowance: 8, start_date: "2026-10-01", end_date: "2026-11-14" });
    const p = periodProgress(fixed, [fixed], [], [yes("2026-10-03", 2)], "2026-10-10");
    expect(p).toMatchObject({ allowance: 8, used: 2, remaining: 6, pctUsed: 25, daysLeft: 36 });
    expect(windowProgress(fixed, [fixed], [], [], "2026-10-10", "2026-10-10").allowance).toBe(8);
  });
  it("no goal means no allowance", () => {
    expect(dayAllowance([], [], "2026-10-10")).toBeNull();
    const g = goal({ start_date: "2026-10-15" });
    expect(sumAllowance([g], [], "2026-10-01", "2026-10-14").coveredDays).toBe(0);
  });
  it("paused goals stop accruing; cancelled goals never do", () => {
    const paused = goal({ status: "paused", paused_from: "2026-10-16" });
    expect(sumAllowance([paused], [], "2026-10-01", "2026-10-31")).toEqual({ allowance: 2, coveredDays: 15 });
    const cancelled = goal({ status: "cancelled" });
    expect(dayAllowance([cancelled], [], "2026-10-10")).toBeNull();
  });
});

describe("temporary exceptions", () => {
  it("replace the allowance during their dates and revert afterwards", () => {
    const g = goal({ allowance: 4 }); // 4 per month
    const vac = exc({ start_date: "2026-10-10", end_date: "2026-10-14", rule: "total", allowance: 6 });
    // October: 26 normal days at 4/31 + 6 vacation meals = 3.35 + 6 = 9.35 → 9
    expect(sumAllowance([g], [vac], "2026-10-01", "2026-10-31").allowance).toBe(9);
    expect(dayAllowance([g], [vac], "2026-10-12")).toBeCloseTo(1.2);
    expect(dayAllowance([g], [vac], "2026-10-15")).toBeCloseTo(4 / 31);
    // November is untouched
    expect(sumAllowance([g], [vac], "2026-11-01", "2026-11-30").allowance).toBe(4);
  });
  it("per-day exceptions and cancelled exceptions", () => {
    const g = goal({ goal_type: "daily", allowance: 0 });
    const bday = exc({ start_date: "2026-10-10", end_date: "2026-10-10", rule: "per_day", allowance: 2 });
    expect(dayAllowance([g], [bday], "2026-10-10")).toBe(2);
    expect(dayAllowance([g], [{ ...bday, status: "cancelled" }], "2026-10-10")).toBe(0);
  });
});

describe("goal history stays intact", () => {
  it("versioned goals each govern their own dates", () => {
    const v1 = goal({ id: "v1", allowance: 4, start_date: "2026-09-01", end_date: "2026-10-15", status: "ended" });
    const v2 = goal({ id: "v2", allowance: 8, start_date: "2026-10-16", created_at: "2026-10-16T00:00:00Z" });
    // Sept unaffected by the later change
    expect(sumAllowance([v1, v2], [], "2026-09-01", "2026-09-30").allowance).toBe(4);
    // Oct: 15 days of 4/31 + 16 days of 8/31 = 1.94 + 4.13 = 6.06
    expect(sumAllowance([v1, v2], [], "2026-10-01", "2026-10-31").allowance).toBe(6);
    const logs = [yes("2026-09-03", 2), yes("2026-10-20", 1)];
    expect(goalResult(v1, logs, [v1, v2], [], "2026-10-20")).toMatchObject({ allowance: 6, used: 2, finished: true });
  });
  it("lists finished windows", () => {
    const g = goal({ goal_type: "weekly", allowance: 2, start_date: "2026-09-30" });
    const w = completedWindows(g, "2026-10-14");
    expect(w.map((x) => x.start)).toEqual(["2026-09-30", "2026-10-05"]);
  });
});

describe("monthly report", () => {
  const g = goal({ allowance: 5, start_date: "2026-09-01" });
  const logs = [
    yes("2026-09-05", 2), yes("2026-09-06", 2, ["sweets_desserts"]), yes("2026-09-12", 2), yes("2026-09-19", 2),
    no("2026-09-01"), no("2026-09-02"),
    yes("2026-10-03", 2, ["sweets_desserts"]), yes("2026-10-04", 1, ["sweets_desserts", "pizza"]),
    no("2026-10-05"), no("2026-10-06"), no("2026-10-07"), no("2026-10-08"), no("2026-10-09"), no("2026-10-10"),
  ];
  it("summarises a finished month against its goal", () => {
    const r = monthReport("2026-09-01", logs, [g], [], "2026-10-10", label);
    expect(r.inProgress).toBe(false);
    expect(r.summary).toMatchObject({ meals: 8, cheatDays: 4, cleanDays: 2, loggedDays: 6, notLoggedDays: 24 });
    expect(r.goal).toMatchObject({ allowance: 5, used: 8, status: "over" });
    expect(r.goalStatements[0]).toBe("You went over your allowance by 3 cheat meals.");
    expect(r.insights.map((i) => i.text)).toContain("Most of your recorded cheat meals were on weekends.");
  });
  it("compares an in-progress month with the same point last month", () => {
    const r = monthReport("2026-10-01", logs, [g], [], "2026-10-10", label);
    expect(r.inProgress).toBe(true);
    expect(r.summary).toMatchObject({ meals: 3, loggedDays: 8, elapsedDays: 10, longestCleanRun: 6 });
    expect(r.previousSamePoint.meals).toBe(4); // Sept 1–10
    expect(r.goalStatements[0]).toBe("You've used 3 of your 5 allotted cheat meals so far.");
    const texts = r.insights.map((i) => i.text);
    expect(texts).toContain("1 cheat meal fewer than at this point last month.");
    expect(texts).toContain("You recorded sweets & desserts more often than any other category (2 days).");
    expect(texts).toContain("Your longest stretch without a cheat meal was 6 logged days.");
  });
  it("builds a month series and trend", () => {
    const s = monthSeries("2026-10-01", 3, logs, [g], [], "2026-10-10");
    expect(s.map((p) => [p.label, p.meals, p.allowance])).toEqual([["Aug", 0, null], ["Sep", 8, 5], ["Oct", 3, 5]]);
    expect(frequencyTrend(s)).toBeNull();
  });
});
