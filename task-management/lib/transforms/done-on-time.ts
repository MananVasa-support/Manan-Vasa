import type { DoneOnTime, PunctualityBasis, PunctualityPerson } from "@/lib/types";
import { DONE_AGING_BANDS, bucketSignedDays } from "./aging-bands";

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
): PunctualityBasis {
  let onTime = 0, late = 0, undated = 0;
  const per = new Map<string, { onTime: number; late: number; spread: PunctualityPerson["lateSpread"] }>();
  const hist = new Map(DONE_AGING_BANDS.map((b) => [b.id, 0]));

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

  return {
    basis,
    total: done.length, dated, onTime, late, undated,
    onTimeRate: dated > 0 ? Math.round((onTime / dated) * 100) : 0,
    byPerson,
    histogram: DONE_AGING_BANDS.map((b) => ({ id: b.id, label: b.label, count: hist.get(b.id) ?? 0 })),
  };
}

export function computeDoneOnTime(
  tasks: DoneOnTimeTask[],
  nameById: Map<string, string>,
): DoneOnTime {
  const done = tasks.filter((t) => t.status === "done" && !t.archived);
  return {
    original: basisFor(done, (t) => t.originalDueAt, "original", nameById),
    revised: basisFor(done, (t) => t.dueAt, "revised", nameById),
  };
}
