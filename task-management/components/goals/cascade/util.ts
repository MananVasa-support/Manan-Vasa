/**
 * Pure, client-safe presentation helpers for the Goals Cascade UI.
 *
 * No DB, no `server-only` — imported by client components. Period-key math is
 * re-exported from `@/lib/goals/types` so labels stay in lock-step with the
 * financial-year (Apr–Mar) buckets the server writes.
 */
import type { GoalPeriod } from "@/lib/goals/types";
import {
  fyStartYearOfKey,
  quarterOfKey,
  quarterKeyOfMonthKey,
} from "@/lib/goals/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const QUARTER_SPAN: Record<1 | 2 | 3 | 4, string> = {
  1: "Apr–Jun",
  2: "Jul–Sep",
  3: "Oct–Dec",
  4: "Jan–Mar",
};

/** Detect the period a canonical period-key encodes. */
export function periodOfKey(periodKey: string): GoalPeriod {
  if (/-Q[1-4]$/.test(periodKey)) return "quarter";
  if (/^\d{4}-\d{2}$/.test(periodKey)) return "month";
  return "year";
}

/** "FY 2026–27" from a year key / any FY start year. */
export function fyLabel(fyStartYear: number): string {
  return `FY ${fyStartYear}–${String((fyStartYear + 1) % 100).padStart(2, "0")}`;
}

/** Human label for any period key. Year → "FY 2026–27", quarter → "Q1 · Apr–Jun",
 *  month → "Jul 2026". */
export function periodKeyLabel(periodKey: string): string {
  const period = periodOfKey(periodKey);
  if (period === "year") return fyLabel(Number(periodKey));
  if (period === "quarter") {
    const q = quarterOfKey(periodKey);
    return `Q${q} · ${QUARTER_SPAN[q]}`;
  }
  const y = Number(periodKey.slice(0, 4));
  const m = Number(periodKey.slice(5, 7)) - 1;
  return `${MONTHS[m]} ${y}`;
}

/** Short label — "Q1", "Jul", "FY26". */
export function periodKeyShort(periodKey: string): string {
  const period = periodOfKey(periodKey);
  if (period === "year") return `FY${String(Number(periodKey) % 100)}`;
  if (period === "quarter") return `Q${quarterOfKey(periodKey)}`;
  return MONTHS[Number(periodKey.slice(5, 7)) - 1] ?? periodKey;
}

/** The key of a period's parent bucket (month→quarter, quarter→year), or null for year. */
export function parentPeriodKeyOf(periodKey: string): string | null {
  const period = periodOfKey(periodKey);
  if (period === "month") return quarterKeyOfMonthKey(periodKey);
  if (period === "quarter") return String(fyStartYearOfKey(periodKey));
  return null;
}

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  year: "Year",
  quarter: "Quarter",
  month: "Month",
};

/** The child level below a period ('year'→'quarter', …, 'month'→'week'). */
export function childLevelOf(period: GoalPeriod): "quarter" | "month" | "week" {
  if (period === "year") return "quarter";
  if (period === "quarter") return "month";
  return "week";
}

/** numeric(14,2) columns round-trip as strings — parse for display/math. */
export function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Compact number for a target/actual chip — "1.2k", "3.4L", "12". */
export function fmtNum(v: string | number | null | undefined): string {
  const n = typeof v === "number" ? v : num(v ?? null);
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2).replace(/\.00$/, "")}Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2).replace(/\.00$/, "")}L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n % 1 === 0 ? n : n.toFixed(2));
}

/** Effective % = manager-accepted once reviewed, else the owner's self-rating. */
export function effectiveGoalPct(g: { acceptPct: number | null; pctDone: number }): number {
  return g.acceptPct ?? g.pctDone;
}

export interface PctTone {
  /** solid accent colour */
  color: string;
  /** faint tinted background */
  bg: string;
  band: "green" | "amber" | "red";
}

/** Google-style scorecard colour: ≥70 green, 40–69 amber, <40 red. */
export function pctTone(pct: number): PctTone {
  if (pct >= 70) return { color: "#15803d", bg: "rgba(21,128,61,0.12)", band: "green" };
  if (pct >= 40) return { color: "#b45309", bg: "rgba(180,83,9,0.12)", band: "amber" };
  return { color: "#b91c1c", bg: "rgba(185,28,28,0.12)", band: "red" };
}

export const GOALS_ACCENT = "#b45309";
export const GOALS_ACCENT_DEEP = "#7c2d12";

/* ------------------------------------------------------------------ */
/* Serialisable DTOs (server → client boundary)                        */
/* ------------------------------------------------------------------ */

export interface GoalDTO {
  id: string;
  employeeId: string;
  period: GoalPeriod;
  periodKey: string;
  parentGoalId: string | null;
  position: number;
  area: string | null;
  title: string;
  uom: string | null;
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  notes: string | null;
  teamInvolved: Array<{ employeeId?: string; name?: string }> | null;
  teamDependencyPct: number | null;
  pctDone: number;
  acceptPct: number | null;
  reviewNotes: string | null;
  evidenceUrl: string | null;
  weight: number;
  adopted: boolean;
  source: string;
}

export interface GoalNodeDTO extends GoalDTO {
  children: GoalNodeDTO[];
}

export interface RosterMember {
  id: string;
  name: string;
}

/** A period bucket roll-up for the review charts (avg effective % + count). */
export interface GoalPeriodBucket {
  period: GoalPeriod;
  periodKey: string;
  avg: number;
  count: number;
}

/** Raw goal row (drizzle select, numeric as string) → lean client DTO. */
export function toGoalDTO(r: {
  id: string;
  employeeId: string;
  period: string;
  periodKey: string;
  parentGoalId: string | null;
  position: number;
  area: string | null;
  title: string;
  uom: string | null;
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  notes: string | null;
  teamInvolved: Array<{ employeeId?: string; name?: string }> | null;
  teamDependencyPct: number | null;
  pctDone: number;
  acceptPct: number | null;
  reviewNotes: string | null;
  evidenceUrl: string | null;
  weight: number;
  adopted: boolean;
  source: string;
}): GoalDTO {
  return {
    id: r.id,
    employeeId: r.employeeId,
    period: r.period as GoalPeriod,
    periodKey: r.periodKey,
    parentGoalId: r.parentGoalId,
    position: r.position,
    area: r.area,
    title: r.title,
    uom: r.uom,
    targetQty: r.targetQty,
    actualQty: r.actualQty,
    targetAmount: r.targetAmount,
    actualAmount: r.actualAmount,
    notes: r.notes,
    teamInvolved: r.teamInvolved,
    teamDependencyPct: r.teamDependencyPct,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    reviewNotes: r.reviewNotes,
    evidenceUrl: r.evidenceUrl,
    weight: r.weight,
    adopted: r.adopted,
    source: r.source,
  };
}

/** Recursive tree mapper for the year board. */
export function toNodeDTO(n: Parameters<typeof toGoalDTO>[0] & { children: unknown[] }): GoalNodeDTO {
  return {
    ...toGoalDTO(n),
    children: (n.children as (typeof n)[]).map(toNodeDTO),
  };
}
