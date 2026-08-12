import type { Grade } from "./calc";
import { gradeTone } from "./calc";

/**
 * The Productivity Dashboard's colour system — ONE source for the screen, the
 * Full Report and the PDF.
 *
 * The discipline the module holds to: colour is an ACCENT, never a surface.
 * Cards and report blocks stay white; a section is identified by a 3px cap, an
 * icon chip and — only where the value carries a judgement — the metric's own
 * colour. That keeps five colours on one page reading as enterprise software
 * rather than a scoreboard.
 *
 * Each theme carries two values because they do different jobs:
 *   • `accent` — the saturated tone, for 3px caps and icon chips (large areas
 *     of colour, no contrast requirement).
 *   • `ink` — the darkened form, used wherever the colour carries TEXT, so every
 *     coloured number clears AA on a white card.
 * `tint` backs the icon chip and nothing else.
 *
 * PURE by design — no React, no `server-only` — so the pdfkit renderer can read
 * the same hexes the browser does.
 */

export interface SectionTheme {
  accent: string;
  ink: string;
  tint: string;
}

/** KPI — indigo. Matches the module's own identity accent in `module-theme`. */
export const KPI_THEME: SectionTheme = { accent: "#4f46e5", ink: "#4338ca", tint: "#eef2ff" };
/** Goals — amber/gold. */
export const GOALS_THEME: SectionTheme = { accent: "#f59e0b", ink: "#b45309", tint: "#fffbeb" };
/** Tasks — red/orange, the urgency section. */
export const TASKS_THEME: SectionTheme = { accent: "#ef4444", ink: "#b91c1c", tint: "#fef2f2" };
/** Training — violet. */
export const TRAINING_THEME: SectionTheme = { accent: "#8b5cf6", ink: "#6d28d9", tint: "#f5f3ff" };
/** Manager — emerald. */
export const MANAGER_THEME: SectionTheme = { accent: "#10b981", ink: "#047857", tint: "#ecfdf5" };

/**
 * Grade colours, keyed by the tone `calc.gradeTone` assigns. The ladder (which
 * letters count as good) is a business rule and lives in `calc`; only the hexes
 * live here, so re-skinning can never silently re-grade anyone.
 */
export const GRADE_COLOR: Record<ReturnType<typeof gradeTone>, string> = {
  good: "#047857",
  ok: "#1d4ed8",
  warn: "#b45309",
  bad: "#c2410c",
  critical: "#b91c1c",
};

/** The colour a grade letter is drawn in. Never the only signal — every surface
 *  prints the letter itself. */
export function gradeColor(grade: Grade): string {
  return GRADE_COLOR[gradeTone(grade)];
}

/**
 * Overdue urgency ramp — red → orange → yellow as the bucket gets fresher, plus
 * the separate attention tone for "need help" (a flag, not an age).
 *
 * A count of ZERO is the good outcome and is drawn neutral-dark instead: a red
 * "0" would read as a problem where there is none.
 */
export const TASK_COLOR = {
  over15: "#b91c1c",
  days8to14: "#c2410c",
  days1to7: "#a16207",
  needHelp: "#b45309",
} as const;
