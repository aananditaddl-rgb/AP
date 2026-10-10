import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ExceptionForm } from "@/components/exception-form";
import { getGoals, requireViewer } from "@/lib/data";
import { currentGoal, describeAllowance } from "@/lib/engine/goals";

export const metadata: Metadata = { title: "Special occasion" };

export default async function OccasionPage() {
  const viewer = await requireViewer();
  const goal = currentGoal(await getGoals());
  return (
    <>
      <PageHeader title="Plan a special occasion" back="/goals"
        subtitle="Vacations, birthdays, weddings, festivals — enjoy them guilt-free." />
      <ExceptionForm today={viewer.today} normalRule={goal ? describeAllowance(goal) : null} />
    </>
  );
}
