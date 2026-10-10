import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { RecapCard } from "@/components/recap-card";
import { RecapActions } from "@/components/recap-actions";
import { getAllLogs, getCategories, getExceptions, getGoals, requireViewer } from "@/lib/data";
import { monthKey, startOfMonth } from "@/lib/engine/dates";
import { buildRecap } from "@/lib/recap";

export const metadata: Metadata = { title: "Monthly recap" };

export default async function RecapPage({ searchParams }: PageProps<"/insights/recap">) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const requested = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : null;
  let month = startOfMonth(requested ?? viewer.today);
  if (month > startOfMonth(viewer.today)) month = startOfMonth(viewer.today);
  const [logs, goals, exceptions, categories] = await Promise.all([getAllLogs(), getGoals(), getExceptions(), getCategories()]);
  const recap = buildRecap(month, logs, goals, exceptions, viewer.today, categories);

  return (
    <>
      <PageHeader title="Your recap" back={`/insights?month=${monthKey(month)}`}
        subtitle="Share your highlights — not your whole food log." />
      <RecapCard recap={recap} name={viewer.profile.display_name} />
      <RecapActions month={monthKey(month)} recap={recap} />
    </>
  );
}
