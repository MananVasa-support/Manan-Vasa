import type { ContractInput, InstallmentSpec } from "./types";

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  // Move to the first of the target month, then clamp the day to that month's length.
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth(); // 0-based
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return new Date(Date.UTC(ty, tm, day)).toISOString().slice(0, 10);
}

function monthsBetweenInclusive(start: string, end: string): number {
  const [ys, ms] = start.split("-").map(Number) as [number, number, number];
  const [ye, me] = end.split("-").map(Number) as [number, number, number];
  return (ye - ys) * 12 + (me - ms) + 1;
}

export function generateSchedule(c: ContractInput, horizon: string): InstallmentSpec[] {
  const amount = Math.round(c.baseAmount * (100 + c.gstRate) / 100);
  if (c.cycle === "full_payment") {
    return [{ contractId: c.id, periodIndex: 0, dueDate: c.startDate, amount }];
  }
  let count: number;
  if (c.periods != null) count = c.periods;
  else if (c.endDate) count = Math.max(0, monthsBetweenInclusive(c.startDate, c.endDate));
  else count = Math.max(0, monthsBetweenInclusive(c.startDate, horizon));
  const out: InstallmentSpec[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ contractId: c.id, periodIndex: i, dueDate: addMonths(c.startDate, i), amount });
  }
  return out;
}
