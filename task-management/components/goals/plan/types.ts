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

  /* ── Added for the post-"Start My Day" review TABLE ───────────────────────
     All OPTIONAL, because two other paths build a PlanItem with only the core
     fields: the optimistic rows in plan/actions.ts, and the drag ghost. A table
     cell renders an em-dash when a value is absent, which is also the honest
     rendering for rows that genuinely have no such value — an ad-hoc
     commitment has no client, and a weekly goal has no priority. */

  /** Split back out of `subtitle`, which merges them lossily. */
  client?: string | null;
  subject?: string | null;
  /** The linked WMS task, when this row came from one. */
  taskId?: string | null;
  taskNo?: number | null;
  /** The task's Eisenhower priority — NOT an invented High/Medium/Low. */
  priority?: TaskPriority | null;
  description?: string | null;
  /** Effective due (revised ?? original), or a weekly goal's target date. */
  dueYmd?: string | null;
  /** When the row was committed to a plan. */
  createdYmd?: string | null;
  /** Whole IST days since `createdYmd`. */
  ageDays?: number | null;
  /** Rolled forward from an earlier, unfinished day (`moved_from_date`). This
   *  is what makes the "Unfinished" category knowable — `kind` reverts to
   *  weekly/task/adhoc once an item is carried over. */
  carriedOver?: boolean;
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
  /** Live WMS status — drives the status line AND the status filter. */
  status?: TaskStatus | null;
  /** Eisenhower priority — drives the priority line AND the priority filter. */
  priority?: TaskPriority | null;
  /** EFFECTIVE due (revised ?? due_at) as an IST "YYYY-MM-DD" — the due filter
   *  works off this, so filtering agrees with the Overdue/Today marks. */
  dueYmd?: string | null;
  /** Project / client / source line. */
  project?: string | null;

  /* ── Rich detail for the hover preview + double-click pop-out (no notes). ── */
  /** Who assigned it (WMS task creator's name). */
  assigner?: string | null;
  /** Full description / target text — the untruncated body. */
  description?: string | null;
  /** Whole IST days overdue relative to the viewed plan day (>0 = late). */
  overdueDays?: number | null;

  /* ── carryover detail (kind === "unfinished") ── */
  /** What the ORIGINAL item was, so a carried-over row can show both its
   *  CARRYOVER state and the source it actually came from. */
  originKind?: Extract<PlanKind, "weekly" | "task" | "adhoc">;
  /** The plan date it was originally committed on ("YYYY-MM-DD"). */
  fromYmd?: string | null;
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
  /** The plan date this payload describes ("YYYY-MM-DD", IST). */
  ymd: string;
  /** Which of the 3 planner days this is: 0 today · 1 tomorrow · 2 day-after. */
  /** Which planner day this payload is for — 0 = today … 6 = six days out. */
  dayOffset: number;
}
