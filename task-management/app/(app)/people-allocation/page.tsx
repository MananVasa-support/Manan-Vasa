import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { listAllocations } from "@/lib/queries/billing-allocation";
import { AllocationDashboard } from "@/components/billing/allocation-dashboard";
import { AllocationHero } from "./hero";

/**
 * PEOPLE ALLOCATION › DASHBOARD — how many people each lead carries, and on
 * which products, split into an App board and a Handholding board.
 */
export const dynamic = "force-dynamic";

export default async function AllocationDashboardPage() {
  await requireUser();
  const rows = await listAllocations();

  return (
    <PageShell width="wide">
      <AllocationHero
        title="Dashboard"
        blurb="People under each lead and the products they are staffed on — one board for App, one for Handholding."
      />
      <AllocationDashboard rows={rows} />
    </PageShell>
  );
}
