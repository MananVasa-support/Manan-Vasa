/**
 * Client-safe types shared by the Plan-Your-Day planner (Module 4).
 *
 * PURE — no server imports — so the `"use client"` board can import it freely.
 * The planner persists to `daily_checklist` (reusing its goalId/origin), so a
 * plan item's `id` is the `daily_checklist` row id (or the transient drag ghost).
 */

/** The right-hand drag-source families. `weekly` maps to a real `weekly_goals`
 *  row (stored on the checklist via `goal_id`); the cascade families
 *  (monthly/quarterly/yearly) and `task` are stored as standalone commitments. */
export type SourceKind = "weekly" | "monthly" | "quarterly" | "yearly" | "task" | "unfinished";

/** What a left-column commitment was pulled from (or typed ad-hoc). */
export type PlanKind = SourceKind | "adhoc";

/** A single ordered commitment in "Today's Plan". */
export interface PlanItem {
  /** daily_checklist row id — or `GHOST_ID` while a source is dragged over. */
  id: string;
  title: string;
  subtitle: string | null;
  origin: "goal_related" | "standalone";
  kind: PlanKind;
  done: boolean;
  /** Close-out progress 0-100 (null ⇒ not logged; done ⇒ treat as 100). */
  donePct?: number | null;
  /** Optional close-out note ("what happened"). */
  doneNote?: string | null;
  /** True only for the live drag placeholder. */
  ghost?: boolean;
}

/**
 * The unified "Plan My Day" page renders one of these phases (Sir's transcript):
 *   plan     — morning: drag-drop commitments from weekly goals + tasks.
 *   active   — day started: "you're set to clock in" (until close-out).
 *   closeout — checkout/end-of-day: mark each commitment done / 0-100%.
 *   closed   — day wrapped: read-only summary of how it went.
 */
export type PlanPhase = "plan" | "active" | "closeout" | "closed";

/** A draggable card in a right-hand source window. */
export interface SourceItem {
  /** weekly_goals.id | goals.id | tasks.id, by kind. */
  id: string;
  kind: SourceKind;
  title: string;
  subtitle: string | null;
  /** Small trailing chip, e.g. "45%" or "#1023". */
  meta: string | null;
  /** Already on today's plan (dedupe-able sources only: weekly + task). */
  added: boolean;
  /** Effective due is past — surfaces unfinished/carried-over work (tasks only). */
  overdue?: boolean;
  /** Human due chip, e.g. "Overdue", "Today", "20 Jul" (tasks only). */
  dueLabel?: string | null;
  /** Important quadrant (imp_urgent | imp_not_urgent) — the importance badge. */
  important?: boolean;
  /** Underlying task id (task + task-linked unfinished cards) — powers Abandon. */
  taskId?: string | null;
}

/** All source windows handed to the board. */
export interface PlanSources {
  weekly: SourceItem[];
  monthly: SourceItem[];
  quarterly: SourceItem[];
  yearly: SourceItem[];
  task: SourceItem[];
  /** Previously-unfinished commitments carried from earlier days. */
  unfinished: SourceItem[];
}

/** The transient placeholder id used during a cross-list drag. */
export const GHOST_ID = "__plan_ghost__";
