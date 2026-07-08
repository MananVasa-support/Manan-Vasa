import "server-only";
import { and, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  incentiveEntries,
  incentiveParticipants,
  incentiveProjects,
  incentiveTargets,
  type IncentiveParticipant,
} from "@/db/schema";

/**
 * WS-4 Phase B2 — Booked / Accrued / Paid reporting producer.
 *
 * This is a NEW, additive read that powers the incentive page's "Booked /
 * Accrued / Paid" tab. It reads the SAME three ledgers as the dashboard
 * (permanent entries, project legs, N-way participants) plus `incentive_targets`,
 * and rolls up per-person and total:
 *
 *   • Target   — sum of incentive_targets rows in the calendar `year`.
 *   • Booked    — client made a PARTIAL payment (WS-4 status model).
 *   • Accrued   — client paid in FULL (earnings basis; backfilled = approved).
 *   • Paid      — WE paid the employee (payout basis; this is the PMS/salary key).
 *
 * It DOES NOT edit or duplicate the frozen shared-key contracts. The canonical
 * PAID producer is `getIncentivePaidByPerson(month)` in lib/queries/incentives.ts;
 * this report's PAID column uses the identical leg/participant precedence
 * (participants REPLACE their parent's own leg when present, no double-count) so
 * the numbers agree with that contract, aggregated across the whole year.
 *
 * All money is numeric(14,2) — Drizzle returns strings, so parse with Number().
 * Excluded operational actors are dropped from every roll-up, matching the
 * dashboard's EXCLUDED set.
 */

// Mirror lib/queries/incentives.ts EXCLUDED — operational/admin actors that must
// not count toward any roll-up. Kept local (additive file, no shared-file edit).
const EXCLUDED = new Set<string>(["Manan Vasa", "Dattaram Kap", "Parvez Khan"]);

function num(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isExcluded(name: string | null | undefined): boolean {
  return name ? EXCLUDED.has(name.trim()) : false;
}

function isNone(name: string | null | undefined): boolean {
  return !name || name.trim().toLowerCase() === "none";
}

function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

/** Per-person Target vs Booked / Accrued / Paid for the calendar year. */
export interface IncentiveStatusRow {
  empName: string;
  target: number;
  booked: number;
  accrued: number;
  paid: number;
  /** actual / target × 100, or null when no target is set. One per basis. */
  bookedPct: number | null;
  accruedPct: number | null;
  paidPct: number | null;
}

export interface IncentiveStatusTotals {
  target: number;
  booked: number;
  accrued: number;
  paid: number;
  bookedPct: number | null;
  accruedPct: number | null;
  paidPct: number | null;
}

export interface IncentiveStatusReport {
  year: number;
  rows: IncentiveStatusRow[];
  totals: IncentiveStatusTotals;
}

function pct(actual: number, target: number): number | null {
  return target > 0 ? (actual / target) * 100 : null;
}

interface Acc {
  name: string;
  target: number;
  booked: number;
  accrued: number;
  paid: number;
}

/**
 * Booked/Accrued/Paid roll-up per person + totals for a calendar `year`.
 * Includes people who have only a target (no earnings) and vice-versa.
 * Sorted by paid desc, then accrued desc, then target desc.
 */
export async function getIncentiveStatusReport(year: number): Promise<IncentiveStatusReport> {
  const { start, end } = yearBounds(year);

  const [entries, projects, participants, targets] = await Promise.all([
    db
      .select()
      .from(incentiveEntries)
      .where(and(gte(incentiveEntries.periodMonth, start), lt(incentiveEntries.periodMonth, end))),
    db
      .select()
      .from(incentiveProjects)
      .where(and(gte(incentiveProjects.periodMonth, start), lt(incentiveProjects.periodMonth, end))),
    db
      .select()
      .from(incentiveParticipants)
      .where(and(gte(incentiveParticipants.periodMonth, start), lt(incentiveParticipants.periodMonth, end))),
    db
      .select()
      .from(incentiveTargets)
      .where(and(gte(incentiveTargets.periodMonth, start), lt(incentiveTargets.periodMonth, end))),
  ]);

  // Participants REPLACE their parent's own leg amounts when present (no double
  // count) — identical precedence to getIncentivePaidByPerson.
  const partByEntry = new Map<string, IncentiveParticipant[]>();
  const partByProject = new Map<string, IncentiveParticipant[]>();
  for (const p of participants) {
    if (p.entryId) {
      const arr = partByEntry.get(p.entryId) ?? [];
      arr.push(p);
      partByEntry.set(p.entryId, arr);
    } else if (p.projectId) {
      const arr = partByProject.get(p.projectId) ?? [];
      arr.push(p);
      partByProject.set(p.projectId, arr);
    }
  }

  const byKey = new Map<string, Acc>();
  function acc(name: string): Acc {
    const key = nameKey(name);
    let a = byKey.get(key);
    if (!a) {
      a = { name: name.trim(), target: 0, booked: 0, accrued: 0, paid: 0 };
      byKey.set(key, a);
    }
    return a;
  }
  function bump(name: string | null | undefined, booked: number, accrued: number, paid: number) {
    if (isNone(name) || isExcluded(name)) return;
    if (booked === 0 && accrued === 0 && paid === 0) return;
    const a = acc(name!.trim());
    a.booked += booked;
    a.accrued += accrued;
    a.paid += paid;
  }

  // Permanent entries — participants replace the entry's own leg when present.
  for (const e of entries) {
    const parts = partByEntry.get(e.id);
    if (parts && parts.length) {
      for (const p of parts) bump(p.empName, num(p.bookedAmt), num(p.accruedAmt), num(p.paidAmt));
    } else {
      bump(e.empName, num(e.bookedAmt), num(e.accruedAmt), num(e.paidAmt));
    }
  }

  // Project legs — participants replace both legs when present.
  for (const pr of projects) {
    const parts = partByProject.get(pr.id);
    if (parts && parts.length) {
      for (const p of parts) bump(p.empName, num(p.bookedAmt), num(p.accruedAmt), num(p.paidAmt));
    } else {
      bump(pr.supervisorName, num(pr.empBookedAmt), num(pr.empAccruedAmt), num(pr.empPaidAmt));
      bump(pr.internName, num(pr.internBookedAmt), num(pr.internAccruedAmt), num(pr.internPaidAmt));
    }
  }

  // Targets — bucket by name, summing across months.
  for (const t of targets) {
    if (isExcluded(t.empName)) continue;
    const key = nameKey(t.empName);
    if (!key) continue;
    acc(t.empName).target += num(t.targetAmount);
  }

  const rows: IncentiveStatusRow[] = [...byKey.values()].map((a) => ({
    empName: a.name,
    target: a.target,
    booked: a.booked,
    accrued: a.accrued,
    paid: a.paid,
    bookedPct: pct(a.booked, a.target),
    accruedPct: pct(a.accrued, a.target),
    paidPct: pct(a.paid, a.target),
  }));

  rows.sort((a, b) => b.paid - a.paid || b.accrued - a.accrued || b.target - a.target);

  const tTarget = rows.reduce((s, r) => s + r.target, 0);
  const tBooked = rows.reduce((s, r) => s + r.booked, 0);
  const tAccrued = rows.reduce((s, r) => s + r.accrued, 0);
  const tPaid = rows.reduce((s, r) => s + r.paid, 0);

  return {
    year,
    rows,
    totals: {
      target: tTarget,
      booked: tBooked,
      accrued: tAccrued,
      paid: tPaid,
      bookedPct: pct(tBooked, tTarget),
      accruedPct: pct(tAccrued, tTarget),
      paidPct: pct(tPaid, tTarget),
    },
  };
}
