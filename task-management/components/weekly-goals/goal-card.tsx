"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Pencil,
  CopyPlus,
  Trash2,
  CalendarClock,
  IndianRupee,
  Loader2,
  Archive,
  ListPlus,
  SquareArrowOutUpRight,
  MoreHorizontal,
  ShieldCheck,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  editWeeklyGoal,
  setWeeklyGoalPct,
  setWeeklyGoalStatus,
  setWeeklyGoalReport,
  duplicateWeeklyGoal,
  createTaskFromGoal,
} from "@/app/(app)/weekly-goals/actions";
import { USER_TASK_STATUSES, type TaskStatus } from "@/db/enums";

/** The doer-settable status union (excludes the admin-only approval verdicts). */
type UserTaskStatus = (typeof USER_TASK_STATUSES)[number];
import type { BoardGoal, StatusDisplayMap } from "@/components/weekly-goals/types";
import { effectivePct, WEIGHT_BUDGET } from "@/lib/weekly-goals/effective";
import { formatInr } from "@/lib/format";
import { formatWeekShort } from "@/lib/weekly-goals/week";
import {
  ComboInput,
  AutoTextarea,
  LinkField,
  pctTone,
} from "@/components/weekly-goals/field-controls";
import { ProgressControl } from "@/components/weekly-goals/progress-control";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { GoalReviewPanel } from "@/components/weekly-goals/goal-review-panel";

/** Shared visible focus ring for keyboard users (brand-red, app-neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

/** Phase 4 — friendly labels for the structured incentive type on the chip. */
const INCENTIVE_TYPE_LABEL: Record<string, string> = {
  adhoc: "Ad-hoc",
  onetime: "One-time",
  routine: "Routine",
  "": "Incentive",
};

interface Props {
  goal: BoardGoal;
  srNo: number;
  /** #5 — manager of THIS goal: full edit / duplicate / delete / planning fields.
   *  A person is never a manager of their own goal. */
  canManage: boolean;
  /** #5 — may report on THIS goal: set progress % + status. Owner or manager. */
  canReport: boolean;
  canReview: boolean;
  isAdmin: boolean;
  statusDisplay: StatusDisplayMap;
  clientOptions: string[];
  subjectOptions: string[];
  /** Incentive catalog (Routine amount picker in the edit form). */
  catalog: { id: string; name: string; amount: number }[];
  /** Opens the board's shared two-step delete-confirm dialog. */
  onRequestDelete: (goal: BoardGoal) => void;
  /** Optimistic patch into the board's local rows. */
  onPatch?: (id: string, patch: Partial<BoardGoal>) => void;
  /** This person's live active-weight total this week (budget context). */
  employeeWeightTotal?: number;
  /** When true the card auto-opens its editor (deep link `?focus=<id>`). */
  autoFocus?: boolean;
}

function GoalCardImpl({
  goal,
  srNo,
  canManage,
  canReport,
  canReview,
  isAdmin: _isAdmin,
  statusDisplay,
  clientOptions,
  subjectOptions,
  catalog,
  onRequestDelete,
  onPatch,
  employeeWeightTotal = 0,
  autoFocus = false,
}: Props) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [editing, setEditing] = React.useState(autoFocus && canManage);
  const [reviewOpen, setReviewOpen] = React.useState(autoFocus && canReview);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const [incType, setIncType] = React.useState<"" | "adhoc" | "onetime" | "routine">(
    (goal.incentiveType as "" | "adhoc" | "onetime" | "routine") ?? "",
  );

  function saveIncentive(
    type: "" | "adhoc" | "onetime" | "routine",
    amount: number,
    catalogId: string | null,
  ) {
    save({
      id: goal.id,
      incentiveType: type || null,
      incentiveAmount: amount,
      incentiveCatalogId: catalogId,
    });
  }

  const eff = effectivePct(goal);
  const status = statusDisplay[goal.status];

  React.useEffect(() => {
    if (autoFocus) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoFocus]);

  // Inline edits are OPTIMISTIC: patch the board's local copy instantly, then
  // write in the background. Only resync on failure so a rejected change snaps back.
  function save(patch: Parameters<typeof editWeeklyGoal>[0]) {
    const { id: _id, ...rest } = patch;
    onPatch?.(goal.id, rest as Partial<BoardGoal>);
    start(async () => {
      const res = await editWeeklyGoal(patch);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); router.refresh(); }
    });
  }
  function savePct(pctDone: number) {
    onPatch?.(goal.id, { pctDone });
    start(async () => {
      const res = await setWeeklyGoalPct({ id: goal.id, pctDone });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); router.refresh(); }
    });
  }
  function saveStatus(status: UserTaskStatus) {
    onPatch?.(goal.id, { status: status as BoardGoal["status"] });
    start(async () => {
      const res = await setWeeklyGoalStatus({ id: goal.id, status });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); router.refresh(); }
    });
  }
  function saveReport(patch: { explanation?: string | null; linkUrl?: string | null }) {
    onPatch?.(goal.id, patch);
    start(async () => {
      const res = await setWeeklyGoalReport({ id: goal.id, ...patch });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); router.refresh(); }
    });
  }
  function duplicate() {
    start(async () => {
      const res = await duplicateWeeklyGoal({ id: goal.id });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Goal duplicated.", type: "success" });
      router.refresh();
    });
  }

  const [addingTask, setAddingTask] = React.useState(false);
  function addToTasks() {
    if (addingTask || goal.taskId) return;
    setAddingTask(true);
    (async () => {
      const res = await createTaskFromGoal({ goalId: goal.id });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); setAddingTask(false); return; }
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

  // The ⋯ More menu items (only the ones this viewer may use).
  const moreItems: MoreItem[] = [
    canManage && { key: "dup", icon: <CopyPlus size={15} />, label: "Duplicate", onClick: duplicate },
    goal.taskId
      ? { key: "task", icon: <SquareArrowOutUpRight size={15} />, label: goal.taskNo ? `Open task #${goal.taskNo}` : "Open task", href: `/tasks/${goal.taskId}` }
      : canManage && { key: "add", icon: <ListPlus size={15} />, label: "Add to Tasks", onClick: addToTasks },
    canManage && { key: "del", icon: <Trash2 size={15} />, label: "Delete", danger: true, onClick: () => onRequestDelete(goal) },
  ].filter(Boolean) as MoreItem[];

  return (
    <div
      ref={cardRef}
      className="wg-sheen relative overflow-hidden transition-shadow"
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 16,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -24px rgba(15,23,42,0.18)",
        opacity: goal.archived ? 0.82 : 1,
      }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: "var(--color-altus-red)" }} />

      <div className="p-5 pl-6">
        {/* ── READ ROW: identity · meta · progress ── */}
        <div className="flex items-start gap-5 max-md:flex-col">
          {/* Left — badge + eyebrow + title + chips + notes */}
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[13px] font-black tabular-nums text-white"
              style={{ background: "var(--color-ink-strong)" }}
            >
              {srNo}
            </span>
            <div className="min-w-0 flex-1">
              {(goal.client || goal.subject) && (
                <p className="text-[11px] font-black uppercase tracking-[0.09em]" style={{ color: "var(--color-ink-subtle)" }}>
                  {[goal.client, goal.subject].filter(Boolean).join(" · ")}
                </p>
              )}
              <h3 className="mt-1 text-[17px] font-bold leading-snug" style={{ color: "var(--color-ink-strong)", letterSpacing: "-0.005em" }}>
                {title}
              </h3>

              {(goal.incentive || goal.carriedFromId || goal.archived) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {goal.incentive && (
                    <Chip
                      icon={<IndianRupee size={12} />}
                      label={`${INCENTIVE_TYPE_LABEL[goal.incentiveType ?? ""] ?? "Incentive"}${goal.incentiveAmount > 0 ? ` · ${formatInr(goal.incentiveAmount)}` : ""}`}
                      tone="green"
                    />
                  )}
                  {goal.carriedFromId && <Chip label="↪ carried" />}
                  {goal.archived && <Chip icon={<Archive size={12} />} label="Archived" tone="slate" />}
                </div>
              )}

              {goal.notes && (
                <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink-soft)" }}>
                  {goal.notes}
                </p>
              )}
            </div>
          </div>

          {/* Middle — meta strip: weight · target · status */}
          <div className="flex shrink-0 items-start gap-5 max-md:flex-wrap max-md:gap-4">
            <Meta label="Weight">
              <span className="text-[15px] font-black tabular-nums" style={{ color: "var(--color-ink-strong)" }}>
                {goal.weight}
                <span className="ml-0.5 text-[11px] font-bold" style={{ color: "var(--color-ink-subtle)" }}>/{WEIGHT_BUDGET}</span>
              </span>
            </Meta>

            <Meta label="Target date">
              <InlineDate
                value={goal.targetDate}
                canEdit={canManage}
                onCommit={(v) => { if (v !== goal.targetDate) save({ id: goal.id, targetDate: v }); }}
              />
            </Meta>

            <Meta label="Status">
              {canReport ? (
                <StatusControl value={goal.status} statusDisplay={statusDisplay} disabled={pending} onCommit={saveStatus} />
              ) : (
                status && (
                  <span
                    className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold"
                    style={{
                      background: `color-mix(in srgb, var(--color-${status.color}) 14%, transparent)`,
                      color: `var(--color-${status.color}-deep)`,
                      border: `1px solid color-mix(in srgb, var(--color-${status.color}) 36%, transparent)`,
                    }}
                  >
                    {status.label}
                  </span>
                )
              )}
            </Meta>
          </div>

          {/* Right — the ONE progress control */}
          <div className="w-[240px] shrink-0 max-md:w-full">
            <p className="mb-1.5 text-[10.5px] font-black uppercase tracking-[0.1em]" style={{ color: "var(--color-ink-subtle)" }}>
              Progress
            </p>
            {canReport ? (
              <ProgressControl value={goal.pctDone} disabled={pending} onCommit={savePct} />
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${eff}%`, background: `linear-gradient(90deg, var(--color-${pctTone(eff)}), var(--color-${pctTone(eff)}-deep))` }}
                  />
                </div>
                <span className="w-11 shrink-0 text-right text-[15px] font-black tabular-nums" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink-strong)" }}>
                  {eff}%
                </span>
              </div>
            )}
            {goal.acceptPct != null && goal.acceptPct !== goal.pctDone && (
              <p className="mt-1.5 text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
                Reported {goal.pctDone}% · accepted {goal.acceptPct}%
              </p>
            )}
          </div>
        </div>

        {/* Owner REPORT (owner, not manager) — the narrative the reviewer reads. */}
        {canReport && !canManage && (
          <div className="mt-4 grid gap-3 rounded-xl border p-3.5" style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}>
            <span className="text-[11px] font-black uppercase tracking-[0.08em]" style={{ color: "var(--color-ink-subtle)" }}>Your report</span>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold" style={{ color: "var(--color-ink-soft)" }}>Explanation</span>
              <AutoTextarea value={goal.explanation ?? ""} placeholder="What did you do? (your reviewer reads this)" onCommit={(v) => saveReport({ explanation: v || null })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold" style={{ color: "var(--color-ink-soft)" }}>Evidence link</span>
              <LinkField value={goal.linkUrl ?? ""} onCommit={(v) => saveReport({ linkUrl: v || null })} />
            </label>
          </div>
        )}

        {/* ── ACTION ROW ── */}
        {(canManage || canReview || moreItems.length > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pt-3.5" style={{ borderTop: "1px solid var(--color-hairline)" }}>
            {pending && <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-ink-subtle)" }} />}

            {canManage && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors ${FOCUS_RING}`}
                style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-strong)", border: "1px solid var(--color-hairline-strong)" }}
              >
                <Pencil size={14} /> Edit
              </button>
            )}

            {canReview && (
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white transition-all ${FOCUS_RING}`}
                style={{ background: "var(--color-ink-strong)" }}
              >
                <ShieldCheck size={15} /> Review
              </button>
            )}

            {moreItems.length > 0 && (
              <div className="ml-auto">
                <MoreMenu items={moreItems} busy={addingTask} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── EDIT DRAWER ── */}
      {canManage && (
        <WeeklyGoalDrawer
          open={editing}
          onClose={() => setEditing(false)}
          eyebrow={`Goal ${srNo} · editing`}
          title={title}
          footer={
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
                Changes save automatically
              </span>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-bold text-white ${FOCUS_RING}`}
                style={{ background: "var(--color-altus-red)" }}
              >
                Done
              </button>
            </div>
          }
        >
          <div className="grid gap-5">
            {/* Group 1 — What & where */}
            <FieldGroup title="What & where">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Client">
                  <ComboInput value={goal.client ?? ""} options={clientOptions} placeholder="Client…" onCommit={(v) => save({ id: goal.id, client: v || null })} />
                </Field>
                <Field label="Subject">
                  <ComboInput value={goal.subject ?? ""} options={subjectOptions} placeholder="Subject…" onCommit={(v) => save({ id: goal.id, subject: v || null })} />
                </Field>
              </div>
              <Field label="Goal">
                <AutoTextarea value={goal.targetDone ?? ""} placeholder="What does done look like?" onCommit={(v) => save({ id: goal.id, targetDone: v || null })} />
              </Field>
            </FieldGroup>

            {/* Group 2 — Plan */}
            <FieldGroup title="Plan">
              <div className="flex flex-wrap items-end gap-4">
                <Field label="Weight">
                  <WeightInput value={goal.weight} employeeWeightTotal={employeeWeightTotal} onCommit={(w) => save({ id: goal.id, weight: w })} />
                </Field>
                <Field label="Target date">
                  <input
                    type="date"
                    defaultValue={goal.targetDate ?? ""}
                    onBlur={(e) => { const v = e.target.value || null; if (v !== goal.targetDate) save({ id: goal.id, targetDate: v }); }}
                    className={`rounded-md border border-hairline bg-white px-2.5 py-2 text-[14px] font-semibold text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 rounded-lg p-2.5" style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}>
                <span className="text-[12px] font-bold text-ink-soft">Incentive</span>
                <select
                  value={incType}
                  onChange={(e) => {
                    const v = e.target.value as "" | "adhoc" | "onetime" | "routine";
                    setIncType(v);
                    if (v === "") saveIncentive("", 0, null);
                    else if (v === "routine") saveIncentive("routine", 0, goal.incentiveCatalogId ?? null);
                    else saveIncentive(v, goal.incentiveAmount || 0, null);
                  }}
                  aria-label="Incentive type"
                  className={`cursor-pointer rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13.5px] font-bold text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
                >
                  <option value="">None</option>
                  <option value="adhoc">Ad-hoc</option>
                  <option value="onetime">Regular · One-time</option>
                  <option value="routine">Regular · Routine</option>
                </select>
                {(incType === "adhoc" || incType === "onetime") && (
                  <div className="inline-flex items-center rounded-md border border-hairline bg-white px-2 py-1">
                    <span className="text-[13px] font-bold text-ink-subtle">₹</span>
                    <input
                      type="number"
                      min={0}
                      defaultValue={goal.incentiveAmount || ""}
                      placeholder="amount"
                      aria-label="Incentive amount"
                      onBlur={(e) => saveIncentive(incType, Math.max(0, Math.round(Number(e.target.value) || 0)), null)}
                      className={`w-24 bg-transparent px-1 text-right text-[14px] font-black tabular-nums text-ink-strong ${FOCUS_RING}`}
                    />
                  </div>
                )}
                {incType === "routine" && (
                  <select
                    defaultValue={goal.incentiveCatalogId ?? ""}
                    onChange={(e) => saveIncentive("routine", 0, e.target.value || null)}
                    aria-label="Incentive from catalog"
                    className={`max-w-[240px] cursor-pointer rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13.5px] font-medium text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
                  >
                    <option value="">Pick from catalog…</option>
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} · {formatInr(c.amount)}</option>
                    ))}
                  </select>
                )}
                {goal.incentive && goal.incentiveAmount > 0 && (
                  <span className="ml-auto text-[13px] font-black tabular-nums text-altus-red">{formatInr(goal.incentiveAmount)}</span>
                )}
              </div>
            </FieldGroup>

            {/* Group 3 — Notes */}
            <FieldGroup title="Notes">
              <Field label="Planning notes">
                <AutoTextarea value={goal.notes ?? ""} placeholder="Plan / approach…" onCommit={(v) => save({ id: goal.id, notes: v || null })} />
              </Field>
              <Field label="Explanation">
                <AutoTextarea value={goal.explanation ?? ""} placeholder="Progress notes…" onCommit={(v) => save({ id: goal.id, explanation: v || null })} />
              </Field>
              <Field label="Evidence link">
                <LinkField value={goal.linkUrl ?? ""} onCommit={(v) => save({ id: goal.id, linkUrl: v || null })} />
              </Field>
            </FieldGroup>
          </div>
        </WeeklyGoalDrawer>
      )}

      {/* ── REVIEW DRAWER ── */}
      {canReview && (
        <WeeklyGoalDrawer
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          eyebrow={`Goal ${srNo} · review`}
          title={title}
          accent="var(--color-ink-strong)"
        >
          <GoalReviewPanel goal={goal} statusDisplay={statusDisplay} onDelete={() => onRequestDelete(goal)} />
        </WeeklyGoalDrawer>
      )}
    </div>
  );
}

/**
 * Memoised so a board-level search keystroke doesn't re-render every heavy card.
 */
export const GoalCard = React.memo(GoalCardImpl);

// ─── The ⋯ More menu (Duplicate · Add to Tasks / Open task · Delete) ──────────

interface MoreItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}

function MoreMenu({ items, busy }: { items: MoreItem[]; busy?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        aria-expanded={open}
        className={`wg-btn inline-flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-[var(--color-surface-soft)] ${FOCUS_RING}`}
        style={{ border: "1px solid var(--color-hairline-strong)" }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={18} />}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1.5 min-w-[190px] overflow-hidden rounded-xl p-1 wg-fade-in"
          style={{ background: "var(--color-surface-card)", border: "1px solid var(--color-hairline)", boxShadow: "0 16px 40px -16px rgba(15,23,42,0.32)" }}
        >
          {items.map((it) => {
            const cls = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-bold transition-colors ${FOCUS_RING}`;
            const tone = it.danger ? { color: "var(--color-altus-red-deep)" } : { color: "var(--color-ink-strong)" };
            if (it.href) {
              return (
                <Link key={it.key} href={it.href as Route} onClick={() => setOpen(false)} className={`${cls} hover:bg-[var(--color-surface-soft)]`} style={tone}>
                  {it.icon} {it.label}
                </Link>
              );
            }
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => { setOpen(false); it.onClick?.(); }}
                className={`${cls} ${it.danger ? "hover:bg-red-50" : "hover:bg-[var(--color-surface-soft)]"}`}
                style={tone}
              >
                {it.icon} {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Drawer form helpers ──────────────────────────────────────────────────────

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-subtle)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

// ─── Read-card controls ───────────────────────────────────────────────────────

function StatusControl({
  value,
  statusDisplay,
  disabled,
  onCommit,
}: {
  value: TaskStatus;
  statusDisplay: StatusDisplayMap;
  disabled?: boolean;
  onCommit: (status: UserTaskStatus) => void;
}) {
  const userStatuses = USER_TASK_STATUSES as readonly TaskStatus[];
  const options = React.useMemo<TaskStatus[]>(() => {
    const base = [...USER_TASK_STATUSES] as TaskStatus[];
    return base.includes(value) ? base : [value, ...base];
  }, [value]);
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label="Goal status"
      onChange={(e) => {
        const next = e.target.value as TaskStatus;
        if (next !== value && userStatuses.includes(next)) onCommit(next as UserTaskStatus);
      }}
      className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-bold text-ink-strong focus:border-altus-red/50 disabled:opacity-60 ${FOCUS_RING}`}
      style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
    >
      {options.map((s) => (
        <option key={s} value={s}>{statusDisplay[s]?.label ?? s}</option>
      ))}
    </select>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-black uppercase tracking-[0.1em]" style={{ color: "var(--color-ink-subtle)" }}>{label}</span>
      {children}
    </div>
  );
}

function InlineDate({
  value,
  canEdit,
  onCommit,
}: {
  value: string | null;
  canEdit: boolean;
  onCommit: (v: string | null) => void;
}) {
  if (!canEdit) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold tabular-nums" style={{ color: value ? "var(--color-ink-strong)" : "var(--color-ink-subtle)" }}>
        <CalendarClock size={13} style={{ color: "var(--color-ink-subtle)" }} />
        {value ? formatWeekShort(value) : "—"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1" style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}>
      <CalendarClock size={13} style={{ color: "var(--color-ink-subtle)" }} aria-hidden />
      <input
        type="date"
        defaultValue={value ?? ""}
        aria-label="Target date"
        onChange={(e) => onCommit(e.target.value || null)}
        className={`bg-transparent text-[13.5px] font-bold tabular-nums text-ink-strong ${FOCUS_RING} rounded-sm`}
      />
    </span>
  );
}

function Chip({ icon, label, tone = "slate" }: { icon?: React.ReactNode; label?: string; tone?: string }) {
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
  employeeWeightTotal,
  onCommit,
}: {
  value: number;
  employeeWeightTotal: number;
  onCommit: (n: number) => void;
}) {
  const [v, setV] = React.useState(String(value));
  React.useEffect(() => setV(String(value)), [value]);
  const othersTotal = Math.max(0, employeeWeightTotal - value);
  const thisWeight = Math.max(0, Number(v) || 0);
  const projected = othersTotal + thisWeight;
  const remaining = Math.max(0, WEIGHT_BUDGET - othersTotal - thisWeight);
  const over = projected > WEIGHT_BUDGET;
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        max={WEIGHT_BUDGET}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Math.max(1, Math.min(WEIGHT_BUDGET, Math.round(Number(v) || value || 1)));
          if (n !== value) onCommit(n);
          setV(String(n));
        }}
        className={`w-24 rounded-md border bg-white px-2.5 py-2 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
        style={{ borderColor: over ? "color-mix(in srgb, var(--color-altus-red) 50%, transparent)" : "var(--color-hairline)" }}
      />
      <span className="text-[12px] font-semibold" style={{ color: over ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)" }}>
        of {WEIGHT_BUDGET}
        {over ? ` · over by ${projected - WEIGHT_BUDGET}` : remaining > 0 ? ` · ${remaining} left` : ""}
      </span>
    </div>
  );
}
