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
  Loader2,
  Archive,
  ListPlus,
  SquareArrowOutUpRight,
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
  /** Optimistic patch into the board's local rows — used so inline edits
   *  (% / status / report / planning) update instantly WITHOUT a full-board
   *  router.refresh(). The server write still happens in the background. */
  onPatch?: (id: string, patch: Partial<BoardGoal>) => void;
  /** This person's live active-weight total this week (budget context for the
   *  inline Weight editor — warns when the week is off 100). Defaults to 0. */
  employeeWeightTotal?: number;
  /** When true the card auto-expands its editor (deep link `?focus=<id>`). */
  autoFocus?: boolean;
}

function GoalCardImpl({
  goal,
  srNo,
  canManage,
  canReport,
  canReview,
  isAdmin,
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

  // Phase 4 — local incentive-type state drives which control (amount vs catalog)
  // shows in the edit form; every commit passes the full trio so the server's
  // partial-edit recompute never wipes the other fields.
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
  // write in the background. NO router.refresh() on success — that full-board
  // re-fetch (per edit) was the buffer/stall. We only resync from the server if
  // the write fails, so a rejected change snaps back to truth.
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
  // Owner progress REPORT — explanation + evidence (the doer's narrative the
  // reviewer reads). The only content fields a normal employee may write besides
  // % + status; planning fields stay manager-only.
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
      className="wg-sheen relative overflow-hidden transition-shadow"
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 16,
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -24px rgba(15,23,42,0.18)",
        opacity: goal.archived ? 0.78 : 1,
      }}
    >
      {/* Altus-red accent rail */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: "var(--color-altus-red)" }}
      />

      <div className="p-5 pl-6">
        {/* ── READ-MODE ROW: index + identity · meta strip · progress · actions ── */}
        {!editing && (
          <div className="flex items-start gap-4 max-md:flex-col">
            {/* Left — index badge + eyebrow + title (the row's identity). */}
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[13px] font-black tabular-nums text-white"
                style={{ background: "var(--color-ink-strong)" }}
              >
                {srNo}
              </span>
              <div className="min-w-0 flex-1">
                {(goal.client || goal.subject) && (
                  <p
                    className="text-[11px] font-black uppercase tracking-[0.09em]"
                    style={{ color: "var(--color-ink-subtle)" }}
                  >
                    {[goal.client, goal.subject].filter(Boolean).join(" · ")}
                  </p>
                )}
                <h3
                  className="mt-1 text-[16px] font-bold leading-snug"
                  style={{ color: "var(--color-ink-strong)", letterSpacing: "-0.005em" }}
                >
                  {title}
                </h3>

                {/* Secondary chips (incentive / carried / archived). */}
                {(goal.incentive || goal.carriedFromId || goal.archived) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {goal.incentive && (
                      <Chip
                        icon={<IndianRupee size={12} />}
                        label={`${INCENTIVE_TYPE_LABEL[goal.incentiveType ?? ""] ?? "Incentive"}${
                          goal.incentiveAmount > 0 ? ` · ${formatInr(goal.incentiveAmount)}` : ""
                        }`}
                        tone="green"
                      />
                    )}
                    {goal.carriedFromId && <Chip label="↪ carried" />}
                    {goal.archived && (
                      <Chip icon={<Archive size={12} />} label="Archived" tone="slate" />
                    )}
                  </div>
                )}

                {/* Notes (planning) under the title — kept readable, no hover gate. */}
                {goal.notes && (
                  <p
                    className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-wrap"
                    style={{ color: "var(--color-ink-soft)" }}
                  >
                    {goal.notes}
                  </p>
                )}
              </div>
            </div>

            {/* Middle — aligned meta strip: weight · target date · status. */}
            <div className="flex shrink-0 items-center gap-4 max-md:flex-wrap max-md:gap-3">
              <Meta label="Weight">
                <span
                  className="text-[15px] font-black tabular-nums"
                  style={{ color: "var(--color-ink-strong)" }}
                >
                  {goal.weight}
                  <span
                    className="ml-0.5 text-[11px] font-bold"
                    style={{ color: "var(--color-ink-subtle)" }}
                  >
                    /{WEIGHT_BUDGET}
                  </span>
                </span>
              </Meta>

              <Meta label="Target date">
                <InlineDate
                  value={goal.targetDate}
                  canEdit={canManage}
                  onCommit={(v) => {
                    if (v !== goal.targetDate) save({ id: goal.id, targetDate: v });
                  }}
                />
              </Meta>

              <Meta label="Status">
                {canReport ? (
                  <StatusControl
                    value={goal.status}
                    statusDisplay={statusDisplay}
                    disabled={pending}
                    onCommit={saveStatus}
                  />
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

            {/* Right — progress (bar + %) + quick-% presets. */}
            <div className="w-[210px] shrink-0 max-md:w-full">
              <p
                className="mb-1.5 text-[10.5px] font-black uppercase tracking-[0.1em]"
                style={{ color: "var(--color-ink-subtle)" }}
              >
                Progress
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="h-2.5 flex-1 overflow-hidden rounded-full"
                  style={{ background: "var(--color-surface-track)" }}
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
                  className="w-11 shrink-0 text-right text-[15px] font-black tabular-nums"
                  style={{ fontFamily: "var(--font-display)", color: "var(--color-ink-strong)" }}
                >
                  {eff}%
                </span>
              </div>
              {goal.acceptPct != null && goal.acceptPct !== goal.pctDone && (
                <p
                  className="mt-1 text-[12px] font-semibold"
                  style={{ color: "var(--color-ink-subtle)" }}
                >
                  Doer reported {goal.pctDone}% · accepted {goal.acceptPct}%
                </p>
              )}
              {/* #6 — progress control (owner or manager): slider + editable
                  number, debounced so dragging doesn't spam the server. */}
              {canReport && (
                <ProgressControl
                  value={goal.pctDone}
                  disabled={pending}
                  onCommit={savePct}
                />
              )}
            </div>
          </div>
        )}

        {/* Owner REPORT — explanation + evidence (the doer's narrative the
            reviewer reads). Shown to the OWNER only; managers edit these inside
            the full editor. Planning fields stay manager-only. */}
        {!editing && canReport && !canManage && (
          <div
            className="mt-4 grid gap-3 rounded-xl border p-3.5"
            style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}
          >
            <span
              className="text-[11px] font-black uppercase tracking-[0.08em]"
              style={{ color: "var(--color-ink-subtle)" }}
            >
              Your report
            </span>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold" style={{ color: "var(--color-ink-soft)" }}>
                Explanation
              </span>
              <AutoTextarea
                value={goal.explanation ?? ""}
                placeholder="What did you do? (your reviewer reads this)"
                onCommit={(v) => saveReport({ explanation: v || null })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold" style={{ color: "var(--color-ink-soft)" }}>
                Evidence link
              </span>
              <LinkField
                value={goal.linkUrl ?? ""}
                onCommit={(v) => saveReport({ linkUrl: v || null })}
              />
            </label>
          </div>
        )}

        {/* Inline editor (expands below within the same full-width card) ---- */}
        {editing && canManage && (
          <div className="grid gap-3">
            {/* Editor header: index + Done button keep the row anchored. */}
            <div className="flex items-center gap-3">
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[13px] font-black tabular-nums text-white"
                style={{ background: "var(--color-ink-strong)" }}
              >
                {srNo}
              </span>
              <span
                className="text-[11px] font-black uppercase tracking-[0.1em]"
                style={{ color: "var(--color-ink-subtle)" }}
              >
                Editing goal
              </span>
            </div>

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
                <WeightInput
                  value={goal.weight}
                  employeeWeightTotal={employeeWeightTotal}
                  onCommit={(w) => save({ id: goal.id, weight: w })}
                />
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
                  className={`rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[14px] font-semibold text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
                />
              </label>
            </div>

            {/* Incentive: Ad-hoc / One-time (manual ₹) · Routine (from catalog) */}
            <div
              className="flex flex-wrap items-center gap-2.5 rounded-lg p-2.5"
              style={{
                background: "var(--color-surface-soft)",
                border: "1px solid var(--color-hairline)",
              }}
            >
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
                    <option key={c.id} value={c.id}>
                      {c.name} · {formatInr(c.amount)}
                    </option>
                  ))}
                </select>
              )}
              {goal.incentive && goal.incentiveAmount > 0 && (
                <span className="ml-auto text-[13px] font-black tabular-nums text-altus-red">{formatInr(goal.incentiveAmount)}</span>
              )}
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
          className="mt-4 flex flex-wrap items-center gap-1.5 pt-3.5"
          style={{ borderTop: "1px solid var(--color-hairline)" }}
        >
          {pending && (
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-ink-subtle)" }} />
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-black/[0.04] ${FOCUS_RING}`}
              style={{ color: "var(--color-ink-soft)" }}
            >
              {editing ? <Check size={14} /> : <Pencil size={14} />}
              {editing ? "Done" : "Edit"}
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={duplicate}
              disabled={pending}
              title="Duplicate into this week"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-black/[0.04] disabled:opacity-60 ${FOCUS_RING}`}
              style={{ color: "var(--color-ink-soft)" }}
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors ${FOCUS_RING}`}
              style={{
                background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
                color: "var(--color-altus-red-deep)",
              }}
            >
              <SquareArrowOutUpRight size={14} />
              {goal.taskNo ? `Task #${goal.taskNo}` : "View task"}
            </Link>
          ) : (
            canManage && (
              <button
                type="button"
                onClick={addToTasks}
                disabled={addingTask}
                title="Create a tracked task for this goal (auto-priority Important)"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-black/[0.04] disabled:opacity-60 ${FOCUS_RING}`}
                style={{ color: "var(--color-ink-soft)" }}
              >
                {addingTask ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
                Add to Tasks
              </button>
            )
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => onRequestDelete(goal)}
              title="Delete goal"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-red-50 hover:text-altus-red ${FOCUS_RING}`}
              style={{ color: "var(--color-ink-subtle)" }}
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
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] ${FOCUS_RING}`}
              style={{ background: "var(--color-ink-strong)" }}
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

/**
 * Memoised so a board-level search keystroke (which re-renders the board) does
 * NOT re-render every heavy card — only cards whose props actually change. Pairs
 * with the board's `useDeferredValue` to keep typing smooth on a full team.
 */
export const GoalCard = React.memo(GoalCardImpl);

/**
 * #6 — progress control: a range slider + an editable number that mirror the
 * same 0–100 value, both keyboard-accessible. The slider is debounced so a drag
 * commits only on release (pointerup / change-end); the number commits on blur
 * or Enter. Local state lets the slider/number feel instant while the server
 * write happens on commit. Selected value drives the read-only bar above it.
 */
function ProgressControl({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (pct: number) => void;
}) {
  const [v, setV] = React.useState(value);
  // Re-sync if the server value changes underneath us (e.g. after a refresh).
  React.useEffect(() => setV(value), [value]);

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  function commit(n: number) {
    const c = clamp(n);
    setV(c);
    if (c !== value) onCommit(c);
  }

  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={v}
        disabled={disabled}
        aria-label="Progress percent"
        onChange={(e) => setV(clamp(Number(e.target.value)))}
        // Commit on drag-release (mouse) / change-end (keyboard arrows).
        onMouseUp={() => commit(v)}
        onTouchEnd={() => commit(v)}
        onKeyUp={(e) => {
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") commit(v);
        }}
        className={`h-1.5 flex-1 cursor-pointer rounded-full accent-[var(--color-altus-red)] disabled:opacity-60 ${FOCUS_RING}`}
      />
      <div
        className="inline-flex items-center rounded-md border bg-white px-1.5 py-0.5"
        style={{ borderColor: "var(--color-hairline-strong)" }}
      >
        <input
          type="number"
          min={0}
          max={100}
          value={v}
          disabled={disabled}
          aria-label="Progress percent value"
          onChange={(e) => setV(clamp(Number(e.target.value) || 0))}
          onBlur={() => commit(v)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(v);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`w-9 bg-transparent text-right text-[13px] font-black tabular-nums text-ink-strong ${FOCUS_RING} rounded-sm`}
        />
        <span className="text-[11px] font-bold text-ink-subtle">%</span>
      </div>
    </div>
  );
}

/**
 * #5/#6 — owner-or-manager status dropdown. Constrained to the doer-settable
 * non-approval statuses (USER_TASK_STATUSES); the approval verdicts stay
 * manager-only via the review panel. Keyboard-accessible native select.
 */
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
  // Always include the goal's current status as an option even if it's outside
  // USER_TASK_STATUSES (e.g. an admin-set 'approved'), so the select shows truth.
  // That out-of-list value is display-only — committing it back is blocked below.
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
        // Only commit doer-settable statuses (the action rejects the rest anyway).
        if (next !== value && userStatuses.includes(next)) {
          onCommit(next as UserTaskStatus);
        }
      }}
      className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-bold text-ink-strong focus:border-altus-red/50 disabled:opacity-60 ${FOCUS_RING}`}
      style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {statusDisplay[s]?.label ?? s}
        </option>
      ))}
    </select>
  );
}

/** A labelled meta cell for the read-mode strip (label over value, aligned). */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10.5px] font-black uppercase tracking-[0.1em]"
        style={{ color: "var(--color-ink-subtle)" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Always-visible, keyboard-accessible inline target-date control. When the
 * viewer can edit, it's a real native date input (Enter/Space open the picker,
 * commits on change/blur); otherwise it renders the formatted read-only date.
 */
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
      <span
        className="inline-flex items-center gap-1.5 text-[13.5px] font-bold tabular-nums"
        style={{ color: value ? "var(--color-ink-strong)" : "var(--color-ink-subtle)" }}
      >
        <CalendarClock size={13} style={{ color: "var(--color-ink-subtle)" }} />
        {value ? formatWeekShort(value) : "—"}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1"
      style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
    >
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
  employeeWeightTotal,
  onCommit,
}: {
  value: number;
  /** This person's full active-weight total this week (includes this goal). */
  employeeWeightTotal: number;
  onCommit: (n: number) => void;
}) {
  const [v, setV] = React.useState(String(value));
  React.useEffect(() => setV(String(value)), [value]);
  // Budget-aware (mirrors goal-quick-add's meter): the week's weights should
  // total 100. We DON'T hard-block editing — the board's "Balance to 100" button
  // is the corrective tool — but we surface how much budget is left and warn when
  // the person's projected total runs over. `othersTotal` excludes this goal.
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
          // Clamp to [1, 100] — a single goal can never exceed the 100-point week.
          // The board's "Balance to 100" button corrects the total across goals.
          const n = Math.max(1, Math.min(WEIGHT_BUDGET, Math.round(Number(v) || value || 1)));
          if (n !== value) onCommit(n);
          setV(String(n));
        }}
        className={`w-24 rounded-md border bg-white px-2.5 py-1.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
        style={{ borderColor: over ? "color-mix(in srgb, var(--color-altus-red) 50%, transparent)" : "var(--color-hairline)" }}
      />
      <span
        className="text-[12px] font-semibold"
        style={{ color: over ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)" }}
      >
        of {WEIGHT_BUDGET}
        {over ? ` · over by ${projected - WEIGHT_BUDGET}` : remaining > 0 ? ` · ${remaining} left` : ""}
      </span>
    </div>
  );
}
