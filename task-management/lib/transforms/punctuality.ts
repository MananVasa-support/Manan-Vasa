import type { Task } from "@/lib/db";
import type { Punctuality } from "@/lib/types";

/**
 * D16 — "delivered on time vs late" for the dashboard.
 *
 * Universe: tasks with the live `done` status that are NOT archived (per the
 * spec — `approved`/archived are explicitly excluded). "On time" means the task
 * was completed on or before its EFFECTIVE due day: revised target date when
 * present, else the original `due_at` (the caller projects `dueAt` through that
 * COALESCE, so `t.dueAt` here is already effective). The comparison is by
 * CALENDAR DAY (UTC), matching the dashboard's overdue rule — finishing any time
 * on the due date counts as on time, not late.
 *
 * Done tasks without a `completed_at` (legacy / imported) can't be classified;
 * they're surfaced separately as `undated` and excluded from the rate.
 */

/** UTC calendar-day ordinal (days since epoch) for a timestamp. */
function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

export function computePunctuality(
  tasks: Task[],
  nameById: Map<string, string>,
): Punctuality {
  const done = tasks.filter((t) => t.status === "done" && !t.archived);

  let onTime = 0;
  let late = 0;
  let undated = 0;
  const per = new Map<string, { onTime: number; late: number }>();

  for (const t of done) {
    if (!t.completedAt || !t.dueAt) {
      undated++;
      continue;
    }
    const isOnTime = utcDay(t.completedAt) <= utcDay(t.dueAt);
    if (isOnTime) onTime++;
    else late++;
    const p = per.get(t.doerId) ?? { onTime: 0, late: 0 };
    if (isOnTime) p.onTime++;
    else p.late++;
    per.set(t.doerId, p);
  }

  const dated = onTime + late;
  const byPerson = [...per.entries()]
    .map(([employeeId, v]) => {
      const personDone = v.onTime + v.late;
      return {
        employeeId,
        employeeName: nameById.get(employeeId) ?? "Unknown",
        done: personDone,
        onTime: v.onTime,
        late: v.late,
        rate: personDone > 0 ? Math.round((v.onTime / personDone) * 100) : 0,
      };
    })
    // Busiest first; ties broken by the WORSE on-time rate so slippage surfaces.
    .sort((a, b) => b.done - a.done || a.rate - b.rate);

  return {
    total: done.length,
    dated,
    onTime,
    late,
    undated,
    onTimeRate: dated > 0 ? Math.round((onTime / dated) * 100) : 0,
    byPerson,
  };
}
