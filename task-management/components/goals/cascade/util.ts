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
import { effective } from "@/lib/goals/derive";

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

/** Effective % = manager-accepted once reviewed, else the owner's self-rating.
 *  Delegates to the ONE canonical derive layer (lib/goals/derive `effective`)
 *  so the board, canvas and server never disagree — no local copy. */
export const effectiveGoalPct: (g: { acceptPct: number | null; pctDone: number }) => number =
  effective;

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

export const GOALS_ACCENT = "#E10600"; // Altus brand red — in-module chrome is red
export const GOALS_ACCENT_DEEP = "#A80400";

/* ------------------------------------------------------------------ */
/* Auto-naming codes (Sir): Y1 → AQ1/JuQ1/OQ1/JQ1 → JulM1 → W1..W52    */
/* ------------------------------------------------------------------ */

/** FY quarter (1=Apr,2=Jul,3=Oct,4=Jan) → anchor-month prefix (J=Jan,A=Apr,Ju=Jul,O=Oct). */
const Q_PREFIX: Record<1 | 2 | 3 | 4, string> = { 1: "A", 2: "Ju", 3: "O", 4: "J" };

/** The short auto-code for a cascade goal: Y{n} / {Q}Q{n} / {Mon}M{n}. `position`
 *  is the 1-based Sr. No. within the period bucket. */
export function goalCode(g: {
  period: GoalPeriod;
  periodKey: string;
  position: number;
  id?: string;
}): string {
  // bug #24 — an in-flight optimistic temp row carries the sentinel position
  // 9_999 (and an "optimistic-" id) until the server assigns its Sr. No.;
  // render "…" instead of leaking "JanM9999" into visible copy. (Prefix kept
  // in lockstep with TEMP_PREFIX in components/goals/canvas/optimistic.ts.)
  if (g.position >= 9_999 || g.id?.startsWith("optimistic-")) return "…";
  if (g.period === "year") return `Y${g.position}`;
  if (g.period === "quarter") return `${Q_PREFIX[quarterOfKey(g.periodKey)]}Q${g.position}`;
  const mon = MONTHS[Number(g.periodKey.slice(5, 7)) - 1] ?? "";
  return `${mon}M${g.position}`;
}

/* ------------------------------------------------------------------ */
/* Colour by ORIGIN (Sir): auto=dark blue · manual=black · spillover=red */
/* ------------------------------------------------------------------ */

export interface OriginStyle {
  color: string;
  label: "Auto" | "Manual" | "Spillover";
  kind: "cascade" | "manual" | "spillover";
}

const ORIGIN_BLUE = "#1e3a8a"; // dark blue — auto-derived from a parent
const ORIGIN_BLACK = "#111827"; // black — manual standalone
const ORIGIN_RED = "#b91c1c"; // red — spilled over, incomplete

/** A goal is a SPILLOVER when it was carried from a prior period and isn't done. */
export function isSpillover(g: { clonedFromId: string | null; pctDone: number; acceptPct: number | null }): boolean {
  return g.clonedFromId != null && effectiveGoalPct(g) < 100;
}

export function originStyle(g: {
  source: string;
  clonedFromId: string | null;
  pctDone: number;
  acceptPct: number | null;
}): OriginStyle {
  if (isSpillover(g)) return { color: ORIGIN_RED, label: "Spillover", kind: "spillover" };
  if (g.source === "cascade") return { color: ORIGIN_BLUE, label: "Auto", kind: "cascade" };
  return { color: ORIGIN_BLACK, label: "Manual", kind: "manual" };
}

/* ------------------------------------------------------------------ */
/* Category tags (Kanban) — target · milestone · operational · goal    */
/* ------------------------------------------------------------------ */

export const GOAL_CATEGORIES = ["target", "milestone", "operational", "goal"] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export interface CategoryStyle {
  label: string;
  /** tag text colour */
  color: string;
  /** tag background */
  bg: string;
  /** left card border accent */
  accent: string;
}

/** Card tag styling. Spillover (carried + incomplete) overrides the category → red. */
export function categoryStyle(category: string | null | undefined, spillover: boolean): CategoryStyle {
  if (spillover) return { label: "Spillover", color: "#b91c1c", bg: "rgba(185,28,28,0.10)", accent: "#b91c1c" };
  // Case-insensitive so both the legacy lowercase enum ("target") and the new
  // capitalised Type options ("Target") resolve; unknown admin-added Types get
  // the neutral default but keep their own label.
  switch ((category ?? "").toLowerCase()) {
    case "target":
      return { label: "Quarter Target", color: "#1d4ed8", bg: "rgba(29,78,216,0.10)", accent: "#1d4ed8" };
    case "milestone":
      return { label: "Milestone", color: "#4338ca", bg: "rgba(67,56,202,0.10)", accent: "#4338ca" };
    case "operational":
      return { label: "Operational", color: "#475569", bg: "rgba(71,85,105,0.10)", accent: "#94a3b8" };
    case "goal":
    case "":
      return { label: "Goal", color: "#334155", bg: "rgba(51,65,85,0.08)", accent: "#334155" };
    default:
      // Custom admin-added Type — neutral chip, its own label.
      return { label: category as string, color: "#334155", bg: "rgba(51,65,85,0.08)", accent: "#334155" };
  }
}

/* ------------------------------------------------------------------ */
/* Serialisable DTOs (server → client boundary)                        */
/* ------------------------------------------------------------------ */

/** A snapshot of a picked Monthly Events Master item (obligation / batch). The
 *  `label` is captured at pick time so the board renders the chip without ever
 *  joining the events-master tables. */
export interface MonthlyMasterRef {
  kind: string;
  id: string;
  label: string;
}

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
  teamInvolved: Array<{ employeeId?: string; name?: string; weight?: number }> | null;
  teamDependencyPct: number | null;
  pctDone: number;
  acceptPct: number | null;
  reviewNotes: string | null;
  evidenceUrl: string | null;
  weight: number;
  adopted: boolean;
  source: string;
  /** Category tag (target · milestone · operational · goal). */
  category: string;
  /** Carry-forward link — set ⇒ this row spilled over from a prior period. */
  clonedFromId: string | null;
  /** Incentive attached to the goal (Yes/No + amount + type). RETIRED — kept
   *  on the DTO for back-compat but no longer surfaced in the goals UI. */
  incentiveEnabled: boolean;
  incentiveAmount: string | null;
  incentiveKind: string | null;
  /** The picked Monthly Events Master item, or null. */
  monthlyMasterRef: MonthlyMasterRef | null;
  /** "Share with team" Yes/No (mig 0149). */
  shareWithTeam: boolean;
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
  teamInvolved: Array<{ employeeId?: string; name?: string; weight?: number }> | null;
  teamDependencyPct: number | null;
  pctDone: number;
  acceptPct: number | null;
  reviewNotes: string | null;
  evidenceUrl: string | null;
  weight: number;
  adopted: boolean;
  source: string;
  category: string;
  clonedFromId: string | null;
  incentiveEnabled?: boolean;
  incentiveAmount?: string | null;
  incentiveKind?: string | null;
  monthlyMasterRef?: { kind: string; id: string; label: string } | null;
  shareWithTeam?: boolean;
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
    shareWithTeam: r.shareWithTeam ?? false,
    pctDone: r.pctDone,
    acceptPct: r.acceptPct,
    reviewNotes: r.reviewNotes,
    evidenceUrl: r.evidenceUrl,
    weight: r.weight,
    adopted: r.adopted,
    source: r.source,
    category: r.category,
    clonedFromId: r.clonedFromId,
    incentiveEnabled: r.incentiveEnabled ?? false,
    incentiveAmount: r.incentiveAmount ?? null,
    incentiveKind: r.incentiveKind ?? null,
    monthlyMasterRef: r.monthlyMasterRef ?? null,
  };
}

/** Recursive tree mapper for the year board. */
export function toNodeDTO(n: Parameters<typeof toGoalDTO>[0] & { children: unknown[] }): GoalNodeDTO {
  return {
    ...toGoalDTO(n),
    children: (n.children as (typeof n)[]).map(toNodeDTO),
  };
}
