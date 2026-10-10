import type { DateStr } from "./dates";

export type GoalType = "daily" | "weekly" | "monthly" | "weekday_schedule" | "period_total";
export type GoalStatus = "active" | "paused" | "ended" | "cancelled";

export interface FoodLog {
  log_date: DateStr;
  had_cheat: boolean;
  meal_count: number;
  categories: string[];
  note: string | null;
}

export interface Goal {
  id: string;
  goal_type: GoalType;
  /** Meals per window. For weekday_schedule this is the weekly sum of `schedule`. */
  allowance: number;
  /** Mon..Sun allowances, only for weekday_schedule. */
  schedule: number[] | null;
  start_date: DateStr;
  end_date: DateStr | null;
  status: GoalStatus;
  paused_from: DateStr | null;
  previous_goal_id?: string | null;
  created_at: string;
}

export type ExceptionRule = "per_day" | "total";
export type Occasion =
  | "vacation" | "birthday" | "wedding" | "festival" | "holiday" | "celebration" | "other";

export interface GoalException {
  id: string;
  goal_id: string | null;
  occasion: Occasion;
  label: string | null;
  start_date: DateStr;
  end_date: DateStr;
  rule: ExceptionRule;
  allowance: number;
  status: "active" | "cancelled";
  note: string | null;
  created_at?: string;
}

export interface Category {
  key: string;
  label: string;
  emoji: string;
  sort_order: number;
}

/** Where the user stands against an allowance. */
export type ProgressStatus = "within" | "reached" | "over";
