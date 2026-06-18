"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Check,
  CopyPlus,
  Trash2,
  ChevronRight,
  CalendarClock,
  Scale,
  IndianRupee,
  Target,
  Loader2,
  Archive,
} from "lucide-react";
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";
import { fireToast } from "@/lib/toast";
import {
  editWeeklyGoal,
  setWeeklyGoalPct,
  duplicateWeeklyGoal,
} from "@/app/(app)/weekly-goals/actions";
import type { BoardGoal, StatusDisplayMap } from "@/components/weekly-goals/types";
import { effectivePct } from "@/lib/weekly-goals/effective";
import { formatInr } from "@/lib/format";
import { formatWeekShort } from "@/lib/weekly-goals/week";
import {
  ComboInput,
  AutoTextarea,
  LinkField,
  PriorityPicker,
  YesNo,
  PRIORITY_TONE,
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

  const tone = PRIORITY_TONE[goal.priority];
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

  const title =
    goal.targetDone?.trim() ||
    [goal.client, goal.subject].filter(Boolean).join(" · ") ||
    "Untitled goal";

  return (
    <div
      ref={cardRef}
      className="relative overflow-hidden rounded-section border border-hairline bg-surface-card transition-shadow hover:shadow-[0_8px_28px_-14px_rgba(15,23,42,0.22)]"
      style={{
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
        opacity: goal.archived ? 0.72 : 1,
      }}
    >
      {/* Priority accent rail */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: `var(--color-${tone})` }}
      />

      <div className="p-4 pl-5">
        {/* Header row: sr-no + chips + actions ------------------------- */}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[12px] font-black tabular-nums text-ink-muted">
            {srNo}
          </span>

          <div className="min-w-0 flex-1">
            {/* Client · Subject eyebrow */}
            {!editing && (goal.client || goal.subject) && (
              <p className="text-[12.5px] font-black uppercase tracking-[0.04em] text-ink-muted">
                {[goal.client, goal.subject].filter(Boolean).join(" · ")}
              </p>
            )}

            {/* Goal title (read mode) */}
            {!editing && (
              <h3 className="mt-0.5 text-[16px] font-bold leading-snug text-ink-strong">
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
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-9">
            <Chip
              icon={<span className="font-black" style={{ color: `var(--color-${tone}-deep)` }}>{PRIORITY_LABELS[goal.priority]}</span>}
              tone={tone}
            />
            <Chip icon={<Scale size={12} />} label={`Weight ${goal.weight}`} />
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
            {goal.kpi && <Chip icon={<Target size={12} />} label="KPI" tone="purple" />}
            {goal.carriedFromId && <Chip label="↪ carried" />}
            {goal.archived && <Chip icon={<Archive size={12} />} label="Archived" tone="slate" />}
          </div>
        )}

        {/* Notes (planning) -------------------------------------------- */}
        {!editing && goal.notes && (
          <p className="mt-3 pl-9 text-[14px] leading-relaxed text-ink-soft whitespace-pre-wrap">
            {goal.notes}
          </p>
        )}

        {/* Progress bar ------------------------------------------------ */}
        {!editing && (
          <div className="mt-3 pl-9">
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${eff}%`,
                    background: `linear-gradient(90deg, var(--color-${pctTone(eff)}), var(--color-${pctTone(eff)}-deep))`,
                  }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-[14px] font-black tabular-nums text-ink-strong">
                {eff}%
              </span>
            </div>
            {goal.acceptPct != null && goal.acceptPct !== goal.pctDone && (
              <p className="mt-1 text-[12px] font-semibold text-ink-muted">
                Doer reported {goal.pctDone}% · accepted {goal.acceptPct}%
              </p>
            )}
            {/* Quick % presets (owner / admin) */}
            {canEdit && (
              <div className="mt-2 flex gap-1.5">
                {PCT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => savePct(p)}
                    disabled={pending}
                    className="rounded-full border border-hairline px-2.5 py-0.5 text-[12px] font-bold text-ink-muted transition-colors hover:border-altus-red/40 hover:text-altus-red disabled:opacity-60"
                  >
                    {p}%
                  </button>
                ))}
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
                <span className="mb-1 block text-[12px] font-bold text-ink-soft">Priority</span>
                <PriorityPicker
                  value={goal.priority}
                  onChange={(p) => save({ id: goal.id, priority: p })}
                />
              </label>
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
                <span className="text-[12px] font-bold text-ink-soft">KPI</span>
                <YesNo value={goal.kpi} onChange={(v) => save({ id: goal.id, kpi: v })} />
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
        <div className="mt-4 flex flex-wrap items-center gap-1.5 pl-9">
          {pending && <Loader2 size={14} className="animate-spin text-ink-muted" />}

          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
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
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:text-ink-strong disabled:opacity-60"
            >
              <CopyPlus size={14} />
              Duplicate
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => onRequestDelete(goal)}
              title="Delete goal"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-ink-muted transition-colors hover:bg-red-50 hover:text-altus-red"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}

          {/* Review expander — super-admins only */}
          {canReview && (
            <button
              type="button"
              onClick={() => setReviewOpen((o) => !o)}
              aria-expanded={reviewOpen}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold text-altus-red transition-colors hover:bg-red-50"
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
