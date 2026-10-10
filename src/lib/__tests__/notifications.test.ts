import { describe, expect, it } from "vitest";
import { dueNotifications, type NotifyContext } from "../notifications";

const base: NotifyContext = {
  today: "2026-10-10", time: "20:05",
  settings: {
    reminder_enabled: true, reminder_time: "20:00:00", notify_goal_ending: true,
    notify_monthly_summary: true, notify_friend_activity: true, notify_monthly_review: true,
  },
  loggedToday: false, goal: null, pendingRequests: [],
};

describe("dueNotifications", () => {
  it("sends the daily reminder only after the chosen time and only if not logged", () => {
    expect(dueNotifications(base).map((n) => n.key)).toEqual(["reminder:2026-10-10"]);
    expect(dueNotifications({ ...base, time: "19:59" })).toEqual([]);
    expect(dueNotifications({ ...base, time: "23:30" })).toEqual([]);
    expect(dueNotifications({ ...base, loggedToday: true })).toEqual([]);
    expect(dueNotifications({ ...base, settings: { ...base.settings, reminder_enabled: false } })).toEqual([]);
  });
  it("warns when a goal period is about to end", () => {
    const n = dueNotifications({ ...base, loggedToday: true, goal: { id: "g", end_date: "2026-10-12", status: "active" } });
    expect(n).toMatchObject([{ key: "goal_ending:g", body: "2 days left in your goal period." }]);
    expect(dueNotifications({ ...base, loggedToday: true, goal: { id: "g", end_date: "2026-10-20", status: "active" } })).toEqual([]);
  });
  it("monthly summary on the 1st and friend requests", () => {
    const n = dueNotifications({ ...base, today: "2026-11-01", time: "09:30", pendingRequests: [{ id: "r1", from: "Alex" }] });
    expect(n.map((x) => x.key)).toEqual(["monthly:2026-10", "friendreq:r1"]);
    expect(n[0].url).toBe("/insights/recap?month=2026-10");
  });
});
