import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Pencil } from "lucide-react";
import { getTaskById } from "@/lib/queries/tasks";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { requireUser } from "@/lib/auth/current";
import { PRIORITY_LABELS, type TaskStatus, type StatusColorToken } from "@/db/enums";
import { InlineStatusCell } from "@/components/tasks/inline-status-cell";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Focus mode — a clean, minimal, distraction-free view of a single task
 * (Manan #15/#19). No dashboard header, no audit feed, no action rail: just
 * the task content in large readable type, with an inline status changer so
 * you can work the task and update it without the surrounding clutter.
 */
export default async function TaskFocusPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireUser();
  const task = await getTaskById(id);
  if (!task) notFound();

  const statusDisplay = await getStatusDisplayMap();
  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const due = format(task.dueAt, "EEE, d MMM yyyy");

  return (
    <main
      className="min-h-dvh"
      style={{ background: "var(--color-surface-soft, #f8fafc)" }}
    >
      <div className="mx-auto max-w-[760px] px-6 py-10 max-md:py-6">
        {/* Minimal top bar — back + edit only */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href={`/tasks/${task.id}` as Route}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors"
          >
            <ArrowLeft size={16} strokeWidth={2.2} />
            Back to task
          </Link>
          <Link
            href={`/tasks/${task.id}` as Route}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors"
          >
            <Pencil size={14} strokeWidth={2.2} />
            Full view
          </Link>
        </div>

        <article
          className="rounded-section bg-white border border-hairline p-8 max-md:p-5"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)" }}
        >
          {/* Subject + priority chips */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {task.subject && (
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-[12.5px] font-bold"
                style={{
                  background: "var(--color-surface-soft)",
                  color: "var(--color-ink-soft)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                {task.subject}
              </span>
            )}
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-[12.5px] font-semibold"
              style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
            >
              {PRIORITY_LABELS[task.priority]}
            </span>
          </div>

          {/* The task itself — large, readable, no truncation (Manan: "full
              task is not seen"). The title IS the client name. */}
          <h1
            className="text-ink-strong"
            style={{ fontSize: 15, fontWeight: 700, color: "var(--color-ink-subtle)", letterSpacing: "0.01em" }}
          >
            {task.title}
          </h1>
          <p
            className="mt-2 text-ink-strong"
            style={{ fontSize: 26, lineHeight: 1.35, fontWeight: 600, whiteSpace: "pre-wrap" }}
          >
            {task.description || "—"}
          </p>

          {/* Status changer + due date */}
          <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-4 pt-6" style={{ borderTop: "1px solid var(--color-hairline)" }}>
            <Meta label="Status">
              <InlineStatusCell
                taskId={task.id}
                status={task.status}
                updatedAt={task.updatedAt}
                labels={statusLabels}
                tones={statusTones}
                isAdmin={me.isAdmin}
              />
            </Meta>
            <Meta label="Due">
              <span className="text-[16px] font-semibold text-ink-strong tabular-nums">{due}</span>
            </Meta>
            <Meta label="Doer">
              <span className="inline-flex items-center gap-2 text-[16px] font-semibold text-ink-strong">
                <EmployeeAvatar name={task.doerName ?? "—"} size="sm" />
                {task.doerName ?? "—"}
              </span>
            </Meta>
            <Meta label="Initiator">
              <span className="inline-flex items-center gap-2 text-[16px] font-semibold text-ink-strong">
                <EmployeeAvatar name={task.initiatorName ?? "—"} size="sm" />
                {task.initiatorName ?? "—"}
              </span>
            </Meta>
          </div>

          {task.notes && (
            <div className="mt-7 pt-6" style={{ borderTop: "1px solid var(--color-hairline)" }}>
              <div className="text-[12.5px] font-bold text-ink-subtle mb-2">Notes</div>
              <p className="text-[16px] text-ink-soft" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {task.notes}
              </p>
            </div>
          )}
        </article>
      </div>
    </main>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-bold text-ink-subtle uppercase" style={{ letterSpacing: "0.06em" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
