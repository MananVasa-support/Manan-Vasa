"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Check,
  CopyPlus,
  Trash2,
  ChevronRight,
  CalendarClock,
  Gauge,
  IndianRupee,
  Target,
  Loader2,
  Archive,
  ListPlus,
  SquareArrowOutUpRight,
} from "lucide-react";

/* Editorial tokens shared with the board (cream/warm-ink palette). */
const EDITORIAL = {
  surface: "#FFFFFF",
  inkStrong: "#171411",
  inkSoft: "#6B6560",
  inkSubtle: "#9A938B",
  hairline: "rgba(23,20,17,0.08)",
} as const;
const SERIF = "var(--font-editorial), Georgia, serif";
import { fireToast } from "@/lib/toast";
import {
  editWeeklyGoal,
  setWeeklyGoalPct,
  duplicateWeeklyGoal,
  createTaskFromGoal,
} from "@/app/(app)/weekly-goals/actions";
import type { BoardGoal, StatusDisplayMap } from "@/components/weekly-goals/types";
import { effectivePct } from "@/lib/weekly-goals/effective";
import { formatInr } from "@/lib/format";
import { formatWeekShort } from "@/lib/weekly-goals/week";
import {
  ComboInput,
  AutoTextarea,
  LinkField,
  YesNo,
  pctTone,
} from "@/components/weekly-goals/field-controls";
import { GoalReviewPanel } from "@/components/weekly-goals/goal-review-panel";

const PCT_PRESETS = [0, 25, 50, 75, 100];

interface Props {
  goal: BoardGoal;
  srNo: number;
  canEdit: boolean;
  canReview: boolean;
  isAdmin: boolean;
  statusDisplay: StatusDisplayMap;
  clientOptions: string[];
  subjectOptions: string[];
  /** Opens the board's shared two-step delete-confirm dialog. */
  onRequestDelete: (goal: BoardGoal) => void;
  /** When true the card auto-expands its editor (deep link `?focus=<id>`). */
  autoFocus?: boolean;
}

export function GoalCard({
  goal,
  srNo,
  canEdit,
  canReview,
  isAdmin,
  statusDisplay,
  clientOptions,
  subjectOptions,
  onRequestDelete,
  autoFocus = false,
}: Props) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [editing, setEditing] = React.useState(autoFocus && canEdit);
  const [reviewOpen, setReviewOpen] = React.useState(autoFocus && canReview);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const eff = effectivePct(goal);
  const status = statusDisplay[goal.status];

  React.useEffect(() => {
    if (autoFocus) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoFocus]);

  function save(patch: Parameters<typeof editWeeklyGoal>[0]) {
    start(async () => {
      const res = await editWeeklyGoal(patch);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
      router.refresh();
    });
  }
  function savePct(pctDone: number) {
    start(async () => {
      const res = await setWeeklyGoalPct({ id: goal.id, pctDone });
      if (!res.ok) fireToast({ message: res.error, type: "error" });
      router.refresh();
    });
  }
  function duplicate() {
    start(async () => {
      const res = await duplicateWeeklyGoal({ id: goal.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Goal duplicated.", type: "success" });
      router.refresh();
    });
  }
  // Decoupled from `pending` (the router.refresh transition) so the button
  // never sticks disabled through a slow refresh — see the QuickAdd lesson.
  const [addingTask, setAddingTask] = React.useState(false);
  function addToTasks() {
    if (addingTask || goal.taskId) return;
    setAddingTask(true);
    (async () => {
      const res = await createTaskFromGoal({ goalId: goal.id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        setAddingTask(false);
        return;
      }
      fireToast({
        message: res.alreadyLinked
          ? `Already linked to task${res.taskNo ? ` #${res.taskNo}` : ""}.`
          : `Added to Tasks${res.taskNo ? ` · #${res.taskNo}` : ""} — Important.`,
        type: "success",
      });
      router.refresh();
      setAddingTask(false);
    })();
  }

  const title =
    goal.targetDone?.trim() ||
    [goal.client, goal.subject].filter(Boolean).join(" · ") ||
    "Untitled goal";

  return (
    <div
      ref={cardRef}
      className="relative overflow-hidden transition-shadow hover:shadow-[0_10px_30px_-16px_rgba(23,20,17,0.28)]"
      style={{
        background: EDITORIAL.surface,
        border: `1px solid ${EDITORIAL.hairline}`,
        borderRadius: 16,
        boxShadow: "0 1px 2px rgba(23,20,17,0.04)",
        opacity: goal.archived ? 0.72 : 1,
      }}
    >
      {/* Altus-red accent rail */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: "var(--color-altus-red)" }}
      />

      <div className="p-5 pl-6">
        {/* Header row: number badge + eyebrow/title + status ----------- */}
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[13px] font-black tabular-nums text-white"
            style={{ background: EDITORIAL.inkStrong }}
          >
            {srNo}
          </span>

          <div className="min-w-0 flex-1">
            {/* Client · Subject eyebrow */}
            {!editing && (goal.client || goal.subject) && (
              <p
                className="text-[11px] font-black uppercase tracking-[0.09em]"
                style={{ color: EDITORIAL.inkSubtle }}
              >
                {[goal.client, goal.subject].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Goal title (read mode) — editorial serif */}
            {!editing && (
              <h3
                className="mt-1 leading-snug"
                style={{
                  fontFamily: SERIF,
                  fontWeight: 600,
                  fontSize: 18,
                  color: EDITORIAL.inkStrong,
                  letterSpacing: "-0.005em",
                }}
              >
                {title}
              </h3>
            )}
          </div>

          {/* Status pill */}
          {!editing && status && (
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold"
              style={{
                background: `color-mix(in srgb, var(--color-${status.color}) 14%, transparent)`,
                color: `var(--color-${status.color}-deep)`,
                border: `1px solid color-mix(in srgb, var(--color-${status.color}) 36%, transparent)`,
              }}
            >
              {status.label}
            </span>
          )}
        </div>

        {/* Chips row ---------------------------------------------------- */}
        {!editing && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-10">
            <Chip icon={<Gauge size={12} />} label={`Weight ${goal.weight}`} tone="red" />
            {goal.targetDate && (
              <Chip icon={<CalendarClock size={12} />} label={formatWeekShort(goal.targetDate)} />
            )}
            {goal.incentive && (
              <Chip
                icon={<IndianRupee size={12} />}
                label={goal.incentiveAmount > 0 ? formatInr(goal.incentiveAmount) : "Incentive"}
                tone="green"
              />
            )}
            {goal.carriedFromId && <Chip label="↪ carried" />}
            {goal.archived && <Chip icon={<Archive size={12} />} label="Archived" tone="slate" />}
          </div>
        )}

        {/* Notes (planning) -------------------------------------------- */}
        {!editing && goal.notes && (
          <p
            className="mt-3 pl-10 text-[14px] leading-relaxed whitespace-pre-wrap"
            style={{ color: EDITORIAL.inkSoft }}
          >
            {goal.notes}
          </p>
        )}

        {/* Progress bar ------------------------------------------------ */}
        {!editing && (
          <div className="mt-4 pl-10">
            <p
              className="mb-1.5 text-[10.5px] font-black uppercase tracking-[0.1em]"
              style={{ color: EDITORIAL.inkSubtle }}
            >
              Progress
            </p>
            <div className="flex items-center gap-3">
              <div
                className="h-2.5 flex-1 overflow-hidden rounded-full"
                style={{ background: "rgba(23,20,17,0.07)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${eff}%`,
                    background: `linear-gradient(90deg, var(--color-${pctTone(eff)}), var(--color-${pctTone(eff)}-deep))`,
                  }}
                />
              </div>
              <span
                className="w-12 shrink-0 text-right text-[15px] font-black tabular-nums"
                style={{ color: EDITORIAL.inkStrong }}
              >
                {eff}%
              </span>
            </div>
            {goal.acceptPct != null && goal.acceptPct !== goal.pctDone && (
              <p className="mt-1 text-[12px] font-semibold" style={{ color: EDITORIAL.inkSubtle }}>
                Doer reported {goal.pctDone}% · accepted {goal.acceptPct}%
              </p>
            )}
            {/* Quick % presets (owner / admin) — selected = solid dark pill. */}
            {canEdit && (
              <div className="mt-2.5 flex gap-1.5">
                {PCT_PRESETS.map((p) => {
                  const selected = eff === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => savePct(p)}
                      disabled={pending}
                      aria-pressed={selected}
                      className="rounded-full px-3 py-1 text-[12px] font-bold transition-colors disabled:opacity-60"
                      style={
                        selected
                          ? { background: EDITORIAL.inkStrong, color: "#fff", border: `1px solid ${EDITORIAL.inkStrong}` }
                          : { background: "transparent", color: EDITORIAL.inkSoft, border: `1px solid ${EDITORIAL.hairline}` }
                      }
                    >
                      {p}%
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Inline editor ----------------------------------------------- */}
        {editing && canEdit && (
          <div className="mt-1 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Client</span>
                <ComboInput
                  value={goal.client ?? ""}
                  options={clientOptions}
                  placeholder="Client…"
                  onCommit={(v) => save({ id: goal.id, client: v || null })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Subject</span>
                <ComboInput
                  value={goal.subject ?? ""}
                  options={subjectOptions}
                  placeholder="Subject…"
                  onCommit={(v) => save({ id: goal.id, subject: v || null })}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Goal</span>
              <AutoTextarea
                value={goal.targetDone ?? ""}
                placeholder="What does done look like?"
                onCommit={(v) => save({ id: goal.id, targetDone: v || null })}
              />
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Weight</span>
                <WeightInput value={goal.weight} onCommit={(w) => save({ id: goal.id, weight: w })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Target date</span>
                <input
                  type="date"
                  defaultValue={goal.targetDate ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value || null;
                    if (v !== goal.targetDate) save({ id: goal.id, targetDate: v });
                  }}
                  className="rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[14px] font-semibold text-ink-strong outline-none focus:border-altus-red/50"
                />
              </label>
              <div className="flex items-center gap-3 self-end pb-0.5">
                <span className="text-[12px] font-bold text-ink-soft">Incentive</span>
                <YesNo
                  value={goal.incentive}
                  onChange={(v) => save({ id: goal.id, incentive: v })}
                />
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Planning notes</span>
              <AutoTextarea
                value={goal.notes ?? ""}
                placeholder="Plan / approach…"
                onCommit={(v) => save({ id: goal.id, notes: v || null })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Explanation</span>
              <AutoTextarea
                value={goal.explanation ?? ""}
                placeholder="Progress notes…"
                onCommit={(v) => save({ id: goal.id, explanation: v || null })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Evidence link</span>
              <LinkField
                value={goal.linkUrl ?? ""}
                onCommit={(v) => save({ id: goal.id, linkUrl: v || null })}
              />
            </label>
          </div>
        )}

        {/* Footer actions --------------------------------------------- */}
        <div
          className="mt-4 flex flex-wrap items-center gap-1.5 pl-10 pt-3.5"
          style={{ borderTop: `1px solid ${EDITORIAL.hairline}` }}
        >
          {pending && <Loader2 size={14} className="animate-spin" style={{ color: EDITORIAL.inkSubtle }} />}

          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-black/[0.04]"
              style={{ color: EDITORIAL.inkSoft }}
            >
              {editing ? <Check size={14} /> : <Pencil size={14} />}
              {editing ? "Done" : "Edit"}
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={duplicate}
              disabled={pending}
              title="Duplicate into this week"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-black/[0.04] disabled:opacity-60"
              style={{ color: EDITORIAL.inkSoft }}
            >
              <CopyPlus size={14} />
              Duplicate
            </button>
          )}

          {/* Goal⇄Task link: spin off a real task, or jump to the linked one. */}
          {goal.taskId ? (
            <Link
              href={`/tasks/${goal.taskId}`}
              title="Open the linked task"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors"
              style={{ background: "rgba(184,137,59,0.12)", color: "#8A6420" }}
            >
              <SquareArrowOutUpRight size={14} />
              {goal.taskNo ? `Task #${goal.taskNo}` : "View task"}
            </Link>
          ) : (
            canEdit && (
              <button
                type="button"
                onClick={addToTasks}
                disabled={addingTask}
                title="Create a tracked task for this goal (auto-priority Important)"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-black/[0.04] disabled:opacity-60"
                style={{ color: EDITORIAL.inkSoft }}
              >
                {addingTask ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
                Add to Tasks
              </button>
            )
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => onRequestDelete(goal)}
              title="Delete goal"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-red-50 hover:text-altus-red"
              style={{ color: EDITORIAL.inkSubtle }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}

          {/* Review expander — super-admins only — dark filled button */}
          {canReview && (
            <button
              type="button"
              onClick={() => setReviewOpen((o) => !o)}
              aria-expanded={reviewOpen}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: EDITORIAL.inkStrong }}
            >
              <ChevronRight
                size={15}
                className="transition-transform"
                style={{ transform: reviewOpen ? "rotate(90deg)" : "none" }}
              />
              Review
            </button>
          )}
        </div>

        {/* Review panel ------------------------------------------------ */}
        {canReview && reviewOpen && (
          <GoalReviewPanel
            goal={goal}
            statusDisplay={statusDisplay}
            onDelete={() => onRequestDelete(goal)}
          />
        )}
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
  tone = "slate",
}: {
  icon?: React.ReactNode;
  label?: string;
  tone?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold"
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 12%, transparent)`,
        color: `var(--color-${tone}-deep)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 28%, transparent)`,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function WeightInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => void;
}) {
  const [v, setV] = React.useState(String(value));
  React.useEffect(() => setV(String(value)), [value]);
  return (
    <input
      type="number"
      min={1}
      max={1000}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Math.max(1, Math.min(1000, Math.round(Number(v) || 100)));
        if (n !== value) onCommit(n);
        setV(String(n));
      }}
      className="w-24 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[14px] font-bold tabular-nums text-ink-strong outline-none focus:border-altus-red/50"
    />
  );
}
