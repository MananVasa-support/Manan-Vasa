import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { listBoardTasks } from "@/lib/queries/tasks";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { requireUser } from "@/lib/auth/current";
import {
  resolveAdminColumnOrder,
  USER_COLUMN_ORDER,
} from "@/lib/kanban-columns";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import Link from "next/link";
import type { Route } from "next";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const me = await requireUser();
  const [tasks, statusDisplay, employees, org] = await Promise.all([
    listBoardTasks(),
    getStatusDisplayMap(),
    listEmployeeOptions(),
    getOrgSettings(),
  ]);
  const labels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const tones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  // Admins see the admin-configurable order; everyone else the curated list.
  const columnOrder = me.isAdmin
    ? resolveAdminColumnOrder(org.boardColumnOrder)
    : USER_COLUMN_ORDER;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-6 max-md:px-4 pt-6 pb-10">
        {/* Light canvas (sir's changes #1) — full-bleed (no centred max-width
            gutters), clean white surface; status colour lives in the columns. */}
        <section
          className="relative overflow-hidden rounded-section border border-hairline p-5 max-md:p-4"
          style={{ background: "var(--color-surface-card)" }}
        >
          <header className="relative mb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: 40,
                  letterSpacing: "-0.02em",
                }}
              >
                Kanban
              </h1>
              <p className="mt-1.5 text-ink-soft" style={{ fontSize: 15.5 }}>
                Drag a task between columns to change its status.
                {me.isAdmin ? " Drag a column header to reorder the board." : ""}
              </p>
            </div>
            <Link
              href={"/tasks" as Route}
              className="text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors"
            >
              List View →
            </Link>
          </header>
          <div className="relative">
            <KanbanBoard
              tasks={tasks}
              labels={labels}
              tones={tones}
              employees={employees.map((e) => ({ id: e.id, name: e.name }))}
              isAdmin={me.isAdmin}
              columnOrder={columnOrder}
            />
          </div>
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
