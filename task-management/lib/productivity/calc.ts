/**
 * The Productivity Dashboard's CENTRAL calculation layer.
 *
 * Every percentage and every grade in the module comes from here — My Dashboard,
 * the drill-down from Team Performance, the Full Report, the PDF digests and the
 * manager team digest all call these same functions. No UI component computes a
 * grade of its own; that is the whole point (§30).
 *
 * PURE by construction: no DB, no `server-only`, no I/O, no clock reads except
 * where a caller passes the date in. That makes the rules readable in one place
 * and lets the server aggregator, a client component and a PDF renderer share
 * them without duplicating a threshold.
 *
 * THE DATA RULE (§31): a stored grade is never an input. Grades are DERIVED from
 * underlying values — salary and incentive amounts, completed and target counts.
 * If a grade were the source of truth it would drift the moment the numbers under
 * it changed, and the dashboard and the reports would start disagreeing.
 */

/* ------------------------------------------------------------------ */
/* Grades                                                              */
/* ------------------------------------------------------------------ */

/** The grade vocabulary, best → worst. Shared by both scales. */
export type Grade = "O" | "A+" | "A" | "B" | "C" | "D" | "F";

/**
 * INCENTIVE grade (§9) — keyed off incentive as a percentage of base salary.
 *
 * The spec lists discrete rows (0→F, 5→D, 10→C, 15→B, 20→A, 25→A+, 30+→O), but
 * real percentages land between them (7.3%, 12.8%). These are therefore read as
 * THRESHOLDS — the grade you have reached and held — so 7.3% is D, not an error.
 * Anything at or above 30% is O.
 */
export function calculateIncentiveGrade(incentivePct: number): Grade {
  if (!Number.isFinite(incentivePct)) return "F";
  if (incentivePct >= 30) return "O";
  if (incentivePct >= 25) return "A+";
  if (incentivePct >= 20) return "A";
  if (incentivePct >= 15) return "B";
  if (incentivePct >= 10) return "C";
  if (incentivePct >= 5) return "D";
  return "F";
}

/**
 * COMPLETION grade (§12) — a DIFFERENT scale from incentive, deliberately.
 * Used for goals, MTD goals and the daily checklist alike (§17).
 *
 * >100 = O, exactly 100 = A+, then 90/80/70/60 bands, below 60 = F. An employee
 * legitimately holds different incentive and goal grades; they measure different
 * things and must never be collapsed into one scale.
 */
export function calculateCompletionGrade(pct: number): Grade {
  if (!Number.isFinite(pct)) return "F";
  if (pct > 100) return "O";
  if (pct === 100) return "A+";
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

/** Goal grade — the completion scale, named for the call sites in §30. */
export const calculateGoalGrade = calculateCompletionGrade;
/** Checklist grade — the same completion scale (§17). */
export const calculateChecklistGrade = calculateCompletionGrade;
/** MTD grade — the same completion scale (§14). */
export const calculateMTDGrade = calculateCompletionGrade;

/** Is this grade a red flag? Drives the "clearly distinguish poor metrics" rule
 *  in §25 without every card re-deciding what "bad" means. */
export function isCriticalGrade(g: Grade): boolean {
  return g === "F" || g === "D";
}

/* ------------------------------------------------------------------ */
/* Percentages                                                         */
/* ------------------------------------------------------------------ */

/**
 * Round to two decimals. The grade bands are specified to 99.99, so rounding to
 * whole numbers would push 89.996 into A and silently misgrade it.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Incentive as a percentage of base salary (§8).
 *
 *     incentive % = earned incentive / base salary × 100
 *
 * Returns `null` — NOT 0 — when base salary is missing or zero. A person with no
 * salary profile has an UNKNOWN incentive %, and showing them 0% / grade F would
 * accuse them of poor performance on the strength of missing payroll data. The
 * UI renders null as "—".
 */
export function calculateIncentivePercentage(
  earnedIncentive: number,
  baseSalary: number,
): number | null {
  if (!Number.isFinite(earnedIncentive) || !Number.isFinite(baseSalary)) return null;
  if (baseSalary <= 0) return null;
  return round2((earnedIncentive / baseSalary) * 100);
}

/**
 * Completion percentage — `completed / target × 100` (§11).
 *
 * Returns `null` when the target is zero or absent: no goals were SET, which is
 * not the same as goals set and missed. Distinguishing the two is what stops the
 * dashboard from grading someone F for a week nobody planned.
 */
export function calculateGoalPercentage(completed: number, target: number): number | null {
  if (!Number.isFinite(completed) || !Number.isFinite(target)) return null;
  if (target <= 0) return null;
  return round2((completed / target) * 100);
}

/** Checklist completion — same shape, named for its call site (§17). */
export const calculateChecklistPercentage = calculateGoalPercentage;

/** The training target, in hours (§16). One constant, so the card, the
 *  percentage and the report can never disagree about what "full" means. */
export const TRAINING_TARGET_HOURS = 6;

/**
 * Training completion against the 6-hour target (§16). Capped at no maximum —
 * over-delivery reads as >100%, which the completion scale grades O.
 */
export function calculateTrainingPercentage(
  hours: number,
  target: number = TRAINING_TARGET_HOURS,
): number | null {
  if (!Number.isFinite(hours) || target <= 0) return null;
  return round2((hours / target) * 100);
}

/* ------------------------------------------------------------------ */
/* MTD — month-to-date weekly aggregation                              */
/* ------------------------------------------------------------------ */

/** One week's goal record, reduced to what MTD needs. */
export interface WeeklyGoalTally {
  /** The week's Monday, `yyyy-mm-dd`. Decides which month the week belongs to. */
  weekStart: string;
  completed: number;
  target: number;
}

export interface MTDResult {
  completed: number;
  target: number;
  /** `null` when no in-month week set a target — see calculateGoalPercentage. */
  pct: number | null;
  grade: Grade;
  /** How many weekly records actually contributed (W1…W5). */
  weeks: number;
}

/**
 * Aggregate weekly goal records into month-to-date (§13, §14).
 *
 *     MTD = W1 + W2 + W3 + W4 + W5
 *
 * A week counts when its `weekStart` falls inside the reference month. That one
 * rule delivers everything §13/§14 asks for and nothing else has to:
 *
 *   • the period always begins on the 1st, because a week starting on the 3rd is
 *     in-month and one starting on the 29th of last month is not;
 *   • it RESETS on its own when the calendar turns over — September's filter
 *     simply stops matching August's weeks, with no reset job to run and nothing
 *     to remember;
 *   • 28/29/30/31-day months need no special casing, since nothing here counts
 *     days — it compares `yyyy-mm` prefixes;
 *   • last month's records can never leak in, for the same reason.
 *
 * Weeks that straddle a month boundary are attributed WHOLLY to the month their
 * Monday falls in. That matches how the rest of the product buckets weeks
 * (`lib/goals/fy-calendar.ts` assigns a week to the month owning its Monday), so
 * the same week is never counted twice or dropped between two months.
 */
export function calculateMTDGoals(
  weeks: WeeklyGoalTally[],
  reference: Date = new Date(),
): MTDResult {
  const prefix = monthPrefix(reference);
  let completed = 0;
  let target = 0;
  let n = 0;

  for (const w of weeks) {
    if (!w.weekStart?.startsWith(prefix)) continue;
    completed += Number.isFinite(w.completed) ? w.completed : 0;
    target += Number.isFinite(w.target) ? w.target : 0;
    n++;
  }

  const pct = calculateGoalPercentage(completed, target);
  return { completed, target, pct, grade: calculateMTDGrade(pct ?? 0), weeks: n };
}

/** MTD percentage on its own, for callers that only need the number (§30). */
export function calculateMTDPercentage(
  weeks: WeeklyGoalTally[],
  reference: Date = new Date(),
): number | null {
  return calculateMTDGoals(weeks, reference).pct;
}

/**
 * `yyyy-mm` for a date in IST — the clock the rest of the product buckets by
 * (see lib/weekly-goals/week.ts). Using UTC here would move the month boundary
 * by 5½ hours, so a goal saved late on the 31st would land in the wrong month.
 */
function monthPrefix(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
}

/** The IST `yyyy-mm-dd` for a date — shared with the aggregator. */
export function istDay(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** First day of the reference month, `yyyy-mm-01` — the MTD window start (§13). */
export function monthStartOf(d: Date = new Date()): string {
  return `${monthPrefix(d)}-01`;
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

/** The four task buckets of §15, in display order. */
export interface OverdueBuckets {
  /** Overdue by more than 15 days. */
  over15: number;
  /** Overdue by 8–14 days inclusive. */
  days8to14: number;
  /** Overdue by 1–3 days inclusive. */
  days1to3: number;
}

/**
 * Bucket overdue tasks by age in whole days (§15).
 *
 * NOTE the spec's bands leave two real gaps — 4–7 days, and exactly 15 — which
 * belong to no card. They are counted in `uncategorised` rather than being
 * quietly folded into a neighbouring bucket, because inflating ">15 days" with
 * 15-day-old tasks would misreport how bad the worst bucket is. The UI ignores
 * `uncategorised`; it exists so the numbers remain auditable.
 */
export function calculateOverdueTasks(
  ageInDays: number[],
): OverdueBuckets & { uncategorised: number } {
  const out = { over15: 0, days8to14: 0, days1to3: 0, uncategorised: 0 };
  for (const raw of ageInDays) {
    if (!Number.isFinite(raw) || raw < 1) continue; // not overdue
    const age = Math.floor(raw);
    if (age > 15) out.over15++;
    else if (age >= 8 && age <= 14) out.days8to14++;
    else if (age >= 1 && age <= 3) out.days1to3++;
    else out.uncategorised++;
  }
  return out;
}

/**
 * Whole days a task is overdue, in IST. 0 means not overdue. Compares CALENDAR
 * DAYS rather than elapsed hours, so a task due yesterday at 6pm reads as 1 day
 * overdue this morning instead of 0.
 */
export function overdueAgeInDays(dueAt: Date | string | null, now: Date = new Date()): number {
  if (!dueAt) return 0;
  const due = typeof dueAt === "string" ? dueAt.slice(0, 10) : istDay(dueAt);
  const today = istDay(now);
  if (due >= today) return 0;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/* ------------------------------------------------------------------ */
/* Section results — the shapes the UI and the reports both render      */
/* ------------------------------------------------------------------ */

/** A percentage paired with the grade derived from it. Never stored — always
 *  computed from the values beside it, per §31. */
export interface Scored {
  completed: number;
  target: number;
  pct: number | null;
  grade: Grade;
}

/** Build a `Scored` from raw values, so no caller derives a grade by hand. */
export function score(completed: number, target: number): Scored {
  const pct = calculateGoalPercentage(completed, target);
  return { completed, target, pct, grade: calculateCompletionGrade(pct ?? 0) };
}

/** Format a percentage for display; `null` reads as an em dash, never "0%". */
export function formatPct(pct: number | null): string {
  return pct == null ? "—" : `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)}%`;
}
