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

export interface VelocityPoint {
  date: string;
  created: number;
  completed: number;
}

export interface EmployeeStatusRow {
  employeeId: string;
  employeeName: string;
  department: string;
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
}

export interface TopPerformer {
  employeeId: string;
  employeeName: string;
  doneCount: number;
  weeklySparkline: number[];
  /** 1-based position in the GLOBAL ranking (ties share the better rank) —
   *  stays honest even when the dashboard is filtered to a subset of people. */
  rank: number;
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

export interface HeatmapCellTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: EisenhowerPriority;
  ageDays: number;
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

/** Punctuality computed against ONE due-date basis (original or revised). */
export interface PunctualityBasis {
  basis: "original" | "revised";
  total: number; dated: number; onTime: number; late: number; undated: number;
  onTimeRate: number;
  byPerson: PunctualityPerson[];      // reuse existing PunctualityPerson
  histogram: DoneAgingBandCount[];     // 12 signed bands, always all present
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
}

/** Declined ("not approved") tasks grouped per doer + a waiting-days histogram. */
export interface NotApprovedAging {
  total: number; byPerson: NotApprovedPerson[]; bands: NotApprovedBandCount[];
}

/** One of a manager's direct reports + how many tasks they were given vs the goal. */
export interface InitiatorReportRow { employeeId: string; employeeName: string; given: number; goal: number; hit: boolean }

/** Per-manager target-vs-actual: every initiated task classified into Direct
 *  Reports (counts toward target) / Counterparts / Founder-Management. */
export interface InitiatorScorecard {
  managerId: string; managerName: string; directReports: number;
  totalInitiated: number; toDirectReports: number; toCounterparts: number; toFounderMgmt: number;
  target: number; actual: number; attainmentPct: number;
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
  velocity: VelocityPoint[];
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
  completedAt: Date | null;
}
