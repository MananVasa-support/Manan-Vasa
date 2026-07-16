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
export type SourceKind = "weekly" | "monthly" | "quarterly" | "yearly" | "task";

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
  /** True only for the live drag placeholder. */
  ghost?: boolean;
}

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
}

/** All source windows handed to the board. */
export interface PlanSources {
  weekly: SourceItem[];
  monthly: SourceItem[];
  quarterly: SourceItem[];
  yearly: SourceItem[];
  task: SourceItem[];
}

/** The transient placeholder id used during a cross-list drag. */
export const GHOST_ID = "__plan_ghost__";
