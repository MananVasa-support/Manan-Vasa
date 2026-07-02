import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { listEmployees } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { listProjectNodeOptions } from "@/lib/queries/projects";
import { getTaskById } from "@/lib/queries/tasks";
import { requireUser } from "@/lib/auth/current";
import { withRetry } from "@/lib/db/with-timeout";
import type { TaskPriority } from "@/db/enums";

export const dynamic = "force-dynamic";

// Retry the roster loads on a fresh pooled connection so a single stale socket
// never crashes the create page.
const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

interface PageProps {
  searchParams: Promise<{ from?: string; doer?: string }>;
}

export default async function NewTaskPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const { from, doer } = await searchParams;
  const [all, clients, subjects, projectNodes] = await Promise.all([
    withRetry(() => listEmployees(), { ...RETRY, label: "nt-employees" }),
    withRetry(() => listActiveClientNames(), { ...RETRY, label: "nt-clients" }),
    withRetry(() => listActiveSubjectNames(), { ...RETRY, label: "nt-subjects" }),
    withRetry(() => listProjectNodeOptions(), { ...RETRY, label: "nt-projects" }),
  ]);
  const options = all.map((e) => ({ id: e.id, name: e.name }));

  // Duplicate flow: prefill the form from an existing task (?from=<id>).
  let defaults: {
    initiatorId: string;
    doerId?: string;
    priority?: TaskPriority;
    title?: string;
    subject?: string;
    description?: string;
    notes?: string;
    projectNodeId?: string;
  } = { initiatorId: me.id };
  // #11 gate "Assign" deep-link: prefill the doer (the report being assigned).
  if (doer && options.some((o) => o.id === doer)) {
    defaults.doerId = doer;
  }
  if (from) {
    const src = await withRetry(() => getTaskById(from), { ...RETRY, label: "nt-from" });
    if (src) {
      defaults = {
        initiatorId: src.initiatorId,
        doerId: src.doerId,
        priority: src.priority,
        title: src.title,
        subject: src.subject ?? undefined,
        description: src.description ?? undefined,
        notes: src.notes ?? undefined,
        projectNodeId: src.projectNodeId ?? undefined,
      };
    }
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[720px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1 className="text-display-lg text-ink-strong">New Task</h1>
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
            subjects={subjects}
            projectNodes={projectNodes}
            defaults={defaults}
          />
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
