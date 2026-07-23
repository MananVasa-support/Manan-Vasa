import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrPageHeader, HrPlanned } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

export default async function PreJoiningPage() {
  await requireWorkspace("hr");
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <HrPageHeader
          title="Pre-Joining"
          subtitle="Acceptance, documentation and onboarding readiness — between offer and day one."
        />
        <HrPlanned title="Pre-Joining" />
      </main>
      <DashboardFooter />
    </>
  );
}
