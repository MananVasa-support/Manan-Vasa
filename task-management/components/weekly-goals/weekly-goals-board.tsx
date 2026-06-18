"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  BarChart3,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@/db/enums";
import { MultiSelect } from "@/components/ui/multi-select";
import { WeeklyGoalsImport } from "@/components/weekly-goals/weekly-goals-import";
import { GoalCard } from "@/components/weekly-goals/goal-card";
import { GoalQuickAdd } from "@/components/weekly-goals/goal-quick-add";
import type { BoardGoal, StatusDisplayMap } from "@/components/weekly-goals/types";
import { weeklyScore } from "@/lib/weekly-goals/effective";
import { deleteWeeklyGoal } from "@/app/(app)/weekly-goals/actions";
import { fireToast } from "@/lib/toast";

interface Props {
  me: { id: string; isAdmin: boolean; canReview: boolean };
  weekStart: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  scopeEmp: string;
  employees: { id: string; name: string }[];
  rows: BoardGoal[];
  statusDisplay: StatusDisplayMap;
  clientOptions: string[];
  subjectOptions: string[];
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  focusId: string | null;
}

export function WeeklyGoalsBoard(props: Props) {
  const router = useRouter();
  const showingAll = props.scopeEmp === "all";

  // Client-side filters (priority) + a reviewer-only "show archived" toggle.
  const [priorityFilter, setPriorityFilter] = React.useState<string[]>([]);
  const [showArchived, setShowArchived] = React.useState(false);

  // Shared two-step delete dialog state (one dialog for every card).
  const [deleteTarget, setDeleteTarget] = React.useState<BoardGoal | null>(null);

  function go(params: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    router.push(`/weekly-goals?${sp.toString()}` as Route);
  }

  const visible = React.useMemo(() => {
    return props.rows.filter((r) => {
      if (!showArchived && r.archived) return false;
      if (priorityFilter.length > 0 && !priorityFilter.includes(r.priority)) return false;
      return true;
    });
  }, [props.rows, showArchived, priorityFilter]);

  // Group by employee for the admin "all" overview.
  const grouped = React.useMemo(() => {
    const map = new Map<string, { name: string; rows: BoardGoal[] }>();
    for (const r of visible) {
      if (!map.has(r.employeeId)) map.set(r.employeeId, { name: r.employeeName, rows: [] });
      map.get(r.employeeId)!.rows.push(r);
    }
    return [...map.entries()];
  }, [visible]);

  const totalCount = visible.length;
  const overallScore = weeklyScore(visible.filter((r) => !r.archived));

  // Props shared by every card (the card-specific srNo / goal / canEdit /
  // autoFocus are passed per-card at the render site).
  const sharedCardProps = {
    canReview: props.me.canReview,
    isAdmin: props.me.isAdmin,
    statusDisplay: props.statusDisplay,
    clientOptions: props.clientOptions,
    subjectOptions: props.subjectOptions,
    onRequestDelete: setDeleteTarget,
  };

  return (
    <main className="mx-auto max-w-[1280px] px-12 max-md:px-4 pt-8 pb-24">
      {/* Header ------------------------------------------------------- */}
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(36px, 3.8vw, 52px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            Weekly Goals
          </h1>
          <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 17 }}>
            Top priorities each team member commits to finishing this week.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <WeeklyGoalsImport
            employeeId={props.scopeEmp}
            weekStart={props.weekStart}
            weekLabel={props.weekLabel}
            isAdmin={props.me.isAdmin}
          />
          <Link
            href={"/weekly-goals/dashboard" as Route}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 6px 18px -6px rgba(225, 6, 0, 0.55)",
            }}
          >
            <BarChart3 size={16} strokeWidth={2.4} />
            Performance Dashboard
          </Link>
        </div>
      </header>

      {/* Controls: week nav + employee scope + filters --------------- */}
      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center rounded-full border border-hairline bg-surface-card overflow-hidden">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => go({ week: props.prevWeek, emp: props.scopeEmp })}
            className="px-3 py-2 hover:bg-black/[0.03] transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-4 py-2 inline-flex items-center gap-2 font-bold text-ink-strong text-[15px] tabular-nums border-x border-hairline">
            <CalendarDays size={16} className="text-ink-muted" />
            {props.weekLabel}
          </span>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => go({ week: props.nextWeek, emp: props.scopeEmp })}
            className="px-3 py-2 hover:bg-black/[0.03] transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {!props.isCurrentWeek && (
          <button
            type="button"
            onClick={() => go({ week: props.thisWeek, emp: props.scopeEmp })}
            className="px-4 py-2 rounded-full border border-hairline bg-surface-card font-bold text-[14px] text-ink-soft hover:text-ink-strong transition-colors"
          >
            This week
          </button>
        )}

        <div className="min-w-[200px]">
          <MultiSelect
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
            selected={priorityFilter}
            onChange={setPriorityFilter}
            placeholder="All priorities"
          />
        </div>

        {props.me.canReview && (
          <label className="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-soft">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        )}

        {props.me.isAdmin && (
          <select
            value={props.scopeEmp}
            onChange={(e) => go({ week: props.weekStart, emp: e.target.value })}
            className="ml-auto px-4 py-2 rounded-full border border-hairline bg-surface-card font-bold text-[14px] text-ink-strong"
          >
            <option value="all">All team members</option>
            {props.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary header: N goals + weekly score ----------------------- */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <span
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
            color: "var(--color-altus-red-deep)",
          }}
        >
          {totalCount} {totalCount === 1 ? "goal" : "goals"}
        </span>
        {totalCount > 0 && (
          <ScorePill label={showingAll ? "Team weekly score" : "Weekly score"} score={overallScore} />
        )}
      </div>

      {/* Body --------------------------------------------------------- */}
      {showingAll ? (
        grouped.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-10">
            {grouped.map(([empId, g]) => (
              <section key={empId}>
                <div className="mb-3 flex items-center gap-3 flex-wrap">
                  <h2 className="font-black text-ink-strong text-[19px]">{g.name}</h2>
                  <span className="text-ink-muted font-bold text-[14px]">
                    {g.rows.length} {g.rows.length === 1 ? "goal" : "goals"}
                  </span>
                  <ScorePill
                    label="Score"
                    score={weeklyScore(g.rows.filter((r) => !r.archived))}
                    compact
                  />
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {g.rows.map((goal, i) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      srNo={i + 1}
                      canEdit={props.me.isAdmin || goal.employeeId === props.me.id}
                      autoFocus={props.focusId === goal.id}
                      {...sharedCardProps}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((goal, i) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              srNo={i + 1}
              canEdit={props.me.isAdmin || goal.employeeId === props.me.id}
              autoFocus={props.focusId === goal.id}
              {...sharedCardProps}
            />
          ))}
          <div className="xl:col-span-2">
            <GoalQuickAdd
              employeeId={props.scopeEmp}
              weekStart={props.weekStart}
              clientOptions={props.clientOptions}
              subjectOptions={props.subjectOptions}
            />
          </div>
        </div>
      )}

      {/* One shared delete dialog for the whole board. */}
      <DeleteGoalDialog
        goal={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          router.refresh();
        }}
      />
    </main>
  );
}

function ScorePill({
  label,
  score,
  compact = false,
}: {
  label: string;
  score: number;
  compact?: boolean;
}) {
  const tone = score >= 100 ? "green" : score >= 50 ? "amber" : score > 0 ? "orange" : "slate";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full ${compact ? "px-3 py-1" : "px-4 py-2"} font-bold`}
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
        color: `var(--color-${tone}-deep)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
        fontSize: compact ? 13 : 14,
      }}
    >
      <span className="font-semibold opacity-80">{label}</span>
      <span className="tabular-nums font-black">{score}%</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div
      className="bg-surface-card rounded-section border border-hairline p-10 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <p className="font-bold" style={{ fontSize: 20, color: "var(--color-ink-strong)" }}>
        No weekly goals set yet.
      </p>
      <p className="mt-2 font-semibold" style={{ fontSize: 15, color: "var(--color-ink-muted)" }}>
        Pick a team member, then add their top priorities for the week.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Two-step delete confirmation (shared across cards)                   */
/* ------------------------------------------------------------------ */

function DeleteGoalDialog({
  goal,
  onClose,
  onDeleted,
}: {
  goal: BoardGoal | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [typed, setTyped] = React.useState("");
  const open = goal != null;
  const name = goal
    ? goal.client || goal.subject || goal.targetDone || "this goal"
    : "this goal";

  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setTyped("");
    }
  }, [open]);

  const confirmable = typed.trim().toLowerCase() === name.trim().toLowerCase();

  function performDelete() {
    if (!goal) return;
    start(async () => {
      const res = await deleteWeeklyGoal({ id: goal.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      onDeleted();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6 max-h-[calc(100dvh-32px)] overflow-y-auto"
          style={{
            border: "1px solid var(--color-hairline-strong)",
            boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)",
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span
              aria-hidden
              className="inline-flex shrink-0 items-center justify-center size-10 rounded-xl"
              style={{
                background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                color: "var(--color-altus-red)",
              }}
            >
              <Trash2 size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 22,
                  letterSpacing: "-0.01em",
                }}
              >
                Delete weekly goal?
              </Dialog.Title>
              <Dialog.Description className="text-[14px] text-ink-subtle mt-1" style={{ lineHeight: 1.5 }}>
                {step === 1
                  ? "Step 1 of 2 — review what will be removed."
                  : "Step 2 of 2 — confirm to finish."}
              </Dialog.Description>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div
                className="rounded-chip p-4 mb-4"
                style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
              >
                <p className="text-[15px] text-ink-strong font-semibold break-words">“{name}”</p>
                <ul className="mt-2 space-y-1 text-[13.5px] text-ink-soft" style={{ lineHeight: 1.5 }}>
                  <li>• Removes this goal and its % progress history.</li>
                  <li>• Any linked incentive entry is handled separately.</li>
                  <li>
                    • This <strong>cannot be undone</strong>.
                  </li>
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-px"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-soft mb-2" style={{ lineHeight: 1.55 }}>
                Type <span className="font-bold text-ink-strong">{name}</span> to confirm deletion.
              </p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && confirmable && !pending) performDelete();
                }}
                placeholder={name}
                className="w-full rounded-md border px-3.5 py-2.5 text-[15px] outline-none focus:border-altus-red mb-4"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <div className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={pending}
                  className="px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={performDelete}
                  disabled={!confirmable || pending}
                  className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-px"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  {pending && <Loader2 size={14} className="animate-spin" />}
                  {pending ? "Deleting…" : "Permanently delete"}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
