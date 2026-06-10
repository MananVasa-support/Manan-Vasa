// Tier-3 (2026-05-20) — additive expansion. Manan asked for need_info +
// follow_up_1/2/3 (granular follow-up tracking) and split the four terminal
// "approved/not_approved/cancelled/transferred" values into a *separate*
// admin-only `approval_status` column. The legacy four values stay in this
// enum so 240 imported tasks keep rendering; new code should write the new
// statuses + approval_status independently.
export const TASK_STATUSES = [
  "dont_know",      // Manan 2026-05 — "I haven't assessed this yet" (light grey)
  "not_started",
  "initiated",
  "follow_up",
  "need_help",
  "on_hold",
  "need_info",      // NEW
  "follow_up_1",    // NEW
  "follow_up_2",    // NEW
  "follow_up_3",    // NEW
  "done",
  // Legacy terminal values — kept for backward compat with imported data.
  // New code should use the `approval_status` column instead.
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses available to non-admin users in the in-app status picker.
 *  The legacy four (approved / not_approved / cancelled / transferred) are
 *  excluded — those are admin-only via the separate approval_status column.
 *  2026-06-08 (sir's changes #2): the granular follow_up_1/2/3 collapsed back
 *  into the single `follow_up`; cancelled is gone (use Archive instead). */
export const USER_TASK_STATUSES = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "on_hold",
  "need_info",
  "done",
] as const satisfies readonly TaskStatus[];

export const PENDING_STATUSES = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "on_hold",
  "need_info",
] as const satisfies readonly TaskStatus[];

/** Statuses retired on 2026-06-08 (sir's changes #2/#4/#6) and 2026-06-10
 *  (need_help). The physical pgEnum keeps them so already-imported rows still
 *  render, but nothing user-facing should offer them: filter them out of every
 *  picker, filter dropdown and kanban column. The follow_up_* rows migrate to
 *  `follow_up`; cancelled/transferred rows migrate to Archived; need_help rows
 *  migrate to `need_info` (see db/migrations/0051_retire_need_help.sql). */
export const DEPRECATED_TASK_STATUSES = [
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "cancelled",
  "transferred",
  "need_help",
] as const satisfies readonly TaskStatus[];

const DEPRECATED_STATUS_SET: ReadonlySet<TaskStatus> = new Set(
  DEPRECATED_TASK_STATUSES,
);

/** True for statuses retired on 2026-06-08 — use to drop them from any
 *  dynamically-built status list (filter options, kanban columns, …). */
export function isDeprecatedStatus(status: TaskStatus): boolean {
  return DEPRECATED_STATUS_SET.has(status);
}

/** What admins see in the in-app status pickers: every live status (incl.
 *  the approval verdicts, so they can force a state) minus retired values. */
export const ADMIN_TASK_STATUSES: readonly TaskStatus[] = TASK_STATUSES.filter(
  (s) => !DEPRECATED_STATUS_SET.has(s),
);

// New admin-only column. Defaults to NULL (no approval verdict yet); the
// terminal verdict moves the task out of "pending" without touching status.
export const APPROVAL_STATUSES = [
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// 28 canonical subject categories the New Task form constrains to. Free
// text remains valid in the DB (the column is `text`) — older tasks may
// hold values outside this list; the dropdown adds "Other…" as an escape
// hatch when needed.
// Tier-4 (2026-05-20) — recurrence options for the GCal-style scheduling
// block on each task. Stored as text on tasks.recurrence; null/'none'
// mean a one-off. Not wired to any real calendar (no Google API yet).
export const TASK_RECURRENCES = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  none:    "Does not repeat",
  daily:   "Daily",
  weekly:  "Weekly",
  monthly: "Monthly",
  yearly:  "Yearly",
};

export const TASK_SUBJECTS = [
  "Marketing",
  "Exhibition",
  "CP Sign Up",
  "Mandate",
  "Invoicing",
  "MIS",
  "Admin",
  "Recruitment",
  "Accounts",
  "PR",
  "Customer Visit",
  "Documentation",
  "Liasoning",
  "Sales",
  "Systems",
  "KPI",
  "Assessment",
  "Basic Checklist",
  "CF Checklist",
  "Follow Up Basic Docs",
  "Call Client to complete File",
  "Call CP to complete File",
  "Reimbursement",
  "Collection",
  "Lead Management",
  "Agreement Signing",
  "Bank Follow Up",
] as const;
export type TaskSubject = (typeof TASK_SUBJECTS)[number];

export const EMPLOYEE_ROLES = ["doer", "initiator", "both"] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export const TASK_PRIORITIES = [
  "imp_urgent",
  "imp_not_urgent",
  "not_imp_urgent",
  "not_imp_not_urgent",
] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// Manan 2026-05-30 — priorities renamed to a simple 1-4 scale. The
// underlying Eisenhower enum values are unchanged (no data migration); only
// the user-facing labels change, system-wide via this single map.
//   Critical  = Important & Urgent
//   Important = Important, Not Urgent
//   Urgent    = Not Important, Urgent
//   Normal    = Not Important, Not Urgent
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  imp_urgent:         "Critical",
  imp_not_urgent:     "Important",
  not_imp_urgent:     "Urgent",
  not_imp_not_urgent: "Normal",
};

export const DEPARTMENTS = [
  "Founder Office",
  "Handholding",
  "Apps",
  "Sales",
  "Marketing",
  "Social Media",
  "Accounts",
  "Admin",
  "HR",
  "Consulting",
  "CRM",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const AGE_BUCKETS = [
  { id: "0-3", label: "0-3 days", min: 0, max: 3 },
  { id: "4-7", label: "4-7 days", min: 4, max: 7 },
  { id: "8-14", label: "8-14 days", min: 8, max: 14 },
  { id: "15-20", label: "15-20 days", min: 15, max: 20 },
  { id: "21-30", label: "21-30 days", min: 21, max: 30 },
  { id: "31-45", label: "31-45 days", min: 31, max: 45 },
  { id: "46-60", label: "46-60 days", min: 46, max: 60 },
  { id: "60+", label: "60+ days", min: 61, max: Infinity },
] as const;

export type AgeBucketId = (typeof AGE_BUCKETS)[number]["id"];

// ── Attendance / Incentive / Outstanding (migration 0053) ──────────────────
// Ported from the Altus Ecosystem static forms (2026-06-10). The DB columns
// are `text` (not pgEnums) so these unions are the canonical source of truth.

export const ATTENDANCE_KINDS = ["in", "out"] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

export const INCENTIVE_TYPES = [
  "bss_conversion",
  "sales_pitch",
  "client_happiness",
  "group_intro",
] as const;
export type IncentiveType = (typeof INCENTIVE_TYPES)[number];

export const INCENTIVE_TYPE_LABELS: Record<IncentiveType, string> = {
  bss_conversion:   "BSS Conversion",
  sales_pitch:      "Sales Pitch",
  client_happiness: "Client Happiness",
  group_intro:      "Group Introduction",
};

export const INCENTIVE_STATUSES = ["pending", "approved", "rejected"] as const;
export type IncentiveStatus = (typeof INCENTIVE_STATUSES)[number];

export const INCENTIVE_STATUS_LABELS: Record<IncentiveStatus, string> = {
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const OUTSTANDING_STATUSES = [
  "open",
  "partial",
  "paid",
  "written_off",
] as const;
export type OutstandingStatus = (typeof OUTSTANDING_STATUSES)[number];

export const OUTSTANDING_STATUS_LABELS: Record<OutstandingStatus, string> = {
  open:        "Open",
  partial:     "Partially Paid",
  paid:        "Paid",
  written_off: "Written Off",
};

// M5.1 — palette tokens used by status_settings.color_token and accepted by the
// admin ColorPicker. The 6 names map to canonical pill backgrounds; admins can
// also store a raw hex string (validated by lib/validators/color-token.ts).
export const STATUS_COLOR_TOKENS = [
  "blue",
  "green",
  "amber",
  "red",
  "rose",
  "purple",
  // Extended palette for Manan's status colour scheme.
  "yellow",
  "orange",
  "slate",
  "brown",
  "stone",  // light grey (Dont Know)
] as const;
export type StatusColorToken = (typeof STATUS_COLOR_TOKENS)[number];
