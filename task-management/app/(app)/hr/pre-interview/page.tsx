import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrPageHeader, HrPlanned } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

export default async function PreInterviewPage() {
  await requireWorkspace("hr");
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <HrPageHeader
          title="Pre-Interview"
          subtitle="Sourcing, screening and interview scheduling — everything before a candidate walks in."
        />
        <HrPlanned title="Pre-Interview" />
      </main>
      <DashboardFooter />
    </>
  );
}
