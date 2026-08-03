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
  Loader2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { TaskTimeState, TimelineEntry } from "@/lib/queries/task-time";
import type { TaskInsight } from "@/lib/tasks/insight";
import { formatMinutesLabel } from "@/lib/tasks/time/types";
import { startWorkAction, pauseWorkAction } from "@/app/(app)/tasks/time-actions";
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

/** "Time Spent" card — total (live), segmented session bar, session count, and
 *  compact Start/Pause controls (the essential timer, kept subtle). */
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
  const [pending, start] = React.useTransition();
  const r = state.rollup;
  const live = state.live;
  const done = state.sessions.filter((s) => !s.live && s.durationSeconds != null);
  const totalForBar = done.reduce((n, s) => n + (s.durationSeconds ?? 0), 0) || 1;
  const seg = ["#8b5cf6", "#6366f1", "#3b82f6", "#16a34a", "#f59e0b"];

  function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) fireToast({ message: res.message ?? "Couldn't do that.", type: "error" });
      router.refresh();
    });
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
      <div className="text-[30px] font-black leading-none text-ink-strong">
        {live ? <LiveMins startedAt={live.startedAt} base={r.totalActiveSeconds} /> : formatMinutesLabel(r.totalActiveSeconds)}
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
        <div className="mt-4 flex gap-2">
          {live ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => pauseWorkAction(taskId))}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />} Pause
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => startWorkAction(taskId))}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#18181b] px-3 py-2 text-[12.5px] font-bold text-white hover:bg-black disabled:opacity-50"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {r.sessionCount > 0 ? "Resume" : "Start Work"}
            </button>
          )}
        </div>
      )}
    </RailCard>
  );
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
