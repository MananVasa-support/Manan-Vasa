import type { Employee, Task } from "@/db/schema";
import type { EmployeeStatusRow, ViewMode } from "@/lib/types";

export function computeEmployeeStatusTable(
  tasks: Task[],
  employees: Employee[],
  view: ViewMode,
): EmployeeStatusRow[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const rows = new Map<string, EmployeeStatusRow>();

  for (const t of tasks) {
    const id = view === "doer" ? t.doerId : t.initiatorId;
    const emp = employeeById.get(id);
    if (!emp) continue;

    if (!rows.has(id)) {
      rows.set(id, {
        employeeId: id,
        employeeName: emp.name,
        department: emp.department ?? "",
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

    const row = rows.get(id)!;
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
      case "need_help":
      case "need_info":           // Tier-3 — rolls into the "need" bucket
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
