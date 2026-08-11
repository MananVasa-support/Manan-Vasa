/**
 * Client-safe types shared by the Plan-Your-Day planner (Module 4).
 *
 * PURE — no server imports — so the `"use client"` board can import it freely.
 * The planner persists to `daily_checklist` (reusing its goalId/origin), so a
 * plan item's `id` is the `daily_checklist` row id (or the transient drag ghost).
 */

import type { TaskPriority, TaskStatus } from "@/db/enums";

/** The right-hand drag-source families. `weekly` maps to a real `weekly_goals`
 *  row (stored on the checklist via `goal_id`); the cascade families
 *  (monthly/quarterly/yearly) and `task` are stored as standalone commitments. */
export type SourceKind = "weekly" | "monthly" | "quarterly" | "yearly" | "task" | "unfinished";

/** What a left-column commitment was pulled from (or typed ad-hoc). */
export type PlanKind = SourceKind | "adhoc";

/**
 * The explicit TEXT tag every row carries, on BOTH sides of the board. Spelled
 * out in words (never colour-only) so the source of a line is unmistakable:
 *   GOAL      — a cascade goal (`goals`: year / quarter / month)
 *   GOAL TASK — a weekly goal (`weekly_goals`), the executable slice of a goal
 *   WMS TASK  — a real WMS task (`tasks`)
 *   CARRYOVER — an unfinished commitment pulled forward from an earlier day
 *   AD-HOC    — typed straight into today's plan
 */
export type SourceTag = "GOAL" | "GOAL TASK" | "WMS TASK" | "CARRYOVER" | "AD-HOC";

/** kind → tag. One map, used by the plan column AND the available-work column,
 *  so a line can never be labelled one thing on the left and another right. */
export const KIND_TAG: Record<PlanKind, SourceTag> = {
  yearly: "GOAL",
  quarterly: "GOAL",
  monthly: "GOAL",
  weekly: "GOAL TASK",
  task: "WMS TASK",
  unfinished: "CARRYOVER",
  adhoc: "AD-HOC",
};

/** The cascade level word shown beside a [GOAL] tag. */
export const KIND_PERIOD_LABEL: Partial<Record<PlanKind, string>> = {
  yearly: "Yearly",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

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

  /* ── WMS task detail (kind === "task"). Read straight off the `tasks` row —
        the card REFERENCES that task, it never copies or re-creates one. ── */
  /** tasks.task_no — the id a user quotes ("#1023"). */
  taskNo?: number | null;
  /** Live WMS status — drives the status chip AND the status filter. */
  status?: TaskStatus | null;
  /** Eisenhower priority — drives the priority chip AND the priority filter. */
  priority?: TaskPriority | null;
  /** EFFECTIVE due (revised ?? due_at) as an IST "YYYY-MM-DD" — the due filter
   *  works off this, so filtering agrees with the overdue/today chips. */
  dueYmd?: string | null;
  /** Project / client / source line. */
  project?: string | null;

  /** For CARRYOVER cards only — what the ORIGINAL item was, so an unfinished
   *  row can show both [CARRYOVER] and the source it came from. */
  originKind?: Extract<PlanKind, "weekly" | "task" | "adhoc">;
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

/**
 * Everything the PlanBoard needs for one person-day — built server-side by ONE
 * shared assembler (`app/(app)/goals/plan/payload.ts`) so the `/goals/plan`
 * route and the canvas Day zoom stage (Phase 5 fold-in) can never drift.
 * Client-safe: plain data only.
 */
export interface PlanDayPayload {
  initialPlan: PlanItem[];
  sources: PlanSources;
  minItems: number;
  isManager: boolean;
  initialPhase: PlanPhase;
  /** The plan date this payload describes ("YYYY-MM-DD", IST today). */
  ymd: string;
}
