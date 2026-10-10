import { BottomNav } from "@/components/bottom-nav";
import { getPendingRequestCount, requireViewer } from "@/lib/data";
import { TimezoneSync } from "@/components/timezone-sync";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const pending = await getPendingRequestCount();
  return (
    <>
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">{children}</main>
      <BottomNav badges={{ "/friends": pending }} />
      <TimezoneSync saved={viewer.settings.timezone} />
    </>
  );
}
