import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { GoalForm } from "@/components/goal-form";
import { getGoals, requireViewer } from "@/lib/data";
import { currentGoal } from "@/lib/engine/goals";

export const metadata: Metadata = { title: "Edit goal" };

export default async function EditGoalPage() {
  const viewer = await requireViewer();
  const goal = currentGoal(await getGoals());
  if (!goal) redirect("/goals/new");
  return (
    <>
      <PageHeader title="Edit your goal" back="/goals" subtitle="Change the allowance or how long it runs." />
      <GoalForm today={viewer.today} goal={goal} />
    </>
  );
}
