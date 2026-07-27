"use client";

import * as React from "react";
import {
  UserRound,
  Building2,
  Sparkles,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ArrowLeftRight,
  FileText,
} from "lucide-react";
import {
  RATING_SECTIONS,
  RECOMMENDATIONS,
  type EvaluationInstance,
} from "@/lib/hr/candidate/evaluation-v2";
import {
  overallScore,
  allSectionScores,
  eligibilityVerdict,
  type SectionScore,
  type WeightProfile,
} from "@/lib/hr/candidate/evaluation-v2-scoring";

/**
 * EVALUATION v2 REPORT — the side-by-side Interviewer × Management comparison.
 *
 * Each role gets a column with: the weighted overall as a dial, every rating
 * section's weighted "X / Y" as a labeled bar, the X-Factor and Overall
 * Interviewer number shown SEPARATELY (never blended into the weighted score),
 * the eligibility verdict (all-clear vs deal-breaker), and the recommendation
 * chip. Where the two roles' section micro-averages diverge by ≥ 2 points, that
 * row is flagged in both columns so disagreements jump out.
 *
 * Load-neutral (CSS-string styling, no motion library) and print-friendly.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";

const DELTA_THRESHOLD = 2;

type Tone = { ring: string; fg: string; soft: string };

function toneFor(value: number | null): Tone {
  if (value === null) return { ring: "var(--color-hairline)", fg: "var(--color-ink-subtle)", soft: "var(--color-surface-soft)" };
  if (value >= 7) return { ring: "#16a34a", fg: "#15803d", soft: "color-mix(in srgb, #16a34a 12%, white)" };
  if (value >= 4) return { ring: "#f59e0b", fg: "#b45309", soft: "color-mix(in srgb, #f59e0b 16%, white)" };
  return { ring: RED, fg: RED_DEEP, soft: "color-mix(in srgb, var(--color-altus-red) 12%, white)" };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function EvaluationV2Report({
  interviewer,
  management,
  profile,
}: {
  interviewer: EvaluationInstance | null;
  management: EvaluationInstance | null;
  profile: Record<string, number>;
}) {
  const prof = profile as WeightProfile;

  const iScores = interviewer ? allSectionScores(interviewer, prof) : null;
  const mScores = management ? allSectionScores(management, prof) : null;

  // Sections where the two roles' 0–10 micro-averages diverge by ≥ threshold.
  const deltaBySection = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!iScores || !mScores) return map;
    for (let i = 0; i < iScores.length; i++) {
      const a = iScores[i];
      const b = mScores[i];
      if (!a || !b) continue;
      if (a.micro !== null && b.micro !== null) {
        const d = Math.abs(a.micro - b.micro);
        if (d >= DELTA_THRESHOLD) map.set(a.sectionId, d);
      }
    }
    return map;
  }, [iScores, mScores]);

  const bothFilled = Boolean(interviewer) && Boolean(management);

  return (
    <div className="ev2-report">
      <style>{CSS}</style>

      {/* Legend header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
          <FileText size={14} style={{ color: RED }} /> Interviewer × Management
        </span>
        {bothFilled && (
          <span className="ev2-noprint inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RED }} />
            Rows flagged where the two differ by ≥ {DELTA_THRESHOLD} points
          </span>
        )}
      </div>

      {/* Two columns — stack on mobile */}
      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <RoleColumn
          role="interviewer"
          instance={interviewer}
          scores={iScores}
          deltaBySection={deltaBySection}
        />
        <RoleColumn
          role="management"
          instance={management}
          scores={mScores}
          deltaBySection={deltaBySection}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Role column                                                         */
/* ------------------------------------------------------------------ */

const ROLE_META = {
  interviewer: { label: "Interviewer", sub: "Candidate Evaluation Checklist", icon: UserRound },
  management: { label: "Management", sub: "Management Assessment", icon: Building2 },
} as const;

function RoleColumn({
  role,
  instance,
  scores,
  deltaBySection,
}: {
  role: "interviewer" | "management";
  instance: EvaluationInstance | null;
  scores: SectionScore[] | null;
  deltaBySection: Map<string, number>;
}) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;

  return (
    <section className="ev2-col flex flex-col overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      {/* Column header */}
      <header
        className="flex items-center gap-2.5 border-b border-hairline px-5 py-3.5"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 4%, white)" }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <h3
            className="text-[16px] font-black leading-tight text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}
          >
            {meta.label}
          </h3>
          <p className="truncate text-[12px] font-medium text-ink-muted">{meta.sub}</p>
        </div>
      </header>

      {!instance || !scores ? (
        <NotFilled />
      ) : (
        <div className="flex flex-1 flex-col gap-5 p-5">
          {/* Overall dial + recommendation */}
          <div className="flex flex-wrap items-center gap-5">
            <OverallDial instance={instance} />
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Recommendation</p>
              <RecommendationChip value={instance.recommendation} />
              <div className="mt-3">
                <EligibilityBadge instance={instance} />
              </div>
            </div>
          </div>

          {/* X-Factor + Overall Interviewer — reported separately */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={<Sparkles size={14} />}
              label="X-Factor"
              value={instance.xFactor}
              hint="Bonus — outside the weighted score"
            />
            <StatTile
              icon={<Gauge size={14} />}
              label="Overall (gut)"
              value={instance.overall}
              hint="Manual — not blended in"
            />
          </div>

          {/* Section bars */}
          <div>
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Section breakdown</p>
            <div className="flex flex-col gap-2.5">
              {scores.map((s) => (
                <SectionBar key={s.sectionId} score={s} delta={deltaBySection.get(s.sectionId)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Overall dial                                                        */
/* ------------------------------------------------------------------ */

function OverallDial({ instance }: { instance: EvaluationInstance }) {
  const overall = overallScore(instance);
  const value = overall.avg;
  const tone = toneFor(value);

  const R = 48;
  const C = 2 * Math.PI * R;
  const frac = value === null ? 0 : Math.max(0, Math.min(1, value / 10));
  const dash = C * frac;

  return (
    <div className="flex shrink-0 items-center gap-3.5">
      <div className="relative grid place-items-center" style={{ width: 120, height: 120 }}>
        <svg width={120} height={120} viewBox="0 0 120 120">
          <circle cx={60} cy={60} r={R} fill="none" stroke="var(--color-hairline)" strokeWidth={10} />
          <circle
            cx={60}
            cy={60}
            r={R}
            fill="none"
            stroke={tone.ring}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C - dash}`}
            transform="rotate(-90 60 60)"
            style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute grid place-items-center text-center">
          <span
            className="text-[27px] font-black leading-none tabular-nums text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
          >
            {value === null ? "—" : fmt(value)}
            <span className="text-[14px] font-bold text-ink-subtle">/10</span>
          </span>
          <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Weighted</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tone.fg }}>
          {value === null ? "Not scored" : `${overall.pct}%`}
        </p>
        <p className="mt-0.5 text-[12px] font-medium leading-snug text-ink-muted">
          {overall.ratedSections} / {overall.applicableSections} sections rated
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section bar                                                         */
/* ------------------------------------------------------------------ */

function SectionBar({ score, delta }: { score: SectionScore; delta: number | undefined }) {
  const flagged = delta !== undefined;

  if (!score.applicable) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-hairline-strong bg-surface-soft px-3 py-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white text-[10px] font-black text-ink-subtle">
          {score.code}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-muted">{score.title}</span>
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Skipped</span>
      </div>
    );
  }

  const rated = score.micro !== null;
  const tone = toneFor(score.micro);
  const frac = score.micro === null ? 0 : Math.max(0, Math.min(1, score.micro / 10));

  return (
    <div
      className="rounded-lg px-3 py-2"
      style={
        flagged
          ? { borderLeft: `3px solid ${RED}`, background: "color-mix(in srgb, var(--color-altus-red) 5%, white)", paddingLeft: 10 }
          : undefined
      }
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-black text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          {score.code}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-strong">{score.title}</span>
        {flagged && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[10px] font-black tabular-nums"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 14%, white)", color: RED_DEEP }}
            title={`The two roles differ by ${fmt(delta!)} points on this section`}
          >
            <ArrowLeftRight size={10} strokeWidth={2.6} /> {fmt(delta!)}
          </span>
        )}
        <span className="shrink-0 text-[12px] font-black tabular-nums" style={{ color: rated ? tone.fg : "var(--color-ink-subtle)" }}>
          {score.x} <span className="text-[11px] font-bold text-ink-subtle">/ {score.weight}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${frac * 100}%`,
              background: rated ? `linear-gradient(90deg, ${tone.ring}, ${tone.fg})` : "transparent",
              transition: "width 0.5s cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </div>
        <span className="w-[38px] shrink-0 text-right text-[11px] font-bold tabular-nums" style={{ color: rated ? tone.fg : "var(--color-ink-subtle)" }}>
          {rated ? fmt(score.micro!) : "—"}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile (X-Factor / Overall)                                      */
/* ------------------------------------------------------------------ */

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  hint: string;
}) {
  const tone = toneFor(value);
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
        <span style={{ color: RED }}>{icon}</span> {label}
      </div>
      <p className="mt-1.5 text-[22px] font-black leading-none tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", color: value === null ? "var(--color-ink-subtle)" : tone.fg }}>
        {value === null ? "—" : fmt(value)}
        <span className="text-[13px] font-bold text-ink-subtle">/10</span>
      </p>
      <p className="mt-1 text-[11px] font-medium leading-snug text-ink-subtle">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recommendation chip                                                 */
/* ------------------------------------------------------------------ */

function RecommendationChip({ value }: { value: EvaluationInstance["recommendation"] }) {
  if (!value) {
    return (
      <span className="inline-flex items-center rounded-pill border border-dashed border-hairline-strong px-3 py-1.5 text-[13px] font-semibold text-ink-subtle">
        No recommendation yet
      </span>
    );
  }
  const rec = RECOMMENDATIONS.find((r) => r.value === value);
  const tone = rec?.tone ?? "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13.5px] font-bold"
      style={{ background: `color-mix(in srgb, ${tone} 14%, white)`, color: tone }}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone }} />
      {rec?.label ?? value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Eligibility badge                                                   */
/* ------------------------------------------------------------------ */

function EligibilityBadge({ instance }: { instance: EvaluationInstance }) {
  const v = eligibilityVerdict(instance);

  let bg: string;
  let fg: string;
  let icon: React.ReactNode;
  let text: string;

  if (v.answered === 0) {
    bg = "var(--color-surface-soft)";
    fg = "var(--color-ink-subtle)";
    icon = <ShieldQuestion size={14} />;
    text = "Eligibility not screened";
  } else if (v.dealbreaker) {
    bg = "color-mix(in srgb, var(--color-altus-red) 12%, white)";
    fg = RED_DEEP;
    icon = <ShieldAlert size={14} />;
    text = `Deal-breaker · ${v.noItems.length} failed`;
  } else if (v.noItems.length > 0) {
    bg = "color-mix(in srgb, #f59e0b 16%, white)";
    fg = "#b45309";
    icon = <ShieldAlert size={14} />;
    text = `${v.noItems.length} flagged · exception noted`;
  } else {
    bg = "color-mix(in srgb, #16a34a 12%, white)";
    fg = "#15803d";
    icon = <ShieldCheck size={14} />;
    text = "Eligibility all-clear";
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold" style={{ background: bg, color: fg }}>
      {icon} {text}
      <span className="font-semibold opacity-70">
        · {v.answered}/{v.total}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Not-filled placeholder                                              */
/* ------------------------------------------------------------------ */

function NotFilled() {
  return (
    <div className="grid flex-1 place-items-center px-6 py-16 text-center">
      <span
        className="grid h-13 w-13 place-items-center rounded-2xl"
        style={{ height: 52, width: 52, background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
      >
        <FileText size={24} strokeWidth={1.9} />
      </span>
      <p className="mt-3 text-[14.5px] font-bold text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
        Not filled yet
      </p>
      <p className="mt-1 max-w-[34ch] text-[12.5px] font-medium text-ink-muted">
        This assessment hasn&apos;t been completed. Once it&apos;s saved, the scores appear here for comparison.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Print + layout CSS                                                  */
/* ------------------------------------------------------------------ */

const CSS = `
  .ev2-report .ev2-col { break-inside: avoid; }
  @media print {
    .ev2-report .ev2-noprint { display: none !important; }
    .ev2-report { color: #000; }
    .ev2-report .grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
    .ev2-report .ev2-col { box-shadow: none !important; border-color: #d4d4d8 !important; }
    .ev2-report svg circle { transition: none !important; }
    .ev2-report * { transition: none !important; }
  }
`;
