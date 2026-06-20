import type { InitiatorScorecard, InitiatorReportRow } from "@/lib/types";

export interface InitiatorEmployee { id: string; name: string; managerId: string | null; email: string | null }
export interface InitiatedTask { initiatorId: string; doerId: string }

const PER_REPORT_PER_DAY = 3;

export function computeInitiatorScorecard(
  tasks: InitiatedTask[],
  employees: InitiatorEmployee[],
  workingDays: number,
  isFounder: (email: string | null) => boolean,
): InitiatorScorecard[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  // Direct reports per manager id.
  const reportsOf = new Map<string, InitiatorEmployee[]>();
  for (const e of employees) {
    if (e.managerId) {
      const list = reportsOf.get(e.managerId) ?? [];
      list.push(e);
      reportsOf.set(e.managerId, list);
    }
  }
  // Managers = anyone with ≥1 direct report.
  const managerIds = [...reportsOf.keys()];

  return managerIds
    .map((managerId): InitiatorScorecard => {
      const manager = byId.get(managerId);
      const reports = reportsOf.get(managerId) ?? [];
      const reportIds = new Set(reports.map((r) => r.id));
      const mine = tasks.filter((t) => t.initiatorId === managerId);

      let toDirectReports = 0, toCounterparts = 0, toFounderMgmt = 0;
      const givenByReport = new Map<string, number>();
      for (const t of mine) {
        if (reportIds.has(t.doerId)) {
          toDirectReports++;
          givenByReport.set(t.doerId, (givenByReport.get(t.doerId) ?? 0) + 1);
        } else if (isFounder(byId.get(t.doerId)?.email ?? null)) {
          toFounderMgmt++;
        } else {
          toCounterparts++;
        }
      }

      const goal = PER_REPORT_PER_DAY * workingDays;
      const target = reports.length * goal;
      const perReport: InitiatorReportRow[] = reports
        .map((r) => {
          const given = givenByReport.get(r.id) ?? 0;
          return { employeeId: r.id, employeeName: r.name, given, goal, hit: given >= goal };
        })
        .sort((a, b) => a.given - b.given || a.employeeName.localeCompare(b.employeeName));

      return {
        managerId,
        managerName: manager?.name ?? "Unknown",
        directReports: reports.length,
        totalInitiated: mine.length,
        toDirectReports, toCounterparts, toFounderMgmt,
        target, actual: toDirectReports,
        attainmentPct: target > 0 ? Math.round((toDirectReports / target) * 100) : 0,
        perReport,
      };
    })
    // Worst attainment first — surfaces managers not delegating.
    .sort((a, b) => a.attainmentPct - b.attainmentPct || b.directReports - a.directReports);
}
