"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Play,
  Pause,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { TaskTimeState, TimelineEntry } from "@/lib/queries/task-time";
import type { TaskInsight } from "@/lib/tasks/insight";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import {
  startWorkAction,
  pauseWorkAction,
  restartTimerAction,
} from "@/app/(app)/tasks/time-actions";
import { useElapsedSeconds } from "@/components/tasks/time/use-elapsed";

function initials(name: string): string {
  const p = (name || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const day = 86400000;
  const days = Math.floor(diff / day);
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs >= 1) return `${hrs}h ago`;
  const mins = Math.floor(diff / 60000);
  return mins <= 1 ? "just now" : `${mins}m ago`;
}

const TL: Record<TimelineEntry["kind"], { label: string; dot: string }> = {
  created: { label: "Task Created", dot: "#8b5cf6" },
  work_started: { label: "Started Work", dot: "#3b82f6" },
  work_resumed: { label: "Resumed", dot: "#3b82f6" },
  work_paused: { label: "Paused", dot: "#f59e0b" },
  timer_restarted: { label: "Timer Restarted", dot: "#f59e0b" },
  revision_started: { label: "Reopened", dot: "#3b82f6" },
  work_done: { label: "Task Done", dot: "#16a34a" },
  sent_back: { label: "Not Approved", dot: "#e10600" },
  approved: { label: "Task Approved", dot: "#16a34a" },
  auto_closed: { label: "Auto-closed", dot: "#f59e0b" },
};

function RailCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-surface-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={16} className="text-altus-red" />
        <h2 className="text-[14px] font-black text-ink-strong">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Vertical activity timeline (right rail) — coloured dots + who + relative time. */
export function TaskTimelineRail({ entries }: { entries: TimelineEntry[] }) {
  return (
    <RailCard icon={Clock} title="Task Timeline">
      <ol className="flex flex-col">
        {entries.map((e, i) => {
          const m = TL[e.kind] ?? TL.created;
          const last = i === entries.length - 1;
          return (
            <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && <span aria-hidden className="absolute left-[5px] top-4 bottom-0 w-px bg-hairline" />}
              <span className="relative z-10 mt-1 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white" style={{ background: m.dot }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-ink-strong">
                  {m.label}
                  {e.revision > 1 && (
                    <span className="ml-1.5 text-[10.5px] font-bold text-ink-subtle">· rev {e.revision}</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-surface-soft text-[8px] font-black text-ink-muted">
                    {initials(e.actorName)}
                  </span>
                  <span className="text-[11.5px] text-ink-muted">
                    {e.actorName} · {relTime(e.at)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </RailCard>
  );
}

function LiveMins({ startedAt, base }: { startedAt: string; base: number }) {
  const secs = useElapsedSeconds(startedAt);
  return <>{formatMinutesLabel(base + secs)}</>;
}

/**
 * Time Intelligence control centre — live total, session bar, Start/Stop/
 * Restart, and the most recent session stamps.
 *
 * OPTIMISTIC, and that is the point. Every control here used to run through a
 * `startTransition` that AWAITED the server action and then `router.refresh()`,
 * holding `pending` — and therefore a spinner on the button — true for the whole
 * round trip. Against a remote database that is seconds of dead UI for a click
 * whose outcome is never in doubt.
 *
 * The flip is applied locally first, so the label changes and the clock starts
 * ticking in the same frame as the click. The action fires WITHOUT being awaited
 * inside a transition; `router.refresh()` runs only once it resolves, and a
 * failure rolls the flip back and says so.
 *
 * The flip records WHAT THE SERVER SAID when it was made, so staleness is
 * derived during render rather than reconciled in an effect: once the refreshed
 * state disagrees with `basedOn`, the server value takes over on its own.
 */
export function TimeSpentCard({
  taskId,
  state,
  canOperate,
  locked,
  onViewHistory,
}: {
  taskId: string;
  state: TaskTimeState;
  canOperate: boolean;
  locked: boolean;
  onViewHistory?: () => void;
}) {
  const router = useRouter();
  const r = state.rollup;
  const live = state.live;

  const serverSince = live?.startedAt ?? null;
  const [flip, setFlip] = React.useState<
    { running: boolean; since: string; basedOn: string | null } | null
  >(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmRestart, setConfirmRestart] = React.useState(false);

  const flipCurrent = flip !== null && flip.basedOn === serverSince;
  const isRunning = flipCurrent ? flip.running : Boolean(live);
  const since = flipCurrent ? flip.since : serverSince;

  const done = state.sessions.filter((s) => !s.live && s.durationSeconds != null);
  const totalForBar = done.reduce((n, s) => n + (s.durationSeconds ?? 0), 0) || 1;
  const seg = ["#8b5cf6", "#6366f1", "#3b82f6", "#16a34a", "#f59e0b"];
  // Newest three stamped sessions. The full list lives behind View History —
  // this is a glance, not a log.
  const recent = [...done]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 3);

  function run(next: boolean, fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (busy) return;
    setFlip({ running: next, since: new Date().toISOString(), basedOn: serverSince });
    setBusy(true);
    void fn()
      .then((res) => {
        if (!res.ok) {
          setFlip(null);
          fireToast({
            // Says what happened rather than "Retrying…" — nothing retries on
            // its own, and promising a retry that never comes is worse than a
            // plain failure the user can act on.
            message: res.message ?? "Couldn't update the timer. Try again.",
            type: "error",
          });
          return;
        }
        router.refresh();
      })
      .finally(() => setBusy(false));
  }

  return (
    <RailCard
      icon={Clock}
      title="Time Spent"
      action={
        onViewHistory ? (
          <button type="button" onClick={onViewHistory} className="text-[12px] font-bold text-altus-red-deep hover:underline">
            View History
          </button>
        ) : null
      }
    >
      {/* Tabular mono so the digits don't jitter as the clock ticks — a
          proportional face reflows the whole number every second. */}
      <div className="font-mono text-2xl font-bold leading-none tabular-nums text-ink-strong">
        {isRunning && since ? (
          <LiveMins startedAt={since} base={r.totalActiveSeconds} />
        ) : (
          formatMinutesLabel(r.totalActiveSeconds)
        )}
      </div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
        {isRunning ? "Running…" : "Total active time"}
      </div>
      {/* Segmented session bar */}
      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-soft">
        {done.map((s, i) => (
          <span
            key={s.id}
            style={{ width: `${((s.durationSeconds ?? 0) / totalForBar) * 100}%`, background: seg[i % seg.length] }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px] font-semibold text-ink-subtle">
        <span>{r.sessionCount} session{r.sessionCount === 1 ? "" : "s"}</span>
        <span>Auto calculated</span>
      </div>

      {!locked && canOperate && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={() => run(false, () => pauseWorkAction(taskId))}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-amber-600"
            >
              <Pause size={14} /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => run(true, () => startWorkAction(taskId))}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-emerald-700"
            >
              <Play size={14} /> {r.sessionCount > 0 ? "Resume" : "Start Work"}
            </button>
          )}
          {(isRunning || r.sessionCount > 0) && (
            <button
              type="button"
              onClick={() => setConfirmRestart(true)}
              title="Reset this session's elapsed time to zero"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              <RotateCcw size={14} /> Restart
            </button>
          )}
        </div>
      )}

      {/* Inline confirmation, not a modal: this is a narrow rail panel, and a
          full-screen overlay for a one-session reset is a heavier interruption
          than the action deserves. */}
      {confirmRestart && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-[12.5px] font-bold text-amber-900">Reset this session to 00:00?</p>
          <p className="mt-0.5 text-[11.5px] font-medium text-amber-800">
            Completed sessions and the activity log are not affected.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmRestart(false);
                run(true, () => restartTimerAction(taskId));
              }}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-amber-600"
            >
              Restart
            </button>
            <button
              type="button"
              onClick={() => setConfirmRestart(false)}
              className="rounded-md border border-hairline bg-white px-3 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Session stamps — start, end, duration. */}
      {recent.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
            Recent sessions
          </p>
          <ul className="flex flex-col gap-1.5">
            {recent.map((sn) => (
              <li
                key={sn.id}
                className="flex items-baseline justify-between gap-2 text-[11.5px]"
              >
                <span className="min-w-0 truncate font-medium text-ink-soft">
                  {stampRange(sn.startedAt, sn.endedAt)}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-ink-strong">
                  {formatMinutesLabel(sn.durationSeconds ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </RailCard>
  );
}

/**
 * "19 Aug 2026, 04:11 PM → 05:00 PM".
 *
 * The end DATE is omitted when it matches the start date, which it almost
 * always does — repeating it doubles the line length for no information, and
 * this line has to fit a 360px rail.
 */
function stampRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const day = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  if (!endIso) return `${day(start)}, ${time(start)}`;
  const end = new Date(endIso);
  return day(start) === day(end)
    ? `${day(start)}, ${time(start)} → ${time(end)}`
    : `${day(start)}, ${time(start)} → ${day(end)}, ${time(end)}`;
}

/** "AI Insights" card — transparent heuristic, labelled AI Analysis. */
export function AIInsightsCard({ insight }: { insight: TaskInsight }) {
  const Icon = insight.tone === "good" ? CheckCircle2 : insight.tone === "warn" ? AlertTriangle : XCircle;
  const tone =
    insight.tone === "good" ? "text-emerald-600" : insight.tone === "warn" ? "text-amber-500" : "text-altus-red";
  return (
    <RailCard
      icon={Sparkles}
      title="AI Insights"
      action={
        <span className="rounded-full bg-[color-mix(in_srgb,var(--color-altus-red)_10%,white)] px-2.5 py-1 text-[10.5px] font-bold text-altus-red-deep">
          AI Analysis
        </span>
      }
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-hairline bg-surface-soft px-3.5 py-3">
        <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-ink-strong">{insight.title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{insight.body}</p>
        </div>
      </div>
    </RailCard>
  );
}
