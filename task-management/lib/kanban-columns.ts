import { USER_TASK_STATUSES, type TaskStatus } from "@/db/enums";

// Sentinel id for the synthetic "Archived" column (not a real TaskStatus).
export const ARCHIVE_COL = "__archived__" as const;

/**
 * TWO-STAGE APPROVAL (mig 0185). Sir wanted "Manager Approved" and "Admin
 * Approved" as separate Kanban categories. They are SYNTHETIC columns derived
 * from `tasks.approval_level` — the same trick ARCHIVE_COL already uses to render
 * a column backed by a boolean rather than a status.
 *
 * Doing it this way (instead of adding two task_status values) is what keeps the
 * ~40 existing consumers of `status = 'approved'` working untouched.
 */
export const MANAGER_APPROVED_COL = "manager_approved" as const;
export const ADMIN_APPROVED_COL = "admin_approved" as const;

export type ColId =
  | TaskStatus
  | typeof ARCHIVE_COL
  | typeof MANAGER_APPROVED_COL
  | typeof ADMIN_APPROVED_COL;

/** Which column a task belongs in — approval level wins over the bare status. */
export function boardColumnFor(t: {
  status: TaskStatus;
  archived?: boolean;
  approvalLevel?: "none" | "manager" | "admin" | null;
}): ColId {
  if (t.archived) return ARCHIVE_COL;
  if (t.status === "approved") {
    return t.approvalLevel === "admin" ? ADMIN_APPROVED_COL : MANAGER_APPROVED_COL;
  }
  return t.status;
}

// Default admin board order (sir's changes #7): the working lane, then the
// terminal verdicts, then Archived, with On Hold pulled out to the very end —
// "On Hold has to be placed after Archived". Deprecated statuses
// (follow_up_1/2/3, cancelled, transferred) are intentionally absent.
export const DEFAULT_ADMIN_COLUMN_ORDER: ColId[] = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "need_info",
  "done",
  "not_approved",
  // The single "approved" column is replaced by the two stages, in the order
  // work actually flows: a manager accepts it, then Manan gives final sign-off.
  MANAGER_APPROVED_COL,
  ADMIN_APPROVED_COL,
  ARCHIVE_COL,
  "on_hold",
];

// Non-admins: their curated lifecycle list, plus the terminal verdicts. They can
// SEE where their work got to even though they cannot move it there.
//
// NOT APPROVED was missing here. `USER_TASK_STATUSES` is the DOER's operational
// lifecycle and deliberately stops at `done`, so a non-admin board showed the
// two approved stages but no Not Approved column — sent-back work simply
// vanished from the board for the person who has to redo it. It is appended
// explicitly, in the same place the admin order puts it: straight after Done.
export const USER_COLUMN_ORDER: ColId[] = [
  ...USER_TASK_STATUSES,
  "not_approved",
  MANAGER_APPROVED_COL,
  ADMIN_APPROVED_COL,
  ARCHIVE_COL,
];

const ADMIN_COLUMN_SET = new Set<string>(DEFAULT_ADMIN_COLUMN_ORDER);

/** True if `id` is a column the admin board can render/reorder. */
export function isValidColumnId(id: string): id is ColId {
  return ADMIN_COLUMN_SET.has(id);
}

/**
 * Resolve the effective admin column order from a stored order that may be
 * null, stale, or partial. Drops unknown/deprecated ids, de-dupes, and
 * appends any live columns the stored order didn't mention — so a status
 * added after the order was saved never silently disappears.
 */
export function resolveAdminColumnOrder(
  stored: string[] | null | undefined,
): ColId[] {
  if (!stored || stored.length === 0) return DEFAULT_ADMIN_COLUMN_ORDER;
  const seen = new Set<string>();
  const ordered: ColId[] = [];
  for (const id of stored) {
    if (ADMIN_COLUMN_SET.has(id) && !seen.has(id)) {
      ordered.push(id as ColId);
      seen.add(id);
    }
  }
  for (const id of DEFAULT_ADMIN_COLUMN_ORDER) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}
