import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { IncentiveFormDialog } from "@/components/incentive/incentive-form-dialog";
import { IncentiveList } from "@/components/incentive/incentive-list";
import { requireUser } from "@/lib/auth/current";
import { listIncentiveRequests } from "@/lib/queries/incentive";

export const dynamic = "force-dynamic";

export default async function IncentivePage() {
  const me = await requireUser();
  const rows = await listIncentiveRequests({
    employeeId: me.id,
    isAdmin: me.isAdmin,
  });

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[860px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-display-lg text-ink-strong">Incentive</h1>
            <p className="text-body-lg text-ink-subtle mt-1">
              {me.isAdmin
                ? `Team incentive requests — ${pendingCount} pending review.`
                : "File incentive requests and track their approval."}
            </p>
          </div>
          <IncentiveFormDialog />
        </header>
        <IncentiveList rows={rows} isAdmin={me.isAdmin} />
      </main>
      <DashboardFooter />
    </>
  );
}
