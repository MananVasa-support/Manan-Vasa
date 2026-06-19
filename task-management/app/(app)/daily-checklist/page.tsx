import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { DailyChecklistView } from "@/components/daily-checklist/daily-checklist-view";

export const dynamic = "force-dynamic";

export default async function DailyChecklistPage() {
  const me = await requireUser();
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="ledger-paper min-h-screen">
        <DailyChecklistView employeeId={me.id} mode="page" />
      </main>
      <DashboardFooter />
    </>
  );
}
