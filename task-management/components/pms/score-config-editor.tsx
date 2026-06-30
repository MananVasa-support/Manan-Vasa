"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveScoreConfig } from "@/app/(app)/pms/actions";
import type { PmsScoreConfig } from "@/lib/pms/engines/config";
import { MODULE_THEME } from "@/lib/module-theme";

const ACCENT = MODULE_THEME.employees.accent;
const ACCENT_DEEP = MODULE_THEME.employees.accentDeep;

const WEIGHTS: [keyof PmsScoreConfig["weights"], string][] = [
  ["kpi", "KPI (weekly + incentive)"], ["skillUpgrade", "Skill upgrade (training)"],
  ["compliance", "Compliance (DCC + checklist)"], ["attitude", "Attitude & mindset"],
  ["teamwork", "Team work (peers)"],
];
const THRESHOLDS: [keyof PmsScoreConfig["thresholds"], string, string][] = [
  ["promotionScore", "Promotion score", "Score ≥ this flags a promotion review"],
  ["recognitionScore", "Recognition score", "Score ≥ this suggests recognition"],
  ["minTenureDays", "Min tenure (days)", "Days employed before promotion-eligible"],
  ["trainGiveHoursPerMonth", "Give hrs / mo", "Hours managers must train others"],
  ["trainAttendHoursPerMonth", "Attend hrs / mo", "Hours everyone must attend training"],
  ["selfLearnHoursPerMonth", "Self-learn hrs / mo", "Hours of self-learning required"],
  ["shareMinPerWeek", "Share mins / wk", "Weekly Share minutes (compulsory)"],
  ["assessmentPassPct", "Assessment pass %", "Below this = fail → redo (waivable)"],
  ["noScheduleAlertDays", "No-schedule alert (days)", "Alert if no training scheduled in N days"],
  ["noAttendPromptDays", "No-attend prompt (days)", "Prompt to pick a training after N days"],
  ["maxSessionMinutes", "Max session (mins)", "No single session longer than this"],
  ["lateGraceDays", "Late grace (days)", "Allowed late arrivals before it counts"],
  ["onTimeRateFloor", "On-time floor (0–1)", "Min punctual share for full credit"],
];
const FORMULA: [keyof PmsScoreConfig["formula"], string][] = [
  ["kpiWeeklyWeight", "KPI · weekly goals"], ["kpiIncentiveWeight", "KPI · incentive"],
  ["skillAttendWeight", "Skill · attended"], ["skillGiveWeight", "Skill · given"],
  ["skillSelfLearnWeight", "Skill · self-learn"], ["skillShareWeight", "Skill · share"],
  ["compDccWeight", "Compliance · DCC"], ["compChecklistWeight", "Compliance · checklist"],
  ["ratingFloor", "Rating floor (1–5)"], ["ratingCeil", "Rating ceiling (1–5)"],
];

export function ScoreConfigEditor({ initial }: { initial: PmsScoreConfig }) {
  const router = useRouter();
  const [weights, setWeights] = React.useState(initial.weights);
  const [thresholds, setThresholds] = React.useState(initial.thresholds);
  const [formula, setFormula] = React.useState(initial.formula);
  const [pending, start] = React.useTransition();

  const weightTotal = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);

  function save() {
    start(async () => {
      const res = await saveScoreConfig({ weights, thresholds, formula });
      if (!res.ok) { fireToast({ message: res.error }); return; }
      fireToast({ message: "Scoring policy saved — applies on the next score.", type: "success" });
      router.refresh();
    });
  }

  const numInput =
    "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[15px] text-ink-strong outline-none focus:border-2 tabular-nums";

  return (
    <div className="space-y-7">
      {/* Weights */}
      <section className="rounded-2xl border border-hairline bg-surface-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-ink-strong">Pillar weights</h2>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: weightTotal > 0 ? ACCENT_DEEP : "var(--color-ink-subtle)" }}>
            total {weightTotal} · relative (normalised)
          </span>
        </div>
        <p className="mt-1 text-[13.5px] text-ink-muted">How much each pillar counts toward the score. Relative — a pillar with no data is excluded, not zeroed.</p>
        <div className="mt-4 grid grid-cols-3 gap-4 max-md:grid-cols-2">
          {WEIGHTS.map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</span>
              <input type="number" min={0} step={1} value={String(weights[k])}
                onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
                className={numInput} style={{ borderColor: undefined }} />
            </label>
          ))}
        </div>
      </section>

      {/* Thresholds */}
      <section className="rounded-2xl border border-hairline bg-surface-card p-5">
        <h2 className="text-[17px] font-bold text-ink-strong">Thresholds</h2>
        <p className="mt-1 text-[13.5px] text-ink-muted">The gates for the human-released promotion + recognition signals. Nothing is auto-actioned.</p>
        <div className="mt-4 grid grid-cols-3 gap-4 max-md:grid-cols-2">
          {THRESHOLDS.map(([k, label, hint]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</span>
              <input type="number" step="any" value={String(thresholds[k])}
                onChange={(e) => setThresholds((t) => ({ ...t, [k]: Number(e.target.value) }))}
                className={numInput} />
              <span className="mt-1 block text-[11.5px] text-ink-subtle">{hint}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Formula coefficients */}
      <section className="rounded-2xl border border-hairline bg-surface-card p-5">
        <h2 className="text-[17px] font-bold text-ink-strong">Pillar curves</h2>
        <p className="mt-1 text-[13.5px] text-ink-muted">A multiplier on each pillar&apos;s raw rate (1.0 = as-is). Tune how steep each pillar rewards.</p>
        <div className="mt-4 grid grid-cols-3 gap-4 max-md:grid-cols-2">
          {FORMULA.map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</span>
              <input type="number" step="0.1" value={String(formula[k])}
                onChange={(e) => setFormula((f) => ({ ...f, [k]: Number(e.target.value) }))}
                className={numInput} />
            </label>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-2 rounded-pill px-6 py-3 text-[15px] font-bold text-white shadow-sm transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
          <Save size={17} strokeWidth={2.4} /> {pending ? "Saving…" : "Save scoring policy"}
        </button>
      </div>
    </div>
  );
}
