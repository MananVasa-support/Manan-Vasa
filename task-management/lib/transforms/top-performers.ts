import type { Employee, Task } from "@/db/schema";
import type { TopPerformer } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COMPLETED_STATUSES = new Set(["done", "approved"]);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function computeTopPerformers(
  tasks: Task[],
  employees: Employee[],
  now: Date,
  limit: number,
): TopPerformer[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const counts = new Map<string, number>();
  const sparks = new Map<string, number[]>();

  const today = startOfDay(now);

  for (const t of tasks) {
    if (!COMPLETED_STATUSES.has(t.status)) continue;
    counts.set(t.doerId, (counts.get(t.doerId) ?? 0) + 1);

    const referenceDate = t.completedAt ?? t.createdAt;
    const d = startOfDay(referenceDate);
    const diff = Math.floor(
      (today.getTime() - d.getTime()) / MS_PER_DAY,
    );
    if (diff < 0 || diff >= 7) continue;
    if (!sparks.has(t.doerId)) sparks.set(t.doerId, new Array(7).fill(0));
    const idx = 6 - diff;
    sparks.get(t.doerId)![idx]! += 1;
  }

  const ranked: TopPerformer[] = [...counts.entries()]
    .map(([employeeId, doneCount]) => {
      const emp = employeeById.get(employeeId);
      if (!emp) return null;
      return {
        employeeId,
        employeeName: emp.name,
        doneCount,
        weeklySparkline: sparks.get(employeeId) ?? new Array(7).fill(0),
      } satisfies TopPerformer;
    })
    .filter((x): x is TopPerformer => x !== null)
    .sort((a, b) => b.doneCount - a.doneCount)
    .slice(0, limit);

  return ranked;
}
