import type { TaskPriority, TaskStatus } from "@/db/enums";
import type { StatusDisplayMap } from "@/lib/queries/status-display-merge";

/**
 * The full per-goal row the redesigned card board renders. A superset of the
 * legacy `WeeklyGoalRow` (lib/queries/weekly-goals.ts) that also carries the
 * additive Planning + Review fields (weight / targetDate / notes / status /
 * acceptPct / reviewNotes / archived / review provenance). Built server-side in
 * the Weekly Goals page and threaded down to the cards / review panel.
 */
export interface BoardGoal {
  id: string;
  employeeId: string;
  employeeName: string;
  weekStart: string;
  position: number;
  client: string | null;
  subject: string | null;
  priority: TaskPriority;
  incentive: boolean;
  incentiveAmount: number;
  kpi: boolean;
  targetDone: string | null;
  pctDone: number;
  pctUpdatedAt: Date | null;
  explanation: string | null;
  linkUrl: string | null;
  carriedFromId: string | null;
  // --- Redesign (additive) — Planning. ---
  weight: number;
  targetDate: string | null;
  notes: string | null;
  // --- Redesign (additive) — Review. ---
  status: TaskStatus;
  acceptPct: number | null;
  reviewNotes: string | null;
  archived: boolean;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
}

export type { StatusDisplayMap };
