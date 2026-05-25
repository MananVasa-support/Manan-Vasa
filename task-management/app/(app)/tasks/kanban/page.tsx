import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { listBoardTasks } from "@/lib/queries/tasks";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { requireUser } from "@/lib/auth/current";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import Link from "next/link";
import type { Route } from "next";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const me = await requireUser();
  const [tasks, statusDisplay] = await Promise.all([
    listBoardTasks(),
    getStatusDisplayMap(),
  ]);
  const labels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const tones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-display-lg text-ink-strong">Board</h1>
            <p className="text-body-lg text-ink-subtle mt-1">
              Drag a task between columns to change its status.
            </p>
          </div>
          <Link
            href={"/tasks" as Route}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors"
          >
            List view →
          </Link>
        </header>
        <KanbanBoard tasks={tasks} labels={labels} tones={tones} isAdmin={me.isAdmin} />
      </main>
      <DashboardFooter />
    </>
  );
}
