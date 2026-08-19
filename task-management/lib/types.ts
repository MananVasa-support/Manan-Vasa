import type { FineBucketKey } from "@/lib/transforms/aging-buckets-fine";
import type { TaskStatus, AgeBucketId, Department } from "@/db/enums";

export type ViewMode = "doer" | "initiator";

export type EisenhowerPriority =
  | "imp_urgent"
  | "imp_not_urgent"
  | "not_imp_urgent"
  | "not_imp_not_urgent";

export interface DashboardFilters {
  startDate: Date | null;
  endDate: Date | null;
  employeeIds: string[];
  view: ViewMode;
  departments: Department[];
  priorities: EisenhowerPriority[];
  subjects: string[];
}

export interface KpiTotals {
  total: number;
  pending: number;     // initiated + follow_up only
  notStarted: number;
  needHelp: number;
  done: number;        // done + approved
  notApproved: number;
}

export interface KpiWithDelta {
  current: number;
  previous: number;
  sparkline: number[];
}

export interface KpiSet {
  total: KpiWithDelta;
  pending: KpiWithDelta;
  notStarted: KpiWithDelta;
  needHelp: KpiWithDelta;
  done: KpiWithDelta;
  notApproved: KpiWithDelta;
}

export interface StatusDistributionPayload {
  rows: StatusDistribution[];
  denominator: number; // total − approved
  /** Headline counts surfaced as their own cards beneath the chart.
   *  pending = open & awaiting a verdict; notApproved = declined;
   *  archived = removed from active boards. */
  summary: {
    pending: number;
    notApproved: number;
    archived: number;
  };
}

export interface StatusDistribution {
  status: TaskStatus;
  count: number;
}

/** The six count columns the Status-by-Doer table renders, keyed by the field
 *  they read. Used to key the hover previews below. */
export type StatusCellBucket =
  | "criticalCount"
  | "done"
  | "pendingTotal"
  | "notApproved"
  | "cancelled"
  | "total";

/** One line in a status-cell hover preview. Deliberately minimal — this ships
 *  to the client for every non-zero cell, so it carries only what the popover
 *  draws. */
export interface StatusCellTask {
  id: string;
  taskNo: number | null;
  title: string;
  client: string | null;
  subject: string | null;
  dueAt: Date | null;
}

export interface EmployeeStatusRow {
  employeeId: string;
  employeeName: string;
  /** Every department this person belongs to. One row per EMPLOYEE (not per
   *  department), so the metric columns below count each task exactly once. */
  departments: string[];
  approved: number;
  notApproved: number;
  done: number;
  transferred: number;
  cancelled: number;
  pendingTotal: number;
  needHelp: number;
  followUp: number;
  initiated: number;
  notStarted: number;
  total: number;
  /** tasks with priority = imp_urgent */
  criticalCount: number;
  /** Hover-preview tasks per count column, most-urgent first, capped.
   *  Built in the SAME pass as the counts (see computeEmployeeStatusTable), so
   *  a preview can never disagree with the badge above it. Absent for any
   *  bucket whose count is 0, which is what keeps the payload small. */
  previews: Partial<Record<StatusCellBucket, StatusCellTask[]>>;
}

export interface TopPerformer {
  employeeId: string;
  employeeName: string;
  doneCount: number;
  weeklySparkline: number[];
  /** 1-based position in the GLOBAL ranking (ties share the better rank) —
   *  stays honest even when the dashboard is filtered to a subset of people. */
  rank: number;
  /** Free-text department, for the row's role pill. Null when unset. */
  department: string | null;
  /** Completions finished on or before the due date. The numerator. */
  completedOnTime: number;
  /** Completions that carry BOTH a completion and a due date — the only ones
   *  that can be judged on time. The denominator, and the reason `onTimeRate`
   *  can be null while `doneCount` is high: undated work is unmeasurable, not
   *  late. Surfaced so the card can show "7 / 9 on time" and the percentage is
   *  auditable rather than a bare number the viewer has to trust. */
  datedCompletions: number;
  /** `completedOnTime / datedCompletions * 100`, 0-100. Null when
   *  `datedCompletions` is 0 — distinct from 0%, which would libel someone with
   *  no measurable work. */
  onTimeRate: number | null;
  /** Mean days from creation to completion. Null when nothing is measurable. */
  avgTurnaroundDays: number | null;
}

export interface AgingRow {
  employeeId: string;
  employeeName: string;
  buckets: Record<AgeBucketId, number>;
  total: number;
}

export interface AgingHeatmapCell {
  employeeId: string;
  bucket: AgeBucketId;
  count: number;
}

export interface AgingByDate {
  bucket: AgeBucketId;
  count: number;
}

/**
 * One pending task behind an aging-heatmap cell.
 *
 * Carries enough to render the drill-down drawer's table WITHOUT a second
 * query: the drawer opens on the same rows the lane counted, bucketed by the
 * same rule, so it can never disagree with the bar that opened it. The
 * permission/lock fields (createdById, initiatorId, doerId, updatedAt) are what
 * let the drawer host the same inline status cell the tasks table uses.
 */
export interface HeatmapCellTask {
  id: string;
  taskNo: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: EisenhowerPriority;
  ageDays: number;
  /** Effective due date (revised ?? original) — what `ageDays` measures against. */
  dueAt: Date | null;
  /** The raw, pre-revision due date. Differs from `dueAt` only when moved. */
  originalDueAt: Date | null;
  doerId: string;
  doerName: string | null;
  initiatorId: string;
  initiatorName: string | null;
  createdById: string | null;
  updatedAt: Date;
  archived: boolean;
}

export interface AgingHeatmapData {
  // employeeId -> bucketId -> HeatmapCellTask[]
  byCell: Record<string, Record<string, HeatmapCellTask[]>>;
}

/** Operational summary metrics surfaced when a KPI card is expanded. All
 *  respect the active dashboard filters (date / employee / department / etc.). */
export interface WmsSummary {
  overdue: number;          // open & past due
  dueToday: number;         // open & due today
  dueThisWeek: number;      // open & due within 7 days
  completionRate: number;   // done ÷ total, %
  approvalRate: number;     // approved ÷ (approved + not_approved), %
  avgAgeDays: number;       // mean age of open tasks
  avgTimeToDoneDays: number; // mean created→completed for completed tasks
}

/** D16 — punctuality of DELIVERED work. "On time" = a `done` task whose
 *  completion day is on/before its EFFECTIVE due day (revised ?? original).
 *  Uses the live `done` status only — never `approved` or archived. */
export interface PunctualityPerson {
  employeeId: string;
  employeeName: string;
  /** Dated done tasks (onTime + late). */
  done: number;
  onTime: number;
  late: number;
  /** onTime ÷ done, % (0 when none). */
  rate: number;
  /** Late done tasks bucketed by days late (sums ≤ late). */
  lateSpread: { d2_3: number; d4_7: number; d8_14: number; d15: number };
}

export interface Punctuality {
  /** All done & non-archived tasks in scope (incl. undated). */
  total: number;
  /** Done tasks that carry a completed_at (the on-time/late denominator). */
  dated: number;
  onTime: number;
  late: number;
  /** Done but with no completed_at timestamp — can't be classified. */
  undated: number;
  /** onTime ÷ dated, %. */
  onTimeRate: number;
  /** Per-doer breakdown, busiest first. */
  byPerson: PunctualityPerson[];
}

/** A single signed early/late aging band with its done-task count. */
export interface DoneAgingBandCount { id: string; label: string; count: number }

/** On-time delivery rolled up to a department, for the gauge's expanded view.
 *  A doer is counted under their PRIMARY department only, so the rows never
 *  double-count someone who belongs to several. */
export interface PunctualityDepartment {
  departmentId: string;
  departmentName: string;
  /** Dated done tasks (onTime + late). */
  done: number;
  onTime: number;
  late: number;
  /** onTime ÷ done, % (0 when none). */
  rate: number;
}

/** Punctuality computed against ONE due-date basis (original or revised). */
export interface PunctualityBasis {
  basis: "original" | "revised";
  total: number; dated: number; onTime: number; late: number; undated: number;
  onTimeRate: number;
  byPerson: PunctualityPerson[];      // reuse existing PunctualityPerson
  histogram: DoneAgingBandCount[];     // 12 signed bands, always all present
  byDepartment: PunctualityDepartment[]; // busiest first; [] when unmapped
}

/** On-time delivery measured against both the original and the revised due date. */
export interface DoneOnTime { original: PunctualityBasis; revised: PunctualityBasis }

/** A single positive "days waiting" band with its declined-task count. */
export interface NotApprovedBandCount { id: string; label: string; count: number }

/** One declined task, aged by days since it was sent back. */
export interface NotApprovedTask { id: string; title: string; waitingDays: number }

/** A doer with their outstanding declined tasks, oldest-waiting first. */
export interface NotApprovedPerson {
  employeeId: string; employeeName: string; count: number; tasks: NotApprovedTask[];
  /** Free-text department, for the roster's role tag. Null when unset. */
  department: string | null;
}

/** Declined ("not approved") tasks grouped per doer + a waiting-days histogram. */
export interface NotApprovedAging {
  total: number; byPerson: NotApprovedPerson[]; bands: NotApprovedBandCount[];
}

/** One of a manager's direct reports + how many tasks they were given vs the goal. */
export interface InitiatorReportRow {
  employeeId: string; employeeName: string; given: number; goal: number; hit: boolean;
  /** How many direct reports THIS person has — the hierarchy context. */
  reportCount: number;
  /** Tasks the manager pushed past this report, into their own team. */
  downlineGiven: number;
}

/** Per-manager target-vs-actual: every initiated task classified into exactly
 *  one delegation channel — Direct (the only one that counts toward target),
 *  Downline, Counterpart, Founder/Management, or Self. */
export interface InitiatorScorecard {
  managerId: string; managerName: string; directReports: number;
  totalInitiated: number;
  toDirectReports: number; toDownline: number; toCounterparts: number;
  toFounderMgmt: number; toSelf: number;
  target: number; actual: number; attainmentPct: number;
  /** Carried so the card can render its own "Target = 5 × N × reports" caption
   *  from the same numbers the target was computed with. */
  workingDays: number; perReportPerDay: number;
  perReport: InitiatorReportRow[];
}

export interface InitiatorBoard { windowDays: number; workingDays: number; managers: InitiatorScorecard[] }

export interface DashboardData {
  kpis: KpiSet;
  wmsSummary: WmsSummary;
  punctuality: Punctuality;
  doneOnTime: DoneOnTime;
  notApprovedAging: NotApprovedAging;
  initiator: { d3: InitiatorBoard; d7: InitiatorBoard };
  pullQuote: string;
  statusTable: EmployeeStatusRow[];
  statusDistribution: StatusDistributionPayload;
  topPerformers: TopPerformer[];
  agingTable: AgingRow[];
  agingHeatmap: AgingHeatmapCell[];
  agingByDate: AgingByDate[];
  agingHeatmapData: AgingHeatmapData;
  generatedAt: Date;
}

export interface TaskListFilters {
  startDate: Date | null;
  endDate: Date | null;
  statuses: TaskStatus[];
  doerIds: string[];
  initiatorIds: string[];
  departments: Department[];
  priorities: EisenhowerPriority[];
  subjects: string[];
  clients: string[];
  taskId: string | null;
  archived: boolean;
  /** `?overdue=true` — only OPEN tasks whose effective due date is already
   *  past. A cross-cut, not a status: it narrows within whatever statuses are
   *  selected rather than replacing them. Terminal work is excluded because a
   *  task that is done is no longer late, it is finished. */
  overdue: boolean;
  /** `?age_range=<slug>` — one of the nine fine aging buckets, as a signed
   *  day-window around the effective due date. Null when unset. Stored as the
   *  bucket KEY (the human label) because that is what the chart, the chip and
   *  FINE_BUCKET_OFFSETS all key on; the slug exists only for the URL. */
  ageRange: FineBucketKey | null;
  /** Team scope from the toolbar's Team dropdown. Comma-separated in the URL,
   *  and a UNION when several are picked — "Sales or App Dev", not the
   *  intersection, because nobody is in two teams at once and an intersection
   *  would always be empty.
   *  - []        : no team scoping
   *  - "mine"    : the viewer + everyone below them in the org chart
   *  - a Department name : that department group
   *  Resolved to concrete employee ids in lib/queries/tasks.ts, because
   *  expanding "mine" needs the org tree and the parser is intentionally
   *  DB-free. */
  teams: string[];
  /** The signed-in employee, carried so `team=mine` can be expanded server-side. */
  viewerId: string | null;
  /** How the assignee filter was resolved.
   *  - "default":  no `emp` URL param + a defaultDoerId was supplied (non-admin
   *                default-to-me scope). `doerIds` will be `[defaultDoerId]`.
   *  - "all":      either `emp` was absent for an admin, or `emp=all` was
   *                explicitly set. `doerIds` is `[]`.
   *  - "specific": `emp=<one-or-more-ids>` was explicitly set. */
  assigneeMode: "default" | "all" | "specific";
}

export interface TaskListRow {
  id: string;
  /** Friendly sequential task number (#1042). Null only until the backfill
   *  migration has run. */
  taskNo: number | null;
  title: string;
  subject: string | null;
  client: string | null;
  /** Full task body — used by the hover-to-preview popover in the table. */
  description: string | null;
  status: TaskStatus;
  priority: EisenhowerPriority;
  doerId: string;
  doerName: string | null;
  doerDept: string | null;
  initiatorId: string;
  initiatorName: string | null;
  createdAt: Date;
  dueAt: Date;
  ageDays: number;
  archived: boolean;
  createdById: string | null;
  updatedAt: Date;
  approvalStatus: "approved" | "not_approved" | "cancelled" | "transferred" | null;
  firstReadAt: Date | null;
  /** When work was FIRST started on this task — task_time_rollup.first_started_at,
   *  i.e. the first `work_started` time event. Null until someone hits Start.
   *  Distinct from createdAt (when it was raised) and firstReadAt (when the doer
   *  opened it): a task can sit read-but-untouched for days. */
  startedAt: Date | null;
  completedAt: Date | null;
  /** A work session is open right now — task_time_rollup.open_session_count > 0.
   *  Drives the inline Start/Stop control in the table. Read from the rollup
   *  rather than task_work_sessions so it costs no extra join: the rollup is
   *  already joined for `startedAt`. */
  timerRunning: boolean;
}
