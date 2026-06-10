import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import {
  NewEntryDialog,
  OutstandingWorkspace,
} from "@/components/outstanding/outstanding-workspace";
import { requireUser } from "@/lib/auth/current";
import { listOutstandingEntries } from "@/lib/queries/outstanding";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";

export const dynamic = "force-dynamic";

export default async function OutstandingPage() {
  const me = await requireUser();
  const [rows, employees, clients] = await Promise.all([
    listOutstandingEntries(),
    me.isAdmin ? listEmployeeOptions() : Promise.resolve([]),
    me.isAdmin ? listActiveClientNames() : Promise.resolve([]),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1000px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-display-lg text-ink-strong">Outstanding Tracker</h1>
            <p className="text-body-lg text-ink-subtle mt-1">
              Receivables and collection follow-ups. Open an entry to log a
              touch or record a payment.
            </p>
          </div>
          {me.isAdmin && <NewEntryDialog employees={employees} clients={clients} />}
        </header>
        <OutstandingWorkspace rows={rows} employees={employees} isAdmin={me.isAdmin} />
      </main>
      <DashboardFooter />
    </>
  );
}
