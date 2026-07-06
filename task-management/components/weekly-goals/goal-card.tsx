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
  TrendingUp,
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

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

const INCENTIVE_TYPE_LABEL: Record<string, string> = {
  adhoc: "Ad-hoc",
  onetime: "One-time",
  routine: "Routine",
  "": "Incentive",
};

interface Props {
  goal: BoardGoal;
  srNo: number;
  canManage: boolean;
  canReport: boolean;
  canReview: boolean;
  isAdmin: boolean;
  statusDisplay: StatusDisplayMap;
  clientOptions: string[];
  subjectOptions: string[];
  catalog: { id: string; name: string; amount: number }[];
  onRequestDelete: (goal: BoardGoal) => void;
  onPatch?: (id: string, patch: Partial<BoardGoal>) => void;
  employeeWeightTotal?: number;
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
  const [reportOpen, setReportOpen] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const [incType, setIncType] = React.useState<"" | "adhoc" | "onetime" | "routine">(
    (goal.incentiveType as "" | "adhoc" | "onetime" | "routine") ?? "",
  );

  function saveIncentive(type: "" | "adhoc" | "onetime" | "routine", amount: number, catalogId: string | null) {
    save({ id: goal.id, incentiveType: type || null, incentiveAmount: amount, incentiveCatalogId: catalogId });
  }

  const eff = effectivePct(goal);
  const status = statusDisplay[goal.status];
  const goalComplete = eff >= 100 || goal.status === "approved" || goal.status === "done";

  React.useEffect(() => {
    if (autoFocus) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoFocus]);

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
  function saveStatus(s: UserTaskStatus) {
    onPatch?.(goal.id, { status: s as BoardGoal["status"] });
    start(async () => {
      const res = await setWeeklyGoalStatus({ id: goal.id, status: s });
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

  const identity = [goal.client, goal.subject].filter(Boolean).join(" · ");
  const ringTone = goalComplete ? "green" : pctTone(eff);

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
      className="group relative transition-colors"
      style={{ opacity: goal.archived ? 0.6 : 1 }}
    >
      {/* ── One clean list row: ring · title+meta · hover actions ── */}
      <div className="flex items-start gap-4 px-4 py-3.5 transition-colors group-hover:bg-[color-mix(in_srgb,var(--color-ink-strong)_3%,transparent)]">
        {/* Progress ring — a quick "report" trigger for the doer/manager. */}
        {canReport ? (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            aria-label={`Report progress on "${title}"`}
            className={`shrink-0 rounded-full transition-transform hover:scale-105 ${FOCUS_RING}`}
          >
            <ProgressRing pct={eff} tone={ringTone} />
          </button>
        ) : (
          <div className="shrink-0">
            <ProgressRing pct={eff} tone={ringTone} />
          </div>
        )}

        {/* Title + quiet metadata line */}
        <div className="min-w-0 flex-1 pt-0.5">
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--color-ink-strong)", letterSpacing: "-0.006em" }}
          >
            {title}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]" style={{ color: "var(--color-ink-subtle)" }}>
            {identity && <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>{identity}</span>}
            {identity && <Sep />}
            <span>wt <b className="tabular-nums" style={{ color: "var(--color-ink-soft)" }}>{goal.weight}</b><span style={{ opacity: 0.7 }}>/{WEIGHT_BUDGET}</span></span>
            {goal.targetDate && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 tabular-nums"><CalendarClock size={11} aria-hidden />{formatWeekShort(goal.targetDate)}</span>
              </>
            )}
            {status && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-1.5 rounded-full" style={{ background: `var(--color-${status.color})` }} aria-hidden />
                  {status.label}
                </span>
              </>
            )}
            {goal.incentive && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-0.5" style={{ color: "var(--color-green-deep)" }}>
                  <IndianRupee size={11} aria-hidden />{goal.incentiveAmount > 0 ? formatInr(goal.incentiveAmount) : INCENTIVE_TYPE_LABEL[goal.incentiveType ?? ""]}
                </span>
              </>
            )}
            {goal.carriedFromId && (<><Sep /><span>↪ carried</span></>)}
            {goal.archived && (<><Sep /><span className="inline-flex items-center gap-1"><Archive size={11} aria-hidden />archived</span></>)}
          </div>

          {goal.notes && (
            <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink-soft)" }}>
              {goal.notes}
            </p>
          )}
          {goal.acceptPct != null && goal.acceptPct !== goal.pctDone && (
            <p className="mt-1 text-[11.5px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
              Reported {goal.pctDone}% · accepted {goal.acceptPct}%
            </p>
          )}
        </div>

        {/* Right — actions, revealed on hover (always visible on touch). */}
        <div className="flex shrink-0 items-center gap-1 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          {pending && <Loader2 size={13} className="animate-spin" style={{ color: "var(--color-ink-subtle)" }} />}
          {canReport && !canManage && (
            <RowAction onClick={() => setReportOpen(true)} label="Report" icon={<TrendingUp size={14} />} />
          )}
          {canManage && (
            <RowAction onClick={() => setEditing(true)} label="Edit" icon={<Pencil size={14} />} />
          )}
          {canReview && (
            <RowAction onClick={() => setReviewOpen(true)} label="Review" icon={<ShieldCheck size={14} />} dark />
          )}
          {moreItems.length > 0 && <MoreMenu items={moreItems} busy={addingTask} />}
        </div>
      </div>

      {/* ── REPORT DRAWER (doer) — status · progress · explanation · evidence ── */}
      {canReport && !canManage && (
        <WeeklyGoalDrawer
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          eyebrow={`Goal ${srNo} · report`}
          title={title}
          footer={<DrawerDoneFooter onDone={() => setReportOpen(false)} />}
        >
          <ReportFields
            goal={goal}
            statusDisplay={statusDisplay}
            pending={pending}
            onStatus={saveStatus}
            onPct={savePct}
            onReport={saveReport}
          />
        </WeeklyGoalDrawer>
      )}

      {/* ── EDIT DRAWER (manager) — report + planning ── */}
      {canManage && (
        <WeeklyGoalDrawer
          open={editing}
          onClose={() => setEditing(false)}
          eyebrow={`Goal ${srNo} · editing`}
          title={title}
          footer={<DrawerDoneFooter onDone={() => setEditing(false)} />}
        >
          <div className="grid gap-6">
            <FieldGroup title="Progress & report">
              <ReportFields
                goal={goal}
                statusDisplay={statusDisplay}
                pending={pending}
                onStatus={saveStatus}
                onPct={savePct}
                onReport={saveReport}
              />
            </FieldGroup>

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

              <Field label="Planning notes">
                <AutoTextarea value={goal.notes ?? ""} placeholder="Plan / approach…" onCommit={(v) => save({ id: goal.id, notes: v || null })} />
              </Field>
            </FieldGroup>
          </div>
        </WeeklyGoalDrawer>
      )}

      {/* ── REVIEW DRAWER (reviewer) ── */}
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

export const GoalCard = React.memo(GoalCardImpl);

// ─── Small pieces ───────────────────────────────────────────────────────────

/** A quiet dot separator for the metadata line. */
function Sep() {
  return <span aria-hidden style={{ opacity: 0.5 }}>·</span>;
}

/** The circular progress ring shown at the start of each row. */
function ProgressRing({ pct, tone }: { pct: number; tone: string }) {
  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`var(--color-${tone})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - p / 100)}
          style={{ transition: "stroke-dashoffset 0.55s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[12px] font-black tabular-nums" style={{ fontFamily: "var(--font-display)", color: `var(--color-${tone}-deep)` }}>
          {p}
        </span>
      </div>
    </div>
  );
}

/** A hover-revealed row action button (icon + optional label). */
function RowAction({ onClick, label, icon, dark }: { onClick: () => void; label: string; icon: React.ReactNode; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`wg-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition-colors ${FOCUS_RING}`}
      style={
        dark
          ? { background: "var(--color-ink-strong)", color: "#fff" }
          : { background: "var(--color-surface-soft)", color: "var(--color-ink-soft)", border: "1px solid var(--color-hairline-strong)" }
      }
    >
      {icon}
      <span className="max-md:hidden">{label}</span>
    </button>
  );
}

/** Shared "Done" footer for the report/edit drawers (changes autosave). */
function DrawerDoneFooter({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>Changes save automatically</span>
      <button
        type="button"
        onClick={onDone}
        className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-bold text-white ${FOCUS_RING}`}
        style={{ background: "var(--color-altus-red)" }}
      >
        Done
      </button>
    </div>
  );
}

/** The doer's report fields — status, progress, explanation, evidence. Shared by
 *  the Report drawer (doers) and the Edit drawer's Progress group (managers). */
function ReportFields({
  goal,
  statusDisplay,
  pending,
  onStatus,
  onPct,
  onReport,
}: {
  goal: BoardGoal;
  statusDisplay: StatusDisplayMap;
  pending: boolean;
  onStatus: (s: UserTaskStatus) => void;
  onPct: (p: number) => void;
  onReport: (patch: { explanation?: string | null; linkUrl?: string | null }) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12.5px] font-bold text-ink-soft">Status</span>
        <StatusControl value={goal.status} statusDisplay={statusDisplay} disabled={pending} onCommit={onStatus} />
      </div>
      <Field label="Progress">
        <ProgressControl value={goal.pctDone} disabled={pending} onCommit={onPct} />
      </Field>
      <Field label="Explanation">
        <AutoTextarea value={goal.explanation ?? ""} placeholder="What did you do? (your reviewer reads this)" onCommit={(v) => onReport({ explanation: v || null })} />
      </Field>
      <Field label="Evidence link">
        <LinkField value={goal.linkUrl ?? ""} onCommit={(v) => onReport({ linkUrl: v || null })} />
      </Field>
    </div>
  );
}

// ─── The ⋯ More menu ──────────────────────────────────────────────────────────

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
        className={`wg-btn inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-[var(--color-surface-soft)] ${FOCUS_RING}`}
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
      <h3 className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-subtle)" }}>{title}</h3>
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

// ─── Report controls ──────────────────────────────────────────────────────────

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
      className={`cursor-pointer rounded-full border px-2.5 py-1.5 text-[13px] font-bold text-ink-strong focus:border-altus-red/50 disabled:opacity-60 ${FOCUS_RING}`}
      style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
    >
      {options.map((s) => (
        <option key={s} value={s}>{statusDisplay[s]?.label ?? s}</option>
      ))}
    </select>
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
