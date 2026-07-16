"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, ExternalLink, Check } from "lucide-react";
import { HBars, type HBarRow } from "@/components/charts/h-bars";
import { fireToast } from "@/lib/toast";
import { setGoalPctDone } from "@/app/(app)/goals/cascade/actions";
import { reviewGoal, uploadGoalEvidence } from "@/app/(app)/goals/review/actions";
import { TeamAvatars } from "./team-picker";
import {
  effectiveGoalPct,
  pctTone,
  periodKeyLabel,
  PERIOD_LABEL,
  fmtNum,
  GOALS_ACCENT,
  GOALS_ACCENT_DEEP,
  type GoalDTO,
  type GoalPeriodBucket,
  type RosterMember,
} from "./util";
import type { GoalPeriod } from "@/lib/goals/types";

interface Headline {
  weekScore: number;
  ytdWeeklyAvg: number;
  weeklyGoalCount: number;
  cascadeGoalCount: number;
}

function Stat({ label, value, tone, index = 0 }: { label: string; value: string; tone?: string; index?: number }) {
  return (
    <div
      className="relative isolate overflow-hidden rounded-section border border-hairline bg-surface-card p-4"
      style={
        {
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(15,23,42,0.04)",
          "--kpi-tone": "color-mix(in srgb, #b45309 62%, transparent)",
          "--kpi-tone-deep": "color-mix(in srgb, #7c2d12 48%, transparent)",
          "--kpi-index": index,
        } as React.CSSProperties
      }
    >
      <span aria-hidden className="kpi-aurora-primary" />
      <span aria-hidden className="kpi-aurora-secondary" />
      <div className="relative">
        <p className="text-[11px] font-black uppercase tracking-[0.09em] text-ink-muted">{label}</p>
        <p
          className="mt-1 text-[28px] font-black tabular-nums"
          style={{ color: tone ?? "var(--color-ink-strong)", fontFamily: "var(--font-display), system-ui, sans-serif" }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ReviewRow({
  goal,
  roster,
  canSelfRate,
  canReview,
  evidenceHref,
}: {
  goal: GoalDTO;
  roster: RosterMember[];
  canSelfRate: boolean;
  canReview: boolean;
  evidenceHref?: string;
}) {
  const router = useRouter();
  const [self, setSelf] = React.useState(String(goal.pctDone));
  const [accept, setAccept] = React.useState(goal.acceptPct == null ? "" : String(goal.acceptPct));
  const [notes, setNotes] = React.useState(goal.reviewNotes ?? "");
  const [evOpen, setEvOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setSelf(String(goal.pctDone)), [goal.pctDone]);
  React.useEffect(() => setAccept(goal.acceptPct == null ? "" : String(goal.acceptPct)), [goal.acceptPct]);

  const eff = effectiveGoalPct(goal);
  const tone = pctTone(eff);

  function commitSelf() {
    const n = Math.max(0, Math.min(100, Number(self) || 0));
    if (n === goal.pctDone) return;
    start(async () => {
      const res = await setGoalPctDone({ id: goal.id, pctDone: n });
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      router.refresh();
    });
  }

  function commitReview() {
    const raw = accept.trim();
    const val = raw === "" ? null : Math.max(0, Math.min(100, Number(raw) || 0));
    start(async () => {
      const res = await reviewGoal({ id: goal.id, acceptPct: val, reviewNotes: notes.trim() || null });
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({ message: "Review saved", type: "success" });
      router.refresh();
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.set("goalId", goal.id);
    fd.set("file", file);
    start(async () => {
      const res = await uploadGoalEvidence(fd);
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({ message: "Evidence attached", type: "success" });
      setEvOpen(false);
      router.refresh();
    });
  }

  function submitLink(link: string) {
    if (!link.trim()) return;
    const fd = new FormData();
    fd.set("goalId", goal.id);
    fd.set("link", link.trim());
    start(async () => {
      const res = await uploadGoalEvidence(fd);
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({ message: "Evidence linked", type: "success" });
      setEvOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full" style={{ background: tone.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {goal.area && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold text-ink-soft"
                style={{ background: "color-mix(in srgb, #b45309 8%, transparent)" }}
              >
                {goal.area}
              </span>
            )}
            <span className="text-[15px] font-bold text-ink-strong">{goal.title}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
            <span className="font-semibold">Tgt {fmtNum(goal.targetQty)}</span>
            <span className="font-semibold">Act {fmtNum(goal.actualQty)}</span>
            <TeamAvatars team={goal.teamInvolved} roster={roster} max={3} />
          </div>
        </div>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[15px] font-black tabular-nums"
          style={{
            background: tone.bg,
            color: tone.color,
            fontFamily: "var(--font-display), system-ui, sans-serif",
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone.color} 24%, transparent)`,
          }}
        >
          {eff}%
        </span>
      </div>

      <div className="mt-3 grid gap-3 border-t border-hairline pt-3 sm:grid-cols-2">
        {/* Self */}
        <div>
          <label className="text-[11px] font-black uppercase tracking-[0.06em] text-ink-muted">Self %</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={self}
              onChange={(e) => setSelf(e.target.value)}
              onBlur={commitSelf}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              disabled={!canSelfRate || pending}
              inputMode="numeric"
              className="w-16 rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-right text-[14px] font-bold text-ink-strong outline-none focus:border-hairline-strong disabled:opacity-60"
            />
            <span className="text-[13px] font-bold text-ink-muted">/ 100</span>
          </div>
        </div>

        {/* Manager accept */}
        <div>
          <label className="text-[11px] font-black uppercase tracking-[0.06em] text-ink-muted">Manager accept %</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={accept}
              onChange={(e) => setAccept(e.target.value)}
              disabled={!canReview || pending}
              inputMode="numeric"
              placeholder={canReview ? "—" : "n/a"}
              className="w-16 rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-right text-[14px] font-bold text-ink-strong outline-none focus:border-hairline-strong disabled:opacity-60"
            />
            {canReview && (
              <button
                type="button"
                onClick={commitReview}
                disabled={pending}
                className="wg-btn wg-sheen inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})` }}
              >
                {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
                Save
              </button>
            )}
          </div>
        </div>
      </div>

      {canReview && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitReview}
          rows={1}
          placeholder="Review notes…"
          className="mt-2 w-full resize-none rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[13px] text-ink-strong outline-none focus:border-hairline-strong"
        />
      )}
      {!canReview && goal.reviewNotes && (
        <p className="mt-2 rounded-lg bg-black/[0.03] px-3 py-2 text-[13px] italic text-ink-soft">
          {goal.reviewNotes}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        {evidenceHref ? (
          <a
            href={evidenceHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
          >
            <ExternalLink size={12} /> View evidence
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => setEvOpen((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
        >
          <Paperclip size={12} /> {evidenceHref ? "Replace" : "Attach"} evidence
        </button>
      </div>

      {evOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-black/[0.015] p-2.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="rounded-full border border-hairline bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong hover:brightness-95 disabled:opacity-60"
          >
            Upload file
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
          <span className="text-[12px] font-semibold text-ink-muted">or</span>
          <input
            placeholder="Paste a link + Enter"
            onKeyDown={(e) => {
              if (e.key === "Enter") submitLink((e.target as HTMLInputElement).value);
            }}
            className="min-w-[180px] flex-1 rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[13px] outline-none focus:border-hairline-strong"
          />
        </div>
      )}
    </div>
  );
}

export function ReviewBoard({
  goals,
  roster,
  headline,
  buckets,
  canSelfRate,
  canReview,
  evidenceHrefs,
}: {
  goals: GoalDTO[];
  roster: RosterMember[];
  headline: Headline;
  buckets: GoalPeriodBucket[];
  canSelfRate: boolean;
  canReview: boolean;
  evidenceHrefs: Record<string, string>;
}) {
  const [filter, setFilter] = React.useState<GoalPeriod | "all">("all");

  const chartRows: HBarRow[] = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({ label: periodKeyLabel(b.periodKey), value: b.avg, color: pctTone(b.avg).color }));

  const shown = filter === "all" ? goals : goals.filter((g) => g.period === filter);

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="This week" value={`${headline.weekScore}%`} tone={pctTone(headline.weekScore).color} index={0} />
        <Stat label="Weekly YTD avg" value={`${headline.ytdWeeklyAvg}%`} tone={pctTone(headline.ytdWeeklyAvg).color} index={1} />
        <Stat label="Cascade goals" value={String(headline.cascadeGoalCount)} index={2} />
        <Stat label="Weekly goals" value={String(headline.weeklyGoalCount)} index={3} />
      </div>

      {/* Roll-up chart */}
      {chartRows.length > 0 && (
        <div className="rounded-2xl border border-hairline bg-surface-card p-5">
          <h2 className="mb-3 text-[13px] font-black uppercase tracking-[0.07em] text-ink-muted">
            Effective % by period
          </h2>
          <HBars data={chartRows} height={Math.max(140, chartRows.length * 40)} />
        </div>
      )}

      {/* Level filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "year", "quarter", "month"] as const).map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => setFilter(lvl)}
            className={`wg-btn rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
              filter === lvl
                ? "text-white"
                : "border border-hairline bg-surface-card text-ink-soft hover:text-ink-strong"
            }`}
            style={filter === lvl ? { background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})` } : undefined}
          >
            {lvl === "all" ? "All levels" : PERIOD_LABEL[lvl]}
          </button>
        ))}
      </div>

      {/* Rows */}
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-strong bg-surface-card p-8 text-center text-[14px] font-semibold text-ink-muted">
          No goals to review at this level.
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((g, i) => (
            <div key={g.id} className="wg-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <ReviewRow
                goal={g}
                roster={roster}
                canSelfRate={canSelfRate}
                canReview={canReview}
                evidenceHref={evidenceHrefs[g.id]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
