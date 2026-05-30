import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { listBoardTasks } from "@/lib/queries/tasks";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { requireUser } from "@/lib/auth/current";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import Link from "next/link";
import type { Route } from "next";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const me = await requireUser();
  const [tasks, statusDisplay, employees] = await Promise.all([
    listBoardTasks(),
    getStatusDisplayMap(),
    listEmployeeOptions(),
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
        {/* Dark, blurred canvas — the board floats over a red-glow gradient
            (echoes the login / projects hero). White cards read crisply on
            top; columns are frosted glass. */}
        <section
          className="relative overflow-hidden rounded-section p-6 max-md:p-4"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 90% 0%, rgba(225,6,0,0.30), transparent 55%), radial-gradient(ellipse 60% 60% at 0% 100%, rgba(168,4,0,0.18), transparent 60%), linear-gradient(135deg, #0E0B0A 0%, #1A0F0C 50%, #0B0708 100%)",
            boxShadow:
              "0 24px 60px -20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Decorative dot grid */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <header className="relative mb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1
                className="text-white"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: 40,
                  letterSpacing: "-0.02em",
                  textShadow: "0 2px 12px rgba(0,0,0,0.45)",
                }}
              >
                Board
              </h1>
              <p
                className="mt-1.5"
                style={{ color: "rgba(255,255,255,0.82)", fontSize: 15.5 }}
              >
                Drag a task between columns to change its status.
              </p>
            </div>
            <Link
              href={"/tasks" as Route}
              className="text-[14px] font-semibold transition-colors"
              style={{ color: "rgba(255,255,255,0.85)" }}
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
              dark
            />
          </div>
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
