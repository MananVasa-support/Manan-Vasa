"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  CheckCircle2,
  Lock,
  Loader2,
  Timer,
  History,
  ListChecks,
  GitBranch,
  ThumbsUp,
  ThumbsDown,
  Camera,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { TaskTimeState } from "@/lib/queries/task-time";
import type { SnapshotView } from "@/lib/queries/work-snapshots";
import { formatDuration, formatMinutesLabel } from "@/lib/tasks/time/types";
import {
  startWorkAction,
  pauseWorkAction,
  markDoneAction,
  decideApprovalAction,
} from "@/app/(app)/tasks/time-actions";
import { useElapsedSeconds } from "./use-elapsed";
import { WorkSessions } from "./work-sessions";
import { ActivityTimeline } from "./activity-timeline";
import { RevisionHistory } from "./revision-history";
import { WorkCamera } from "./work-camera";
import { SnapshotGallery } from "./snapshot-gallery";

/** Loader-provided payload (everything except the taskId the view already holds). */
export interface TaskTimePanelData {
  state: TaskTimeState;
  isDoer: boolean;
  canOperate: boolean;
  canApprove: boolean;
  approvalStatus: string | null;
  taskStatus: string;
  camera: { enabled: boolean; hasConsent: boolean; intervalMin: number };
  isSuperAdmin: boolean;
  snapshots: SnapshotView[];
}

interface Props extends TaskTimePanelData {
  taskId: string;
}

function LiveClock({ startedAt }: { startedAt: string }) {
  const secs = useElapsedSeconds(startedAt);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="tabular-nums">
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

export function TaskTimePanel(props: Props) {
  const { taskId, state, canOperate, canApprove, approvalStatus, taskStatus, camera, isSuperAdmin, snapshots, isDoer } = props;
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [rejecting, setRejecting] = React.useState(false);
  const [comment, setComment] = React.useState("");

  const live = state.live;
  const locked = approvalStatus === "approved";
  const r = state.rollup;
  const hasWork = r.totalActiveSeconds > 0 || !!live;
  const awaitingReview = taskStatus === "done" && approvalStatus !== "approved";
  const firstOfRevision = !state.sessions.some((s) => s.revision === r.currentRevision);
  const startLabel = firstOfRevision ? (r.currentRevision > 1 ? "Start Revision" : "Start Work") : "Resume";

  function act(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) fireToast({ message: res.message ?? "Couldn't complete that.", type: "error" });
      router.refresh();
    });
  }

  return (
    <section className="wg-rise rounded-section border border-hairline bg-surface-card p-6 max-md:p-5">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-altus-red)_10%,white)] text-altus-red">
          <Timer size={17} />
        </span>
        <h2 className="text-[15px] font-black uppercase tracking-[0.1em] text-ink-strong">Time Intelligence</h2>
        {r.rejectionCount > 0 && (
          <span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--color-altus-red)_10%,white)] px-2.5 py-1 text-[11px] font-bold text-altus-red-deep">
            {r.rejectionCount} revision{r.rejectionCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Timer hero + controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-hairline bg-white px-5 py-4">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            {live ? "Session running" : "Total active time"}
          </div>
          <div className="text-[34px] font-black leading-none text-ink-strong max-md:text-[28px]">
            {live ? <LiveClock startedAt={live.startedAt} /> : formatDuration(r.totalActiveSeconds)}
          </div>
          {live && (
            <div className="mt-1 text-[12px] font-semibold text-ink-muted">
              Total so far: <span className="tabular-nums">{formatMinutesLabel(r.totalActiveSeconds)}</span>
            </div>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-4 py-2.5 text-[13px] font-bold text-emerald-700">
              <Lock size={15} /> Approved · locked
            </span>
          ) : canOperate ? (
            <>
              {live ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => pauseWorkAction(taskId))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {pending ? <Loader2 size={15} className="animate-spin" /> : <Pause size={15} />} Pause
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => startWorkAction(taskId))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
                >
                  {pending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {startLabel}
                </button>
              )}
              {hasWork && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => markDoneAction(taskId))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-[13px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  <CheckCircle2 size={15} /> Mark Done
                </button>
              )}
            </>
          ) : (
            <span className="text-[12.5px] font-medium text-ink-subtle">View only</span>
          )}
        </div>
      </div>

      {/* Camera (doer only, while a session is live) */}
      {isDoer && camera.enabled && (
        <div className="mt-3">
          <WorkCamera liveSessionId={live?.sessionId ?? null} intervalMin={camera.intervalMin} hasConsent={camera.hasConsent} />
        </div>
      )}

      {/* Manager verdict */}
      {canApprove && awaitingReview && (
        <div className="mt-3 rounded-2xl border border-hairline bg-white px-4 py-3.5">
          <p className="mb-2 text-[12.5px] font-bold text-ink-strong">
            Review this submission ({formatMinutesLabel(r.totalActiveSeconds)} logged)
          </p>
          {rejecting && (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              autoFocus
              placeholder="What needs fixing? (required)"
              className="mb-2 w-full rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[13px] text-ink-strong outline-none focus:border-altus-red"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => decideApprovalAction(taskId, "approved"))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <ThumbsUp size={14} /> Approve
            </button>
            {rejecting ? (
              <button
                type="button"
                disabled={pending || !comment.trim()}
                onClick={() =>
                  act(async () => {
                    const res = await decideApprovalAction(taskId, "not_approved", comment);
                    if (res.ok) {
                      setRejecting(false);
                      setComment("");
                    }
                    return res;
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-altus-red px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-altus-red-deep disabled:opacity-50"
              >
                <ThumbsDown size={14} /> Confirm send-back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-altus-red/40 px-4 py-2 text-[12.5px] font-bold text-altus-red-deep transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_6%,white)]"
              >
                <ThumbsDown size={14} /> Not Approved
              </button>
            )}
          </div>
        </div>
      )}

      {/* Analytics chips */}
      <div className="mt-4 grid grid-cols-4 gap-2 max-sm:grid-cols-2">
        <Chip label="Original" value={formatMinutesLabel(r.originalSeconds)} />
        <Chip label="Revision" value={formatMinutesLabel(r.revisionSeconds)} />
        <Chip label="Sessions" value={String(r.sessionCount)} />
        <Chip label="Rejections" value={String(r.rejectionCount)} />
        <Chip label="Avg session" value={formatMinutesLabel(r.avgSessionSec)} />
        <Chip label="Longest" value={formatMinutesLabel(r.longestSessionSec)} />
        <Chip label="Shortest" value={r.shortestSessionSec != null ? formatMinutesLabel(r.shortestSessionSec) : "—"} />
        <Chip label="Pauses" value={String(r.pauseCount)} />
      </div>

      {/* Sub-sections */}
      <div className="mt-5 grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <Sub icon={ListChecks} title="Work Sessions">
          <WorkSessions
            sessions={state.sessions}
            originalSeconds={r.originalSeconds}
            revisionSeconds={r.revisionSeconds}
            totalSeconds={r.totalActiveSeconds}
          />
        </Sub>
        <Sub icon={History} title="Activity Timeline">
          <ActivityTimeline entries={state.timeline} />
        </Sub>
        <Sub icon={GitBranch} title="Revision History">
          <RevisionHistory revisions={state.revisions} />
        </Sub>
        {isSuperAdmin && (
          <Sub icon={Camera} title="Monitoring Snapshots">
            <SnapshotGallery snapshots={snapshots} />
          </Sub>
        )}
      </div>
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</div>
      <div className="text-[15px] font-black text-ink-strong tabular-nums">{value}</div>
    </div>
  );
}

function Sub({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className="text-altus-red" />
        <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-ink-strong">{title}</h3>
      </div>
      {children}
    </div>
  );
}
