"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Archive,
  ArchiveRestore,
  Lock,
  Unlock,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import { ADMIN_TASK_STATUSES, type TaskStatus } from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import {
  setWeeklyGoalReview,
  approveWeeklyGoal,
  archiveWeeklyGoal,
} from "@/app/(app)/weekly-goals/actions";
import type { BoardGoal, StatusDisplayMap } from "@/components/weekly-goals/types";
import { effectivePct } from "@/lib/weekly-goals/effective";
import { AutoTextarea } from "@/components/weekly-goals/field-controls";

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/**
 * Super-admin review expander for a weekly goal (design §6 / §5). Top half is the
 * read-only doer record (% Done, Explanation, Evidence). Bottom half is the
 * reviewer's controls: Status, Accept %, Review Notes, plus Approve / Archive /
 * Delete. While a goal is approved its Accept % is locked (un-approve to edit).
 */
export function GoalReviewPanel({
  goal,
  statusDisplay,
  onDelete,
}: {
  goal: BoardGoal;
  statusDisplay: StatusDisplayMap;
  /** Opens the board's shared delete-confirm dialog for this goal. */
  onDelete: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const approved = goal.approvedAt != null;
  const eff = effectivePct(goal);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        fireToast({ message: res.error ?? "Something went wrong", type: "error" });
        return;
      }
      if (success) fireToast({ message: success, type: "success" });
      router.refresh();
    });
  }

  return (
    <div
      className="mt-3 rounded-section border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline))",
        background: "var(--color-surface-soft)",
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={16} className="text-altus-red" strokeWidth={2.4} />
        <span className="text-[12px] font-black uppercase tracking-[0.06em] text-altus-red">
          Reviewer controls
        </span>
        {pending && <Loader2 size={14} className="animate-spin text-ink-muted" />}
      </div>

      {/* Read-only doer record ------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted">
            What the doer reported
          </h4>
          <dl className="space-y-2 text-[14px]">
            <div className="flex items-baseline gap-2">
              <dt className="font-bold text-ink-soft">% Done</dt>
              <dd className="font-black tabular-nums text-ink-strong">{goal.pctDone}%</dd>
              {goal.acceptPct != null && (
                <dd className="text-[12.5px] font-semibold text-ink-muted">
                  · accepted {goal.acceptPct}% · effective {eff}%
                </dd>
              )}
            </div>
            <div>
              <dt className="font-bold text-ink-soft">Explanation</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-ink-strong">
                {goal.explanation || <span className="text-ink-muted">—</span>}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-ink-soft">Evidence</dt>
              <dd className="mt-0.5">
                {goal.linkUrl ? (
                  <a
                    href={goal.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline break-all"
                  >
                    {goal.linkUrl}
                    <ExternalLink size={13} className="shrink-0" />
                  </a>
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Reviewer controls -------------------------------------------- */}
        <div>
          <h4 className="mb-2 text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted">
            Your review
          </h4>

          <label className="mb-3 block">
            <span className="mb-1 block text-[12.5px] font-bold text-ink-soft">Status</span>
            <select
              value={goal.status}
              disabled={pending}
              onChange={(e) =>
                run(
                  () => setWeeklyGoalReview({ id: goal.id, status: e.target.value as TaskStatus }),
                  "Status updated.",
                )
              }
              className={`w-full rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[14px] font-bold text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
            >
              {ADMIN_TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusDisplay[s]?.label ?? s}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-3 block">
            <span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft">
              Accept %
              {approved && (
                <span className="inline-flex items-center gap-1 text-altus-red">
                  <Lock size={12} /> locked
                </span>
              )}
            </span>
            <AcceptPctInput
              value={goal.acceptPct}
              fallback={goal.pctDone}
              disabled={pending || approved}
              onCommit={(n) =>
                run(() => setWeeklyGoalReview({ id: goal.id, acceptPct: n }), "Accept % saved.")
              }
            />
            {approved && (
              <span className="mt-1 block text-[12px] font-semibold text-ink-muted">
                Un-approve to change the accepted %.
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold text-ink-soft">Review notes</span>
            <AutoTextarea
              value={goal.reviewNotes ?? ""}
              disabled={pending}
              placeholder="Reviewer notes…"
              onCommit={(v) =>
                run(
                  () => setWeeklyGoalReview({ id: goal.id, reviewNotes: v || null }),
                  "Review notes saved.",
                )
              }
            />
          </label>
        </div>
      </div>

      {/* Provenance ----------------------------------------------------- */}
      {goal.reviewedAt && (
        <p className="mt-3 text-[12px] font-semibold text-ink-muted">
          Last reviewed{goal.reviewedByName ? ` by ${goal.reviewedByName}` : ""} on{" "}
          {formatDate(goal.reviewedAt)}
          {approved && goal.approvedAt ? ` · approved ${formatDate(goal.approvedAt)}` : ""}
        </p>
      )}

      {/* Actions -------------------------------------------------------- */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => approveWeeklyGoal({ id: goal.id, approved: !approved }),
              approved ? "Un-approved." : "Approved — Accept % locked.",
            )
          }
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60 ${FOCUS_RING}`}
          style={{
            background: approved
              ? "linear-gradient(135deg, var(--color-slate), var(--color-slate-deep))"
              : "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
          }}
        >
          {approved ? <Unlock size={15} /> : <ShieldCheck size={15} />}
          {approved ? "Un-approve" : "Approve"}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => archiveWeeklyGoal({ id: goal.id, archived: !goal.archived }),
              goal.archived ? "Restored to the board." : "Archived.",
            )
          }
          className={`inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-4 py-2 text-[14px] font-bold text-ink-soft transition-colors hover:text-ink-strong disabled:opacity-60 ${FOCUS_RING}`}
        >
          {goal.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          {goal.archived ? "Restore" : "Archive"}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-bold text-altus-red transition-colors hover:bg-red-50 disabled:opacity-60 ${FOCUS_RING}`}
        >
          <Trash2 size={15} />
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * Accept-% input. Empty = "not reviewed" → commits null (effective % falls back
 * to the doer's % Done). A number 0–100 commits that accepted value.
 */
function AcceptPctInput({
  value,
  fallback,
  disabled,
  onCommit,
}: {
  value: number | null;
  fallback: number;
  disabled?: boolean;
  onCommit: (n: number | null) => void;
}) {
  const [v, setV] = React.useState(value == null ? "" : String(value));
  React.useEffect(() => setV(value == null ? "" : String(value)), [value]);

  function commit() {
    const raw = v.trim();
    if (raw === "") {
      if (value != null) onCommit(null);
      return;
    }
    const n = Math.max(0, Math.min(100, Math.round(Number(raw))));
    if (!Number.isFinite(n)) return;
    if (n !== value) onCommit(n);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={100}
        value={v}
        disabled={disabled}
        placeholder={`${fallback} (from % Done)`}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        className={`w-32 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red/50 disabled:bg-transparent ${FOCUS_RING}`}
      />
      <span className="text-[13px] font-bold text-ink-muted">%</span>
    </div>
  );
}
