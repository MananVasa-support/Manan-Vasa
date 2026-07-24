import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { HrLanding } from "@/components/hr/hr-landing";

export const dynamic = "force-dynamic";

/**
 * HR front door — a premium, light-theme, animated welcome (see HrLanding):
 * a "Welcome to HR" hero over a soft aurora with a self-hosted welcome
 * animation, then the employee journey as a fanned 3D card deck — the five
 * lifecycle stages plus Holiday List and Help Desk (seven cards).
 */
export default async function HrHubPage() {
  // Guard IN THE PAGE — the (app) layout gate alone isn't reliable on prod.
  await requireWorkspace("hr");
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrLanding />
    </>
  );
}
