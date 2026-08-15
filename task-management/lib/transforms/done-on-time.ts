import type {
  DoneOnTime,
  PunctualityBasis,
  PunctualityDepartment,
  PunctualityPerson,
} from "@/lib/types";
import { DONE_AGING_BANDS, bucketSignedDays } from "./aging-bands";

/** Minimal shape of the dashboard's employee→departments membership map. */
export type DeptRef = { id: string; name: string; isPrimary: boolean };
export type DeptByEmployee = Map<string, DeptRef[]>;

/** The department a doer is counted under — their primary, else the first
 *  membership, else nothing (they're then left out of the rollup entirely
 *  rather than lumped into a fake "Unassigned" bucket). */
function primaryDept(refs: DeptRef[] | undefined): DeptRef | null {
  if (!refs || refs.length === 0) return null;
  return refs.find((d) => d.isPrimary) ?? refs[0] ?? null;
}

export interface DoneOnTimeTask {
  status: string;
  archived: boolean;
  completedAt: Date | string | null;
  dueAt: Date | string | null;          // effective (revised ?? original)
  originalDueAt: Date | string | null;  // raw due_at
  doerId: string;
}

function utcDayKey(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}
function dayNumber(d: Date | string): number {
  return Math.floor(new Date(`${utcDayKey(d)}T00:00:00Z`).getTime() / 86_400_000);
}

function lateBucket(daysLate: number): keyof PunctualityPerson["lateSpread"] | null {
  if (daysLate <= 1) return null;       // 1-day-late not shown in the spread
  if (daysLate <= 3) return "d2_3";
  if (daysLate <= 7) return "d4_7";
  if (daysLate <= 14) return "d8_14";
  return "d15";
}

function basisFor(
  done: DoneOnTimeTask[],
  pick: (t: DoneOnTimeTask) => Date | string | null,
  basis: "original" | "revised",
  nameById: Map<string, string>,
  deptByEmployee?: DeptByEmployee,
): PunctualityBasis {
  let onTime = 0, late = 0, undated = 0;
  const per = new Map<string, { onTime: number; late: number; spread: PunctualityPerson["lateSpread"] }>();
  const hist = new Map(DONE_AGING_BANDS.map((b) => [b.id, 0]));
  // departmentId → running tally, filled only when a membership map is given.
  const perDept = new Map<string, { name: string; onTime: number; late: number }>();

  for (const t of done) {
    const due = pick(t);
    if (!t.completedAt || !due) { undated++; continue; }
    const signed = dayNumber(due) - dayNumber(t.completedAt); // + early, - late
    const isOnTime = signed >= 0;
    if (isOnTime) onTime++; else late++;
    hist.set(bucketSignedDays(signed), (hist.get(bucketSignedDays(signed)) ?? 0) + 1);
    const p = per.get(t.doerId) ?? { onTime: 0, late: 0, spread: { d2_3: 0, d4_7: 0, d8_14: 0, d15: 0 } };
    if (isOnTime) {
      p.onTime++;
    } else {
      p.late++;
      const b = lateBucket(-signed); // -signed = days late
      if (b) p.spread[b]++;
    }
    per.set(t.doerId, p);

    const dept = deptByEmployee ? primaryDept(deptByEmployee.get(t.doerId)) : null;
    if (dept) {
      const d = perDept.get(dept.id) ?? { name: dept.name, onTime: 0, late: 0 };
      if (isOnTime) d.onTime++; else d.late++;
      perDept.set(dept.id, d);
    }
  }

  const dated = onTime + late;
  const byPerson: PunctualityPerson[] = [...per.entries()]
    .map(([employeeId, v]) => {
      const personDone = v.onTime + v.late;
      return {
        employeeId,
        employeeName: nameById.get(employeeId) ?? "Unknown",
        done: personDone, onTime: v.onTime, late: v.late,
        rate: personDone > 0 ? Math.round((v.onTime / personDone) * 100) : 0,
        lateSpread: v.spread,
      };
    })
    .sort((a, b) => b.done - a.done || a.rate - b.rate);

  // Busiest department first, then worst rate — same ordering rule as byPerson,
  // so the row most worth acting on is nearest the top.
  const byDepartment: PunctualityDepartment[] = [...perDept.entries()]
    .map(([departmentId, v]) => {
      const deptDone = v.onTime + v.late;
      return {
        departmentId,
        departmentName: v.name,
        done: deptDone, onTime: v.onTime, late: v.late,
        rate: deptDone > 0 ? Math.round((v.onTime / deptDone) * 100) : 0,
      };
    })
    .sort((a, b) => b.done - a.done || a.rate - b.rate);

  return {
    basis,
    total: done.length, dated, onTime, late, undated,
    onTimeRate: dated > 0 ? Math.round((onTime / dated) * 100) : 0,
    byPerson,
    histogram: DONE_AGING_BANDS.map((b) => ({ id: b.id, label: b.label, count: hist.get(b.id) ?? 0 })),
    byDepartment,
  };
}

export function computeDoneOnTime(
  tasks: DoneOnTimeTask[],
  nameById: Map<string, string>,
  /** employeeId → departments. Omit and `byDepartment` comes back empty. */
  deptByEmployee?: DeptByEmployee,
): DoneOnTime {
  const done = tasks.filter((t) => t.status === "done" && !t.archived);
  return {
    original: basisFor(done, (t) => t.originalDueAt, "original", nameById, deptByEmployee),
    revised: basisFor(done, (t) => t.dueAt, "revised", nameById, deptByEmployee),
  };
}
