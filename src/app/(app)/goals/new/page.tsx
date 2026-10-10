import type { Metadata } from "next";
import { PageHeader, Notice } from "@/components/ui";
import { GoalForm } from "@/components/goal-form";
import { getGoals, requireViewer } from "@/lib/data";
import { currentGoal, describeAllowance } from "@/lib/engine/goals";

export const metadata: Metadata = { title: "New goal" };

export default async function NewGoalPage() {
  const viewer = await requireViewer();
  const existing = currentGoal(await getGoals());
  return (
    <>
      <PageHeader title={existing ? "Start a new goal" : "Set your goal"} back="/goals"
        subtitle="There’s no right number — choose what works for you." />
      {existing && (
        <div className="mb-4">
          <Notice>Your current goal ({describeAllowance(existing).toLowerCase()}) will end the day before the new one starts. It stays in your history.</Notice>
        </div>
      )}
      <GoalForm today={viewer.today} />
    </>
  );
}
