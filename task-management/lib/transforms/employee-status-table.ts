import type { Employee, Task } from "@/db/schema";
import type { EmployeeStatusRow, ViewMode } from "@/lib/types";

/**
 * Optional membership map: employeeId → the departments they belong to.
 * When omitted, we fall back to the single primary department on the
 * employee row.
 *
 * NOTE: this used to emit one row PER department, so someone in 7 departments
 * produced 7 rows — each counting ALL of their tasks, not a share. That both
 * repeated the person and inflated every column total. Rows are now keyed by
 * employee alone and carry the full department list, so each task is counted
 * exactly once.
 */
export type DepartmentMembershipMap = Map<string, { name: string }[]>;

export function computeEmployeeStatusTable(
  tasks: Task[],
  employees: Employee[],
  view: ViewMode,
  departmentMap?: DepartmentMembershipMap,
): EmployeeStatusRow[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const rows = new Map<string, EmployeeStatusRow>();

  // Resolve the department names a person should be grouped under. Falls
  // back to their primary department (the legacy text column) when there's
  // no membership map or the person has no memberships.
  const departmentsFor = (emp: Employee): string[] => {
    const memberships = departmentMap?.get(emp.id);
    if (memberships && memberships.length > 0) {
      return memberships.map((m) => m.name);
    }
    return [emp.department ?? ""];
  };

  for (const t of tasks) {
    const id = view === "doer" ? t.doerId : t.initiatorId;
    const emp = employeeById.get(id);
    if (!emp) continue;

    // Keyed by employee only — ONE row per person.
    const rowKey = id;
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        employeeId: id,
        employeeName: emp.name,
        departments: departmentsFor(emp).filter((d) => d.length > 0),
        approved: 0,
        notApproved: 0,
        done: 0,
        transferred: 0,
        cancelled: 0,
        pendingTotal: 0,
        needHelp: 0,
        followUp: 0,
        initiated: 0,
        notStarted: 0,
        total: 0,
        criticalCount: 0,
      });
    }

    const row = rows.get(rowKey)!;
    row.total += 1;

    if (t.priority === "imp_urgent") {
      row.criticalCount += 1;
    }

    // Tier-3 (2026-05-20): the approval_status column is the new way
    // to record approved/not_approved/cancelled/transferred verdicts.
    // Bucket those first so they take priority over the lifecycle status.
    if (t.approvalStatus) {
      switch (t.approvalStatus) {
        case "approved":      row.approved   += 1; continue;
        case "not_approved":  row.notApproved += 1; continue;
        case "cancelled":     row.cancelled   += 1; continue;
        case "transferred":   row.transferred += 1; continue;
      }
    }
    switch (t.status) {
      case "approved":
        row.approved += 1;
        break;
      case "not_approved":
        row.notApproved += 1;
        break;
      case "done":
        row.done += 1;
        break;
      case "transferred":
        row.transferred += 1;
        break;
      case "cancelled":
        row.cancelled += 1;
        break;
      case "need_info":           // Tier-3 — rolls into the "need" bucket
                                  // (need_help retired 2026-06-10)
        row.needHelp += 1;
        row.pendingTotal += 1;
        break;
      case "follow_up":
      case "follow_up_1":         // Tier-3
      case "follow_up_2":         // Tier-3
      case "follow_up_3":         // Tier-3
        row.followUp += 1;
        row.pendingTotal += 1;
        break;
      case "initiated":
        row.initiated += 1;
        row.pendingTotal += 1;
        break;
      case "not_started":
        row.notStarted += 1;
        row.pendingTotal += 1;
        break;
    }
  }

  return [...rows.values()].sort((a, b) => b.total - a.total);
}
