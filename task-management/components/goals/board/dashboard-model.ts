/**
 * GOALS DASHBOARD — the shared MODEL layer (no JSX, no React).
 *
 * Lifted verbatim out of `goals-dashboard.tsx` so the Weekly dashboard
 * (`components/goals/weekly/weekly-dashboard.tsx`) can render a different
 * LAYOUT over the exact same NUMBERS. Two dashboards computing "weighted
 * attainment" or "at risk" from two copies of this arithmetic would drift the
 * first time either was touched; there is one copy, and it lives here.
 *
 * Everything is a pure client-side projection over goals the board already
 * holds — no queries, no mutation, no data model of its own. Health / pace /
 * forecast all come from the canonical engine in `lib/goals/derive.ts`
 * (`deriveHealth` · `expectedPct` · `rollupPct`), never from static cutoffs.
 */

import {
  type GoalDTO,
  effectiveGoalPct,
  targetDateStatus,
  assignmentInfo,
  isSpillover,
} from "@/components/goals/cascade/util";
import { deriveHealth, rollupPct, asNum, type DerivedHealth } from "@/lib/goals/derive";
import { GOAL_TYPE_LABELS, type GoalType } from "@/db/enums";
import type { GoalPeriod } from "@/lib/goals/types";

/* ── Semantic status hexes (mirror lib/goals/derive HEALTH_STYLE) ──────── */
export const GREEN = "#15803d"; // done / healthy
export const GREEN_BRIGHT = "#16a34a"; // ahead of pace
export const AMBER = "#b45309"; // on-track (slightly behind, within tolerance)
export const RED = "#b91c1c"; // at-risk / behind pace
export const RED_DEEP = "#7f1d1d"; // overdue (past target date)
export const ROSE = "#9f1239"; // spillover (carried + incomplete)
export const SLATE = "#475569"; // self / neutral
export const BLUE = "#1d4ed8"; // delegated / structural

export const DISPLAY = "var(--font-display), system-ui, sans-serif";

/* ── The 6 pace-derived display bands (deriveHealth + overdue overlay) ─── */
export type DisplayBand = "done" | "ahead" | "on-track" | "at-risk" | "overdue" | "spillover";

export interface BandMeta {
  label: string;
  short: string;
  color: string;
}

export const BAND_META: Record<DisplayBand, BandMeta> = {
  done: { label: "Done", short: "Done", color: GREEN },
  ahead: { label: "Ahead of pace", short: "Ahead", color: GREEN_BRIGHT },
  "on-track": { label: "On track", short: "On track", color: AMBER },
  "at-risk": { label: "At risk", short: "At risk", color: RED },
  overdue: { label: "Overdue", short: "Overdue", color: RED_DEEP },
  spillover: { label: "Spillover", short: "Spillover", color: ROSE },
};

/** Distribution / legend order: best → worst. */
export const BAND_ORDER: DisplayBand[] = [
  "done",
  "ahead",
  "on-track",
  "at-risk",
  "overdue",
  "spillover",
];

/* ── One analysed goal row ─────────────────────────────────────────────── */
export interface Row {
  g: GoalDTO;
  eff: number;
  h: DerivedHealth;
  band: DisplayBand;
  /** whole days past its target date (overdue only), else 0. */
  daysLate: number;
  /** direct cascade children + week cards under this goal. */
  childCount: number;
}

export function classify(g: GoalDTO, now: Date, childCount: number): Row {
  const eff = Math.round(effectiveGoalPct(g));
  const spill = isSpillover(g);
  const h = deriveHealth(eff, g.periodKey, now, { spillover: spill });
  const tds = g.targetDate ? targetDateStatus(g.targetDate) : null;
  const overdue = !!tds && (tds.daysLeft ?? 0) < 0 && eff < 100;
  const daysLate = overdue && tds ? Math.abs(tds.daysLeft ?? 0) : 0;
  let band: DisplayBand;
  if (h.band === "done") band = "done";
  else if (h.band === "spillover") band = "spillover";
  else if (overdue) band = "overdue";
  else band = h.band as DisplayBand; // ahead | on-track | at-risk
  return { g, eff, h, band, daysLate, childCount };
}

/** goalType code → human pillar label (base codes map; custom passes through). */
export function pillarOf(g: GoalDTO): string | null {
  const gt = g.goalType?.trim();
  if (!gt) return null;
  return GOAL_TYPE_LABELS[gt as GoalType] ?? gt;
}

/* ====================================================================== */
/* Model                                                                  */
/* ====================================================================== */

export interface Group {
  label: string;
  count: number;
  pct: number;
}

export interface Model {
  total: number;
  weighted: number;
  avgExpected: number;
  avgConfidence: number;
  paceDelta: number;
  counts: Record<DisplayBand, number>;
  onPace: number;
  atRisk: number;
  overdue: number;
  done: number;
  needsAttention: number;
  rupee: { target: number; actual: number } | null;
  qty: { target: number; actual: number } | null;
  coverage: { withChildren: number; orphans: Row[]; pct: number } | null;
  byPillar: Group[];
  byArea: Group[];
  accountability: {
    self: number;
    assigned: number;
    delegated: number;
    delegatedWeight: number;
    reviewed: number;
    selfOnly: number;
    avgDep: number;
    maxDep: number;
    depCount: number;
  };
  atRiskRows: Row[];
}

export function buildModel(rows: Row[], level: GoalPeriod): Model {
  const total = rows.length;
  const goals = rows.map((r) => r.g);
  const weighted = rollupPct(goals) ?? 0;
  const avgExpected = total ? Math.round(rows.reduce((s, r) => s + r.h.expected, 0) / total) : 0;
  const avgConfidence = total ? Math.round(rows.reduce((s, r) => s + r.h.confidence, 0) / total) : 0;

  const counts: Record<DisplayBand, number> = {
    done: 0,
    ahead: 0,
    "on-track": 0,
    "at-risk": 0,
    overdue: 0,
    spillover: 0,
  };
  for (const r of rows) counts[r.band] += 1;
  const onPace = counts.ahead + counts["on-track"];
  const atRisk = counts["at-risk"] + counts.spillover;
  const overdue = counts.overdue;
  const done = counts.done;
  const needsAttention = counts["at-risk"] + counts.spillover + counts.overdue;

  // ₹ + quantity — Σ over this level's own goals (siblings, no double count).
  let rt = 0,
    ra = 0,
    hasR = false;
  let qt = 0,
    qa = 0,
    hasQ = false;
  for (const r of rows) {
    const t = asNum(r.g.targetAmount);
    if (t != null && t > 0) {
      hasR = true;
      rt += t;
      ra += asNum(r.g.actualAmount) ?? 0;
    }
    const tq = asNum(r.g.targetQty);
    if (tq != null && tq > 0) {
      hasQ = true;
      qt += tq;
      qa += asNum(r.g.actualQty) ?? 0;
    }
  }

  // Cascade coverage — only levels that HAVE a child level (not week).
  const coverage =
    level === "week"
      ? null
      : (() => {
          const withChildren = rows.filter((r) => r.childCount > 0).length;
          const orphans = rows
            .filter((r) => r.childCount === 0)
            .sort((a, b) => (b.g.weight || 0) - (a.g.weight || 0));
          return { withChildren, orphans, pct: total ? Math.round((withChildren / total) * 100) : 0 };
        })();

  // By pillar (goalType) + by area — weighted attainment per group.
  const groupBy = (key: (r: Row) => string): Group[] => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return [...m.entries()]
      .map(([label, rs]) => ({
        label,
        count: rs.length,
        pct: rollupPct(rs.map((x) => x.g)) ?? 0,
      }))
      .sort((a, b) => b.count - a.count || b.pct - a.pct);
  };
  const byPillar = groupBy((r) => pillarOf(r.g) ?? "Unspecified");
  const byArea = groupBy((r) => (r.g.area?.trim() ? r.g.area.trim() : "Unassigned"));

  // Accountability / delegation.
  let self = 0,
    assigned = 0,
    delegated = 0,
    delegatedWeight = 0,
    reviewed = 0,
    depSum = 0,
    depCount = 0,
    depMax = 0;
  for (const r of rows) {
    if (assignmentInfo(r.g).type === "assigned") assigned += 1;
    else self += 1;
    const dels = r.g.delegatedTo ?? [];
    if (dels.length > 0) {
      delegated += 1;
      delegatedWeight += r.g.weight > 0 ? r.g.weight : 0;
    }
    if (r.g.acceptPct != null) reviewed += 1;
    const dep = r.g.teamDependencyPct;
    if (dep != null && dep > 0) {
      depSum += dep;
      depCount += 1;
      depMax = Math.max(depMax, dep);
    }
  }

  const atRiskRows = rows
    .filter((r) => r.band === "at-risk" || r.band === "overdue" || r.band === "spillover")
    .sort((a, b) => b.daysLate - a.daysLate || a.h.delta - b.h.delta);

  return {
    total,
    weighted,
    avgExpected,
    avgConfidence,
    paceDelta: weighted - avgExpected,
    counts,
    onPace,
    atRisk,
    overdue,
    done,
    needsAttention,
    rupee: hasR ? { target: rt, actual: ra } : null,
    qty: hasQ ? { target: qt, actual: qa } : null,
    coverage,
    byPillar,
    byArea,
    accountability: {
      self,
      assigned,
      delegated,
      delegatedWeight,
      reviewed,
      selfOnly: total - reviewed,
      avgDep: depCount ? Math.round(depSum / depCount) : 0,
      maxDep: depMax,
      depCount,
    },
    atRiskRows,
  };
}
