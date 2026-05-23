import { and, eq, gte, inArray, lt, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, employees, tasks } from "@/lib/db";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/db/enums";
import { employeeIdsInDepartments } from "@/lib/queries/departments";
import type { TaskListFilters, TaskListRow } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function listTasks(filters: TaskListFilters): Promise<TaskListRow[]> {
  const conditions = [eq(tasks.archived, filters.archived)];

  if (filters.startDate) conditions.push(gte(tasks.createdAt, filters.startDate));
  if (filters.endDate)
    conditions.push(lt(tasks.createdAt, new Date(filters.endDate.getTime() + MS_PER_DAY)));
  if (filters.statuses.length > 0)   conditions.push(inArray(tasks.status, filters.statuses));
  if (filters.doerIds.length > 0)    conditions.push(inArray(tasks.doerId, filters.doerIds));
  if (filters.initiatorIds.length > 0)
    conditions.push(inArray(tasks.initiatorId, filters.initiatorIds));
  if (filters.priorities.length > 0) conditions.push(inArray(tasks.priority, filters.priorities));
  if (filters.subjects.length > 0)   conditions.push(inArray(tasks.subject, filters.subjects));
  if (filters.taskId)                conditions.push(eq(tasks.id, filters.taskId));

  if (filters.departments.length > 0) {
    // Match tasks whose doer belongs to ANY selected department, via the
    // membership join table (not just their primary department).
    const ids = await employeeIdsInDepartments(filters.departments);
    if (ids.length === 0) return [];
    conditions.push(inArray(tasks.doerId, ids));
  }

  const baseRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      subject: tasks.subject,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      dueAt: tasks.dueAt,
      archived: tasks.archived,
      doerId: tasks.doerId,
      doerName: employees.name,
      doerDept: employees.department,
      initiatorId: tasks.initiatorId,
      // M2.1 additions:
      createdById: tasks.createdById,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.doerId, employees.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(1000);

  // Fetch initiator names in one extra query
  const initiatorIds = Array.from(new Set(baseRows.map((r) => r.initiatorId)));
  let initiatorNameById = new Map<string, string>();
  if (initiatorIds.length > 0) {
    const initRows = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, initiatorIds));
    initiatorNameById = new Map(initRows.map((r) => [r.id, r.name]));
  }

  const now = Date.now();
  return baseRows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subject,
    status: r.status,
    priority: r.priority,
    doerId: r.doerId,
    doerName: r.doerName ?? null,
    doerDept: r.doerDept ?? null,
    initiatorId: r.initiatorId,
    initiatorName: initiatorNameById.get(r.initiatorId) ?? null,
    createdAt: r.createdAt,
    dueAt: r.dueAt,
    ageDays: Math.floor((now - r.createdAt.getTime()) / MS_PER_DAY),
    archived: r.archived,
    createdById: r.createdById,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Row shape for CSV export — superset of TaskListRow with `completedAt`,
 * `approvedAt`, `shortId`, `updatedAt`, and department included. Kept
 * separate from TaskListRow to avoid bloating the UI hot path.
 */
export interface TaskExportRow {
  id: string;
  shortId: string | null;
  subject: string | null;
  title: string;
  status: (typeof TASK_STATUSES)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  doerName: string | null;
  initiatorName: string | null;
  department: string | null;
  createdAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  approvedAt: Date | null;
  updatedAt: Date;
  archived: boolean;
  // Tier-3 (2026-05-20) additions — surfaced for XLSX/PDF exports.
  tags: string[] | null;
  approvalStatus: "approved" | "not_approved" | "cancelled" | "transferred" | null;
  revisedTargetDate: Date | null;
}

/**
 * Same filter semantics as `listTasks` but projects the columns the CSV
 * export needs (including completed_at + approved_at) and accepts a
 * larger row cap. Defaults to 10_000 rows — far above the dashboard's
 * 1k UI ceiling — to keep the response bounded.
 */
export async function listTasksForExport(
  filters: TaskListFilters,
  opts: { limit?: number } = {},
): Promise<TaskExportRow[]> {
  const limit = opts.limit ?? 10_000;
  const conditions = [eq(tasks.archived, filters.archived)];

  if (filters.startDate) conditions.push(gte(tasks.createdAt, filters.startDate));
  if (filters.endDate)
    conditions.push(lt(tasks.createdAt, new Date(filters.endDate.getTime() + MS_PER_DAY)));
  if (filters.statuses.length > 0)   conditions.push(inArray(tasks.status, filters.statuses));
  if (filters.doerIds.length > 0)    conditions.push(inArray(tasks.doerId, filters.doerIds));
  if (filters.initiatorIds.length > 0)
    conditions.push(inArray(tasks.initiatorId, filters.initiatorIds));
  if (filters.priorities.length > 0) conditions.push(inArray(tasks.priority, filters.priorities));
  if (filters.subjects.length > 0)   conditions.push(inArray(tasks.subject, filters.subjects));
  if (filters.taskId)                conditions.push(eq(tasks.id, filters.taskId));

  if (filters.departments.length > 0) {
    // Match tasks whose doer belongs to ANY selected department, via the
    // membership join table (not just their primary department).
    const ids = await employeeIdsInDepartments(filters.departments);
    if (ids.length === 0) return [];
    conditions.push(inArray(tasks.doerId, ids));
  }

  const doerEmp = alias(employees, "doer_emp");
  const initEmp = alias(employees, "init_emp");

  const rows = await db
    .select({
      id: tasks.id,
      shortId: tasks.shortId,
      title: tasks.title,
      subject: tasks.subject,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      approvedAt: tasks.approvedAt,
      updatedAt: tasks.updatedAt,
      archived: tasks.archived,
      doerName: doerEmp.name,
      department: doerEmp.department,
      initiatorName: initEmp.name,
      tags: tasks.tags,
      approvalStatus: tasks.approvalStatus,
      revisedTargetDate: tasks.revisedTargetDate,
    })
    .from(tasks)
    .leftJoin(doerEmp, eq(tasks.doerId, doerEmp.id))
    .leftJoin(initEmp, eq(tasks.initiatorId, initEmp.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    shortId: r.shortId ?? null,
    title: r.title,
    subject: r.subject,
    status: r.status,
    priority: r.priority,
    doerName: r.doerName ?? null,
    initiatorName: r.initiatorName ?? null,
    department: r.department ?? null,
    createdAt: r.createdAt,
    dueAt: r.dueAt,
    completedAt: r.completedAt,
    approvedAt: r.approvedAt,
    updatedAt: r.updatedAt,
    archived: r.archived,
    tags: r.tags ?? null,
    approvalStatus: r.approvalStatus,
    revisedTargetDate: r.revisedTargetDate,
  }));
}

export async function listDistinctSubjects(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ subject: tasks.subject })
    .from(tasks);
  return rows
    .map((r) => r.subject)
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .sort();
}

export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  notes: string | null;
  status: (typeof TASK_STATUSES)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  createdAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  archived: boolean;
  doerId: string;
  doerName: string | null;
  initiatorId: string;
  initiatorName: string | null;
  createdById: string | null;
  creatorName: string | null;
  updatedAt: Date;
  // Tier-3 (2026-05-20) additions
  tags: string[] | null;
  approvalStatus: "approved" | "not_approved" | "cancelled" | "transferred" | null;
  revisedTargetDate: Date | null;
  // Tier-4 (2026-05-20) — GCal-style scheduling
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  recurrence: string | null;
};

export async function getTaskById(taskId: string): Promise<TaskDetail | null> {
  const doerEmp      = alias(employees, "doer_emp");
  const initEmp      = alias(employees, "init_emp");
  const creatorEmp   = alias(employees, "creator_emp");

  const [row] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      subject: tasks.subject,
      notes: tasks.notes,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      archived: tasks.archived,
      doerId: tasks.doerId,
      doerName: doerEmp.name,
      initiatorId: tasks.initiatorId,
      initiatorName: initEmp.name,
      createdById: tasks.createdById,
      creatorName: creatorEmp.name,
      updatedAt: tasks.updatedAt,
      tags: tasks.tags,
      approvalStatus: tasks.approvalStatus,
      revisedTargetDate: tasks.revisedTargetDate,
      startsAt: tasks.startsAt,
      endsAt: tasks.endsAt,
      allDay: tasks.allDay,
      recurrence: tasks.recurrence,
    })
    .from(tasks)
    .leftJoin(doerEmp,    eq(tasks.doerId,      doerEmp.id))
    .leftJoin(initEmp,    eq(tasks.initiatorId, initEmp.id))
    .leftJoin(creatorEmp, eq(tasks.createdById, creatorEmp.id))
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!row) return null;
  return row as TaskDetail;
}
