import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const me = await requireUser();
  const [all, clients] = await Promise.all([
    listEmployees(),
    listActiveClientNames(),
  ]);
  const options = all.map((e) => ({ id: e.id, name: e.name }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[720px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1 className="text-display-lg text-ink-strong">New task</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Create a task and assign it to a doer. The initiator approves it
            once it's done.
          </p>
        </header>
        <div
          className="bg-surface-card rounded-section border border-hairline p-6"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <NewTaskForm
            employees={options}
            clients={clients}
            defaults={{ initiatorId: me.id }}
          />
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
