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

// Attendance codes. Phase A: P / H/D / A / W/O / incomplete. Phase B (0059)
// adds holiday (H / HP / H-H/D), leave (PL paid, LWP unpaid) and comp-off (CO).
export const ATTENDANCE_CODES = ["P","H/D","A","W/O","incomplete","H","HP","H-H/D","PL","LWP","CO"] as const;
export type AttendanceCode = (typeof ATTENDANCE_CODES)[number];
export const ATTENDANCE_CODE_VALUES: Record<AttendanceCode, number> = {
  "P":1, "H/D":0.5, "A":0, "W/O":1, "incomplete":0,
  "H":1, "HP":2, "H-H/D":1.5, "PL":1, "LWP":0, "CO":1,
};
export const ATTENDANCE_CODE_LABELS: Record<AttendanceCode, string> = {
  "P":"Present", "H/D":"Half Day", "A":"Absent", "W/O":"Weekly Off", "incomplete":"No Check-out",
  "H":"Holiday", "HP":"Holiday Present", "H-H/D":"Holiday Half-Day",
  "PL":"Paid Leave", "LWP":"Unpaid Leave", "CO":"Comp Off",
};

// Phase B (0059) — leave_requests / comp_off_credits enums. The DB columns are
// `text` (not pgEnums) so these unions are the canonical source of truth.
export const LEAVE_KINDS = ["paid","unpaid"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  paid:   "Paid Leave",
  unpaid: "Unpaid Leave",
};

export const LEAVE_STATUS = ["pending","approved","rejected","cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUS)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending:   "Pending",
  approved:  "Approved",
  rejected:  "Rejected",
  cancelled: "Cancelled",
};

export const COMP_OFF_STATUS = ["open","redeemed"] as const;
export type CompOffStatus = (typeof COMP_OFF_STATUS)[number];
export const PUNCH_SOURCES = ["self","admin"] as const;
export type PunchSource = (typeof PUNCH_SOURCES)[number];
export const PUNCH_REASONS = ["client_visit","wfh","forgot","correction"] as const;
export type PunchReason = (typeof PUNCH_REASONS)[number];

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

// ── Outstanding tracker (native rebuild) ───────────────────────────────────
export const OUTSTANDING_CYCLES = [
  "subscription",
  "monthly_bill",
  "full_payment",
  "partial_payment",
  "slabs",
] as const;
export type OutstandingCycle = (typeof OUTSTANDING_CYCLES)[number];
export const OUTSTANDING_CYCLE_LABELS: Record<OutstandingCycle, string> = {
  subscription:    "Subscription",
  monthly_bill:    "Monthly Bill",
  full_payment:    "Full Payment",
  partial_payment: "Partial Payment",
  slabs:           "Slabs",
};

// Subscription billing cadence (iter-2). Stored as text on
// outstanding_contracts.frequency; only meaningful for the subscription cycle.
export const SUBSCRIPTION_FREQUENCIES = [
  "10_days",
  "15_days",
  "30_days",
  "weekly",
] as const;
export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number];
export const SUBSCRIPTION_FREQUENCY_LABELS: Record<SubscriptionFrequency, string> = {
  "10_days": "10 Days",
  "15_days": "15 Days",
  "30_days": "30 Days",
  weekly:    "Weekly",
};

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

// iter-2: the New Contract form offers only 0% / 18% GST (the source sheet
// never used the other slabs). The wider GST_RATES list stays for any legacy
// data / other callers.
export const GST_FORM_RATES = [0, 18] as const;

export const OUTSTANDING_CONTRACT_STATUS = [
  "active",
  "closed",
  "written_off",
] as const;
export type OutstandingContractStatus = (typeof OUTSTANDING_CONTRACT_STATUS)[number];

// Derived per-installment state (never stored).
export const INSTALLMENT_STATES = ["not_due", "due_soon", "overdue", "paid"] as const;
export type InstallmentState = (typeof INSTALLMENT_STATES)[number];

// Overdue-by-days buckets — boundaries match the source dashboard.
export const OUTSTANDING_OVERDUE_BUCKETS = [
  { id: "0-3",   label: "0–3 Days Overdue",   min: 0,  max: 3 },
  { id: "4-7",   label: "4–7 Days Overdue",   min: 4,  max: 7 },
  { id: "8-15",  label: "8–15 Days Overdue",  min: 8,  max: 15 },
  { id: "16-30", label: "16–30 Days Overdue", min: 16, max: 30 },
  { id: "31-45", label: "31–45 Days Overdue", min: 31, max: 45 },
  { id: "46-60", label: "46–60 Days Overdue", min: 46, max: 60 },
  { id: "60+",   label: "60+ Days Overdue",   min: 61, max: Infinity },
] as const;
export type OverdueBucketId = (typeof OUTSTANDING_OVERDUE_BUCKETS)[number]["id"];

// Seed roster values (admin-editable after seeding). Updated for iter-2 to
// match the source sheet's master lists. BSU is intentionally dropped from the
// fresh-seed product list (it stays in the DB for any already-imported rows).
export const SEED_RESPONSIBLES = [
  "Anand Singh",
  "Dhanashree Solkar",
  "Jeevan Bharambe",
  "Kiran Bhosale",
  "Manan Vasa",
  "Mishtie Kanani",
  "Rohan Choudhary",
  "Ruchita Ambre",
  "Rutvisha Mehta",
  "Sanket Thorat",
  "Satish Sonawane",
  "Siddesh Walve",
] as const;
export const SEED_ENTITIES = [
  "Altus Corp",
  "Unleashed",
  "IGV",
  "Khushboo",
  "MJV HUF",
  "JSV HUF",
  "Dharav Enterprises",
  "Colour Graphics",
  "Smita Raut",
  "Sunil Raut",
] as const;
export const SEED_PRODUCTS = [
  "BSS",
  "Billing",
  "Commission",
  "Consulting",
  "PS",
  "Rent",
  "Retainer",
] as const;
export const SEED_PAYMENT_MODES = [
  "Kotak - Altus",
  "Pay U",
  "Jodo",
  "IGV",
  "Kotak - Unleashed",
  "Kotak - Khushboo",
  "Kotak - MJV HUF",
  "Kotak - JSV HUF",
  "Gpay - JSV HUF",
  "Gpay - MJV",
  "Gpay - CMV",
  "PDC",
  "Barter",
] as const;

// ── Monthly Events Master (migration 0130) ─────────────────────────────────
// All DB columns are `text` (house norm — not pgEnums), so these unions are the
// canonical source of truth for the Monthly Events Master module.

/** Event / batch-schedule confirmation state. Tentative = hatched + dashed +
 *  "TENT" chip; Confirmed = solid fill (see design §3/§5). */
export const EVENT_STATUSES = ["tentative", "confirmed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  tentative: "Tentative",
  confirmed: "Confirmed",
};

/** Where a calendar_events row came from. Non-`manual` rows are reconciled from
 *  their source (holiday / batch schedule / obligation) and are usually locked. */
export const EVENT_SOURCES = ["manual", "holiday", "batch", "obligation"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** employees.religion — drives the personalised holiday list (design §7). */
export const RELIGIONS = ["hindu", "christian", "muslim", "other", "unspecified"] as const;
export type ReligionCode = (typeof RELIGIONS)[number];
export const RELIGION_LABELS: Record<ReligionCode, string> = {
  hindu: "Hindu",
  christian: "Christian",
  muslim: "Muslim",
  other: "Other",
  unspecified: "Unspecified",
};

/** holidays.applies_to — audience tag. `all` = everyone; `hindu_only` is dropped
 *  for non-Hindus; christian/muslim are religion add-ons; custom = manual set. */
export const HOLIDAY_APPLIES_TO = ["all", "hindu_only", "christian", "muslim", "custom"] as const;
export type HolidayAppliesTo = (typeof HOLIDAY_APPLIES_TO)[number];
export const HOLIDAY_APPLIES_TO_LABELS: Record<HolidayAppliesTo, string> = {
  all: "Everyone",
  hindu_only: "Hindu only",
  christian: "Christian add-on",
  muslim: "Muslim add-on",
  custom: "Custom",
};

// ── Goals Cascade (migration 0131) ──────────────────────────────────────────
// The Y→Q→M cascade tree. DB columns are `text` (house norm), so these unions
// are the canonical source of truth for `goals.period` and `goals.source`.

/** A cascade goal's level. Week lives on the existing weekly_goals table. */
export const GOAL_PERIODS = ["year", "quarter", "month"] as const;
export type GoalPeriodCode = (typeof GOAL_PERIODS)[number];
export const GOAL_PERIOD_LABELS: Record<GoalPeriodCode, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
};

/** How a goal came to exist: hand-added vs auto-generated from a parent by ÷. */
export const GOAL_SOURCES = ["manual", "cascade"] as const;
export type GoalSource = (typeof GOAL_SOURCES)[number];

// ── Agreements module (migration 0132) ──────────────────────────────────────
/** The four HR agreement templates. */
export const AGREEMENT_TYPES = [
  "appointment",
  "employment",
  "nda",
  "ctc",
  "probation_confirmation",
  "training_completion",
] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];
export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  appointment: "Appointment Letter",
  employment: "Employment Agreement",
  nda: "NDA / Confidentiality",
  ctc: "CTC / Salary Letter",
  probation_confirmation: "Confirmation of Appointment (Post-Probation)",
  training_completion: "Confirmation — End of Free Training",
};
/** Lifecycle: drafted by HR → sent to the employee → e-signed. */
export const AGREEMENT_STATUSES = ["draft", "sent", "signed"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
};

// ── HR Support / Ticketing (migration 0145) ─────────────────────────────────
// One table, two doors: /support (full ticket) and /queries "Ask HR" both write
// hr_tickets — /queries rows carry source="query". DB columns are `text` (house
// norm — not pgEnums), so these unions are the canonical source of truth.

/** Ticket lifecycle. Employees NEVER touch a status dropdown — transitions are
 *  driven by HR actions + auto rules (employee reply flips waiting_on_employee
 *  back to in_progress; resolved auto-closes after 72h or on employee confirm;
 *  a closed ticket may be reopened ≤7 days after close → status "reopened",
 *  which behaves like in_progress with reopened_count bumped). */
export const HR_TICKET_STATUSES = [
  "new",
  "in_progress",
  "waiting_on_employee",
  "resolved",
  "closed",
  "reopened",
] as const;
export type HrTicketStatus = (typeof HR_TICKET_STATUSES)[number];

/** HR-side labels. */
export const HR_TICKET_STATUS_LABELS: Record<HrTicketStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  waiting_on_employee: "Waiting on Employee",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

/** Employee-side labels differ by design ("With HR" / "Waiting on you"). */
export const HR_TICKET_STATUS_EMPLOYEE_LABELS: Record<HrTicketStatus, string> = {
  new: "With HR",
  in_progress: "With HR",
  waiting_on_employee: "Waiting on you",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "With HR",
};

/** Statuses that count as "open" for queues, badges + the SLA breach cron. */
export const HR_TICKET_OPEN_STATUSES = [
  "new",
  "in_progress",
  "waiting_on_employee",
  "reopened",
] as const satisfies readonly HrTicketStatus[];

export const HR_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type HrTicketPriority = (typeof HR_TICKET_PRIORITIES)[number];
export const HR_TICKET_PRIORITY_LABELS: Record<HrTicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** SLA policy per priority — STAMPED onto the ticket at create/priority-change
 *  time (first_response_due_at / resolution_due_at); ONE breach cron compares
 *  now() vs the stamps. Not an engine. Business days = IST Mon–Sat. */
export const HR_TICKET_SLA: Record<
  HrTicketPriority,
  { firstResponseHours: number; resolutionBusinessDays: number }
> = {
  urgent: { firstResponseHours: 2, resolutionBusinessDays: 1 },
  high: { firstResponseHours: 4, resolutionBusinessDays: 2 },
  normal: { firstResponseHours: 8, resolutionBusinessDays: 3 },
  low: { firstResponseHours: 24, resolutionBusinessDays: 5 },
};

/** Categories drive routing (hr_ticket_routes category→owner) AND visibility:
 *  `grievance` is CONFIDENTIAL (requester + current assignee + super-admins
 *  ONLY — see the single visibleTicketsFilter choke point) and is born at
 *  priority ≥ high. */
export const HR_TICKET_CATEGORIES = [
  "payroll",
  "leave_attendance",
  "reimbursement",
  "it_access",
  "facilities",
  "documents_letters",
  "policy_question",
  "grievance",
  "other",
] as const;
export type HrTicketCategory = (typeof HR_TICKET_CATEGORIES)[number];
export const HR_TICKET_CATEGORY_LABELS: Record<HrTicketCategory, string> = {
  payroll: "Payroll & Salary",
  leave_attendance: "Leave & Attendance",
  reimbursement: "Reimbursement",
  it_access: "IT & Access",
  facilities: "Facilities",
  documents_letters: "Documents & Letters",
  policy_question: "Policy Question",
  grievance: "Grievance (Confidential)",
  other: "Other",
};

/** Which door created the ticket: /support full form vs /queries "Ask HR". */
export const HR_TICKET_SOURCES = ["support", "query"] as const;
export type HrTicketSource = (typeof HR_TICKET_SOURCES)[number];

// ── Appraisal (migration 0146) ──────────────────────────────────────────────
// Consolidates Performance (/pms) + 360 Review + Signals into ONE /appraisal
// surface with a multi-dimension scoring engine. DB columns are `text` (house
// norm), so these unions are the canonical source of truth.

/** The 9 scoring dimensions. Weights are ADMIN-CONFIGURABLE via
 *  appraisal_config.dimension_weights (seeded to
 *  DEFAULT_APPRAISAL_DIMENSION_WEIGHTS below, which sums to 100). */
export const APPRAISAL_DIMENSIONS = [
  "kpi",              // admin fills + approves, then visible to the employee
  "skill",            // max 3 per person, technical/non-technical
  "attitude",         // same shape as skill, max 3
  "incentive",        // AUTO: min(100%, (earned/base)/target%) × weight
  "culture",          // 3 Constitution items / month, serial-wise, rated as ONE item
  "knowledge_sharing",// AUTO from Training (do-6 / give-4 rule)
  "problem_solving",  // manager-only Yes/No one-liner
  "growth_mindset",   // manager-only Yes/No one-liner
  "ability",          // "Ability to get things done" — manager-only Y/N one-liner
] as const;
export type AppraisalDimension = (typeof APPRAISAL_DIMENSIONS)[number];
export const APPRAISAL_DIMENSION_LABELS: Record<AppraisalDimension, string> = {
  kpi: "KPI",
  skill: "Skill",
  attitude: "Attitude & Mindset",
  incentive: "Incentive",
  culture: "Culture (Constitution)",
  knowledge_sharing: "Knowledge Sharing",
  problem_solving: "Problem Solving Ability",
  growth_mindset: "Growth Mindset",
  ability: "Ability to Get Things Done",
};

/** Dimensions dropped for NON-managers (the subjective manager-only
 *  one-liners). The score engine renormalises the remaining weights. */
export const APPRAISAL_MANAGER_ONLY_DIMENSIONS = [
  "problem_solving",
  "growth_mindset",
  "ability",
] as const satisfies readonly AppraisalDimension[];

/** Dimensions whose score is COMPUTED, never hand-scored (no self/mgr/mgmt). */
export const APPRAISAL_AUTO_DIMENSIONS = [
  "incentive",
  "knowledge_sharing",
] as const satisfies readonly AppraisalDimension[];

/** Default dimension weights — sums to 100. Reconciles sir's table (KPI 30 ·
 *  Skill 30 · Culture 10 · KS 5 · PS 5 · GM 5 · Ability 5 = 90, no Incentive/
 *  Attitude) with the verbal "Incentive 30" by scaling into a 100-sum whole.
 *  ADMIN-EDITABLE at runtime via appraisal_config — this is only the seed. */
export const DEFAULT_APPRAISAL_DIMENSION_WEIGHTS: Record<AppraisalDimension, number> = {
  kpi: 25,
  skill: 15,
  attitude: 10,
  incentive: 20,
  culture: 10,
  knowledge_sharing: 5,
  problem_solving: 5,
  growth_mindset: 5,
  ability: 5,
};

/** Appraisal cycle lifecycle (one row per period in appraisal_cycles). */
export const APPRAISAL_CYCLE_STATUSES = [
  "draft",       // admin building KPI/skill/attitude items — invisible to employees
  "open",        // published — self-scoring window
  "review",      // manager + management scoring window
  "finalized",   // final scores locked
  "archived",
] as const;
export type AppraisalCycleStatus = (typeof APPRAISAL_CYCLE_STATUSES)[number];
export const APPRAISAL_CYCLE_STATUS_LABELS: Record<AppraisalCycleStatus, string> = {
  draft: "Draft",
  open: "Self-Scoring Open",
  review: "In Review",
  finalized: "Finalized",
  archived: "Archived",
};

/** Per-item scoring progress (the self → manager → management → final flow). */
export const APPRAISAL_ITEM_STATUSES = [
  "draft",               // admin still filling (KPI rows before approval)
  "awaiting_self",       // published, employee's self score pending
  "awaiting_manager",    // self done, manager score + MANDATORY explanation pending
  "awaiting_management", // manager done, management score pending
  "finalized",           // final score computed + locked
] as const;
export type AppraisalItemStatus = (typeof APPRAISAL_ITEM_STATUSES)[number];
export const APPRAISAL_ITEM_STATUS_LABELS: Record<AppraisalItemStatus, string> = {
  draft: "Draft",
  awaiting_self: "Awaiting Self Score",
  awaiting_manager: "Awaiting Manager",
  awaiting_management: "Awaiting Management",
  finalized: "Final",
};

/** The 3 human scoring stages + the computed final. Order is LAW:
 *  Self (+justification, optional attachment) → Manager (+MANDATORY
 *  explanation) → Management (+explanation) → Final. */
export const APPRAISAL_SCORE_STAGES = ["self", "manager", "management", "final"] as const;
export type AppraisalScoreStage = (typeof APPRAISAL_SCORE_STAGES)[number];

/** Default rating-term bands ("recognition/rate" labels) — ADMIN-EDITABLE via
 *  appraisal_config.rating_terms. `min` = inclusive lower bound of final %. */
export const DEFAULT_APPRAISAL_RATING_TERMS: ReadonlyArray<{ min: number; label: string }> = [
  { min: 90, label: "Outstanding" },
  { min: 75, label: "Exceeds Expectations" },
  { min: 60, label: "Meets Expectations" },
  { min: 40, label: "Needs Improvement" },
  { min: 0, label: "Unsatisfactory" },
];
