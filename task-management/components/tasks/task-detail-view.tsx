"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Building2,
  Clock,
  CheckCircle2,
  History,
  Flag,
  ChevronDown,
  Check as CheckIcon,
  Loader2,
  Copy,
  Maximize2,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { TaskDetail } from "./task-detail";
import { TaskEditForm } from "./task-edit-form";
import { AuditFeed } from "./audit-feed";
import { ActionRail } from "./action-rail";
import { CommentInput } from "./comment-input";
import type { TaskDetail as TaskDetailModel } from "@/lib/queries/tasks";
import type { AuditFeedRow } from "@/lib/queries/audit";
import {
  TASK_STATUSES,
  USER_TASK_STATUSES,
  type TaskStatus,
  type StatusColorToken,
} from "@/db/enums";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";

interface Props {
  task: TaskDetailModel;
  canEdit: boolean;
  canApproveTask: boolean;
  canReassignTask: boolean;
  canTransferTaskExternal: boolean;
  canCancelTask: boolean;
  canCommentOnTask: boolean;
  events: AuditFeedRow[];
  employees: { id: string; name: string }[];
  /** Client roster for the Edit Task "Client Name" picker. */
  clients: string[];
  /** Subject roster for the Edit Task "Subject" picker. */
  subjects: string[];
  /** Project tree nodes for the Edit Task "Project" link. */
  projectNodes?: { id: string; label: string }[];
  /** Current user — drives the comment composer avatar.  Optional so the
   *  page route can defer fetching it; falls back to "You". */
  me?: {
    id: string;
    name: string;
    avatarUrl: string | null;
    department: string | null;
    isAdmin: boolean;
  };
  /** Admin-overridable status labels (forwarded to AuditFeed). The hero
   *  status pill keeps its internal STATUS_TONE map for now; full rewiring
   *  is M5.2 follow-up work. */
  statusLabels?: Record<TaskStatus, string>;
  /** Admin-overridable status color tokens. Used by the interactive status
   *  picker so the dropdown swatches match the rest of the UI. */
  statusTones?: Record<TaskStatus, StatusColorToken>;
}

/** Status → tone mapping shared by the pill + meta UI. */
const STATUS_TONE: Record<
  TaskStatus,
  { label: string; rgb: string; ink: string; bg: string; live: boolean }
> = {
  dont_know: {
    label: "Don't Know",
    rgb: "156, 163, 175",
    ink: "var(--color-stone-deep)",
    bg: "var(--color-stone-bg)",
    live: false,
  },
  not_started: {
    label: "Not Started",
    rgb: "59, 130, 246",
    ink: "var(--color-blue-deep)",
    bg: "var(--color-blue-bg)",
    live: false,
  },
  initiated: {
    label: "Initiated",
    rgb: "59, 130, 246",
    ink: "var(--color-blue-deep)",
    bg: "var(--color-blue-bg)",
    live: true,
  },
  follow_up: {
    label: "Follow Up",
    rgb: "245, 158, 11",
    ink: "var(--color-amber-deep)",
    bg: "var(--color-amber-bg)",
    live: true,
  },
  need_help: {
    label: "Need Help",
    rgb: "225, 6, 0",
    ink: "var(--color-red-deep)",
    bg: "var(--color-red-bg)",
    live: false,
  },
  need_info: {
    label: "Need Info",
    rgb: "59, 130, 246",
    ink: "var(--color-blue-deep)",
    bg: "var(--color-blue-bg)",
    live: false,
  },
  follow_up_1: {
    label: "Follow Up 1",
    rgb: "245, 158, 11",
    ink: "var(--color-amber-deep)",
    bg: "var(--color-amber-bg)",
    live: true,
  },
  follow_up_2: {
    label: "Follow Up 2",
    rgb: "245, 158, 11",
    ink: "var(--color-amber-deep)",
    bg: "var(--color-amber-bg)",
    live: true,
  },
  follow_up_3: {
    label: "Follow Up 3",
    rgb: "225, 6, 0",
    ink: "var(--color-red-deep)",
    bg: "var(--color-red-bg)",
    live: true,
  },
  done: {
    label: "Done · awaiting approval",
    rgb: "34, 197, 94",
    ink: "var(--color-green-deep)",
    bg: "var(--color-green-bg)",
    live: true,
  },
  approved: {
    label: "Approved",
    rgb: "34, 197, 94",
    ink: "var(--color-green-deep)",
    bg: "var(--color-green-bg)",
    live: false,
  },
  not_approved: {
    label: "Not Approved",
    rgb: "225, 6, 0",
    ink: "var(--color-red-deep)",
    bg: "var(--color-red-bg)",
    live: false,
  },
  cancelled: {
    label: "Cancelled",
    rgb: "244, 63, 94",
    ink: "var(--color-rose-deep)",
    bg: "var(--color-rose-bg)",
    live: false,
  },
  transferred: {
    label: "Transferred",
    rgb: "168, 85, 247",
    ink: "var(--color-purple-deep)",
    bg: "var(--color-purple-bg)",
    live: false,
  },
};

const PRIORITY_LABEL_SHORT: Record<string, string> = {
  imp_urgent: "Urgent · Important",
  imp_not_urgent: "Important",
  not_imp_urgent: "Urgent",
  not_imp_not_urgent: "Routine",
};

/**
 * The showcase task-detail wrapper.
 *
 * Two-column editorial layout (~62% / ~38%) with a sticky right rail
 * containing three stacked sections — Status & meta, Action rail, Audit
 * feed timeline.  Below 1024px the rail collapses below the main column.
 *
 * - Hash-driven dialogs (#approve / #reassign / #transfer / #cancel)
 *   from the row-action menu (Wave 2) are preserved.
 * - Read ↔ edit toggle uses motion/AnimatePresence with mode="wait".
 * - A soft radial wash sits behind the right rail; readability stays first.
 */
export function TaskDetailView({
  task,
  canEdit,
  canApproveTask,
  canReassignTask,
  canTransferTaskExternal,
  canCancelTask,
  canCommentOnTask,
  events,
  employees,
  clients,
  subjects,
  projectNodes,
  me,
  statusLabels,
  statusTones,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const expectedUpdatedAt = task.updatedAt.toISOString();

  // Hash-driven dialog open — preserves the row-action menu deep-links.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    let opened = false;
    if (hash === "#approve" && canApproveTask) {
      setApproveOpen(true);
      opened = true;
    } else if (hash === "#reassign" && canReassignTask) {
      setReassignOpen(true);
      opened = true;
    } else if (hash === "#transfer" && canTransferTaskExternal) {
      setTransferOpen(true);
      opened = true;
    } else if (hash === "#cancel" && canCancelTask) {
      setCancelOpen(true);
      opened = true;
    }
    if (opened) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tone = STATUS_TONE[task.status];
  // Viewer's role on this task — drives the banner inside ActionRail.
  const myRole: "doer" | "initiator" | "both" | null = useMemo(() => {
    if (!me) return null;
    const isDoer = task.doerId === me.id;
    const isInitiator = task.initiatorId === me.id;
    if (isDoer && isInitiator) return "both";
    if (isDoer) return "doer";
    if (isInitiator) return "initiator";
    return null;
  }, [me, task.doerId, task.initiatorId]);

  const composerMe = useMemo(
    () => ({
      name: me?.name ?? "You",
      avatarUrl: me?.avatarUrl ?? null,
    }),
    [me?.name, me?.avatarUrl],
  );

  const anyAction =
    canEdit ||
    canApproveTask ||
    canReassignTask ||
    canTransferTaskExternal ||
    canCancelTask;

  // Approval timestamp surfaced only when the task is approved/declined.
  const approvedRelative =
    task.status === "approved" || task.status === "not_approved"
      ? formatDistanceToNow(task.updatedAt, { addSuffix: true })
      : null;

  return (
    <div className="relative">
      {/* Soft radial wash sitting behind the right rail.  Anchored to the
          top-right corner of the layout container so it reads as ambient
          rather than busy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 38% 60% at 92% 10%, rgba(225, 6, 0, 0.06), transparent 65%), radial-gradient(ellipse 30% 50% at 105% 60%, rgba(168, 85, 247, 0.06), transparent 65%)",
        }}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-10 max-lg:grid-cols-1 max-lg:gap-6">
        {/* LEFT COLUMN — editorial document */}
        <div className="min-w-0">
          {/* Edit + Duplicate buttons hovering top-right of the left column */}
          {!editing && (
            <div className="flex justify-end gap-2 mb-4">
              <Link
                href={`/tasks/${task.id}/focus` as Route}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold text-ink-soft border border-hairline bg-white/70 hover:bg-white hover:border-hairline-strong transition-all"
              >
                <Maximize2 size={15} strokeWidth={2.2} />
                Focus
              </Link>
              <Link
                href={`/tasks/new?from=${task.id}` as Route}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold text-ink-soft border border-hairline bg-white/70 hover:bg-white hover:border-hairline-strong transition-all"
              >
                <Copy size={15} strokeWidth={2.2} />
                Duplicate
              </Link>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold text-ink-soft border border-hairline bg-white/70 hover:bg-white hover:border-hairline-strong transition-all"
                >
                  Edit Task →
                </button>
              )}
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {editing ? (
              <motion.div
                key="edit"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{
                  duration: 0.28,
                  ease: [0.2, 0.7, 0.3, 1],
                }}
                className="rounded-section border border-hairline bg-surface-card p-6"
                style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
              >
                <div className="flex items-center justify-between mb-5">
                  <h1
                    className="text-ink-strong"
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontStyle: "italic",
                      fontWeight: 500,
                      fontSize: 32,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Edit Task
                  </h1>
                  <span className="text-[12.5px] text-ink-subtle uppercase tracking-[0.1em] font-bold">
                    Editing
                  </span>
                </div>
                <TaskEditForm
                  taskId={task.id}
                  clients={clients}
                  subjects={subjects}
                  projectNodes={projectNodes}
                  initial={{
                    title: task.title,
                    description: task.description,
                    subject: task.subject,
                    notes: task.notes,
                    priority: task.priority,
                    dueAt: task.dueAt,
                    tags: task.tags,
                    approvalStatus: task.approvalStatus,
                    revisedTargetDate: task.revisedTargetDate,
                    startsAt: task.startsAt,
                    endsAt: task.endsAt,
                    allDay: task.allDay,
                    // Recurrence text → narrowed to TaskRecurrence union; the
                    // app-level validator restricts writes to those values
                    // so anything outside is safely treated as null.
                    recurrence:
                      task.recurrence === "daily" ||
                      task.recurrence === "weekly" ||
                      task.recurrence === "monthly" ||
                      task.recurrence === "yearly"
                        ? task.recurrence
                        : null,
                    recurrenceRule: task.recurrenceRule,
                    projectNodeId: task.projectNodeId,
                  }}
                  expectedUpdatedAt={expectedUpdatedAt}
                  isAdmin={me?.isAdmin ?? false}
                  onCancel={() => setEditing(false)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="read"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{
                  duration: 0.28,
                  ease: [0.2, 0.7, 0.3, 1],
                }}
              >
                <TaskDetail task={task} />

                {/* Comment composer — part of the editorial document, NOT
                    a glass card.  Only shown when the user is a participant. */}
                {canCommentOnTask && (
                  <CommentInput taskId={task.id} me={composerMe} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT RAIL — sticky, three stacked sections. Tier-3 mobile fix:
            previously `order-first` shoved the entire audit feed above the
            task body on small screens. Dropped — Status + ActionRail are
            valuable above, but the audit timeline belongs below the doc. */}
        <aside>
          <div
            className="lg:sticky lg:top-24 flex flex-col gap-4"
            style={{ scrollMarginTop: "6rem" }}
          >
            {/* (1) Status + meta */}
            <section
              className="rounded-section border border-hairline bg-surface-card p-5"
              style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
            >
              <h2 className="text-[12px] uppercase tracking-[0.12em] text-ink-subtle font-bold mb-3">
                Status
              </h2>
              <InteractiveStatusPill
                taskId={task.id}
                status={task.status}
                updatedAt={task.updatedAt}
                labels={statusLabels}
                tones={statusTones}
                canChange={canCommentOnTask /* same gate: any task participant or admin */}
                isAdmin={me?.isAdmin ?? false}
              />
              <div className="mt-5 pt-4 border-t border-hairline grid grid-cols-1 gap-3">
                <MetaRow
                  icon={<Clock size={13} strokeWidth={2.4} />}
                  label="Created"
                  value={`${formatDistanceToNow(task.createdAt, { addSuffix: true })}`}
                  title={format(task.createdAt, "MMM d, yyyy 'at' h:mm a")}
                />
                <MetaRow
                  icon={<History size={13} strokeWidth={2.4} />}
                  label="Updated"
                  value={formatDistanceToNow(task.updatedAt, { addSuffix: true })}
                  title={format(task.updatedAt, "MMM d, yyyy 'at' h:mm a")}
                />
                <MetaRow
                  icon={<CheckCircle2 size={13} strokeWidth={2.4} />}
                  label="Approved"
                  value={approvedRelative ?? "—"}
                  emphasized={!!approvedRelative}
                />
                {me?.department && (
                  <MetaRow
                    icon={<Building2 size={13} strokeWidth={2.4} />}
                    label="Department"
                    value={me.department}
                  />
                )}
                <MetaRow
                  icon={<Flag size={13} strokeWidth={2.4} />}
                  label="Priority"
                  value={PRIORITY_LABEL_SHORT[task.priority] ?? task.priority}
                />
              </div>
            </section>

            {/* (2) Action rail */}
            {anyAction && (
              <section
                className="rounded-section border border-hairline bg-surface-card"
                style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
              >
                <ActionRail
                  taskId={task.id}
                  expectedUpdatedAt={expectedUpdatedAt}
                  currentDoerId={task.doerId}
                  employees={employees}
                  canEdit={canEdit && !editing}
                  canApproveTask={canApproveTask}
                  canReassignTask={canReassignTask}
                  canTransferTaskExternal={canTransferTaskExternal}
                  canCancelTask={canCancelTask}
                  onStartEdit={() => setEditing(true)}
                  approveOpen={approveOpen}
                  setApproveOpen={setApproveOpen}
                  reassignOpen={reassignOpen}
                  setReassignOpen={setReassignOpen}
                  transferOpen={transferOpen}
                  setTransferOpen={setTransferOpen}
                  cancelOpen={cancelOpen}
                  setCancelOpen={setCancelOpen}
                  myRole={myRole}
                  adminOverride={!myRole && !!me?.isAdmin}
                />
              </section>
            )}

            {/* (3) Audit feed timeline */}
            <AuditFeed
              events={events}
              statusLabels={statusLabels}
              me={me ? { id: me.id, isAdmin: me.isAdmin } : undefined}
            />
          </div>
        </aside>
      </div>
    </div>
  );

}

/**
 * Detail-page status pill with click-to-change behavior. Same visual
 * footprint as the previous read-only `StatusPill` (gradient background,
 * pulse animation on live statuses) but opens a dropdown of valid next
 * statuses on click. Calls `setTaskStatus`, which validates the transition
 * server-side against the matrix and the optimistic-lock.
 *
 * Fixes the long-standing dead-end where a doer opened a "Not Started" task
 * and had no UI to mark it Initiated/Done without going back to the table.
 */
function InteractiveStatusPill({
  taskId,
  status,
  updatedAt,
  labels,
  tones,
  canChange,
  isAdmin,
}: {
  taskId: string;
  status: TaskStatus;
  updatedAt: Date;
  labels?: Record<TaskStatus, string>;
  tones?: Record<TaskStatus, StatusColorToken>;
  canChange: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState<TaskStatus>(status);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => setShown(status), [status]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const t = STATUS_TONE[shown];
  const options: readonly TaskStatus[] = isAdmin
    ? TASK_STATUSES
    : USER_TASK_STATUSES;

  function pick(next: TaskStatus) {
    setOpen(false);
    if (next === shown) return;
    const prev = shown;
    setShown(next); // optimistic
    startTransition(async () => {
      const res = await setTaskStatus(taskId, next, updatedAt.toISOString());
      if (!res.ok) {
        setShown(prev); // rollback
        const msg =
          res.error === "forbidden"
            ? "You can't make that transition from your role."
            : res.error === "stale"
              ? "Task changed by someone else — refreshing."
              : res.message ?? "Could not update status.";
        fireToast({ message: msg });
        if (res.error === "stale") router.refresh();
      } else {
        fireToast({
          message: `Status set to ${labels?.[next] ?? STATUS_TONE[next].label}.`,
        });
        router.refresh();
      }
    });
  }

  const pillStyle = {
    background: t.bg,
    color: t.ink,
    border: `1px solid rgba(${t.rgb}, 0.25)`,
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.01em",
    cursor: canChange ? (pending ? "wait" : "pointer") : "default",
    opacity: pending ? 0.7 : 1,
    ["--pill-tone-rgb" as unknown as string]: t.rgb,
    animation: t.live
      ? "statusShimmer 600ms cubic-bezier(0.2, 0.7, 0.3, 1) 1, statusPulse 3s ease-in-out 600ms infinite"
      : "statusShimmer 600ms cubic-bezier(0.2, 0.7, 0.3, 1) 1",
  } as React.CSSProperties;

  const pillContents = (
    <>
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{
          background: `rgba(${t.rgb}, 1)`,
          boxShadow: t.live ? `0 0 0 3px rgba(${t.rgb}, 0.18)` : undefined,
        }}
      />
      {labels?.[shown] ?? t.label}
      {canChange &&
        (pending ? (
          <Loader2
            size={13}
            strokeWidth={2.4}
            style={{ animation: "spinFast 0.8s linear infinite" }}
          />
        ) : (
          <ChevronDown size={13} strokeWidth={2.6} />
        ))}
    </>
  );

  if (!canChange) {
    return (
      <div
        key={shown}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full"
        style={pillStyle}
      >
        {pillContents}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => !pending && setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${labels?.[shown] ?? t.label}. Click to change.`}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full"
        style={pillStyle}
      >
        {pillContents}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Set task status"
          className="absolute left-0 mt-2 z-50 min-w-[220px] max-h-[320px] overflow-y-auto rounded-chip border bg-surface-card"
          style={{
            borderColor: "var(--color-hairline-strong)",
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
          }}
        >
          {options.map((s) => {
            const sel = s === shown;
            const tone = tones?.[s] ?? "amber";
            const label = labels?.[s] ?? STATUS_TONE[s]?.label ?? s;
            return (
              <li
                key={s}
                role="option"
                aria-selected={sel}
                onClick={(e) => {
                  e.stopPropagation();
                  pick(s);
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 text-[14px] cursor-pointer transition-colors"
                style={{
                  background: sel ? "var(--color-surface-soft)" : "transparent",
                  fontWeight: sel ? 700 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!sel)
                    e.currentTarget.style.background =
                      "var(--color-surface-soft)";
                }}
                onMouseLeave={(e) => {
                  if (!sel) e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  aria-hidden
                  className="inline-block size-2 rounded-full"
                  style={{
                    background: `var(--color-${tone})`,
                    boxShadow: `0 0 6px var(--color-${tone})`,
                  }}
                />
                <span
                  className="flex-1"
                  style={{ color: "var(--color-ink-strong)" }}
                >
                  {label}
                </span>
                {sel && (
                  <CheckIcon
                    size={14}
                    strokeWidth={2.6}
                    style={{ color: "var(--color-ink-strong)" }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
  title,
  emphasized,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  title?: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3" title={title}>
      <span className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.10em] text-ink-subtle font-bold min-w-[100px]">
        <span className="text-ink-subtle">{icon}</span>
        {label}
      </span>
      <span
        className={`text-[14px] tabular-nums ${emphasized ? "text-ink-strong font-semibold" : "text-ink-soft"}`}
      >
        {value}
      </span>
    </div>
  );
}
