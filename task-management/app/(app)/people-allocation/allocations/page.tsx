import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { listAllocations } from "@/lib/queries/billing-allocation";
import { listClientOptions } from "@/lib/queries/billing-wms-proposals";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { PeopleAllocation } from "@/components/billing/people-allocation";
import { AllocationHero } from "../hero";

/**
 * PEOPLE ALLOCATION › ALLOCATIONS — who is staffed on each client.
 *
 * Clients come from the Client Address Book and employees from the existing
 * roster; neither list is duplicated here.
 */
export const dynamic = "force-dynamic";

export default async function AllocationsPage() {
  await requireUser();
  const [rows, clients, employees] = await Promise.all([
    listAllocations(),
    listClientOptions(),
    listEmployeeOptions(),
  ]);

  return (
    <PageShell width="wide">
      <AllocationHero
        title="Allocations"
        blurb="App and handholding teams staffed per client, with the products their work runs against."
      />
      <PeopleAllocation rows={rows} clients={clients} employees={employees} />
    </PageShell>
  );
}
