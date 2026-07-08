import "server-only";
import { and, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  incentiveEntries,
  incentiveParticipants,
  incentiveProjects,
} from "@/db/schema";
import {
  outstandingTotal,
  type PayoutSource,
} from "@/lib/incentive/payout";

/**
 * WS-4 #7 — resolver for the unified incentive payout. Reads the incentive
 * ledger for a "YYYY-MM" month and returns every PAYABLE source (accrued pool),
 * grouped per person, so the salary-run surface can show "accrued unpaid" and
 * the payout action can settle it atomically.
 *
 * PAYABLE POOL = accrued (client paid in FULL). We surface `accrued` and `paid`
 * per source; the pure planner (`lib/incentive/payout.ts`) derives what remains.
 *
 * Participant rows REPLACE their parent's own legs (same contract as the FROZEN
 * `getIncentivePaidByPerson`): when an entry/project has participant rows, the
 * parent's own accrued/paid are NOT emitted as sources — the participants are.
 * This keeps the payout total identical to the PAID producer's basis, never
 * double-counting a split.
 *
 * EXCLUDED operational actors are dropped (same set the ledger uses elsewhere).
 * Money is numeric(14,2) → parsed with Number().
 */

const EXCLUDED = new Set<string>(["Manan Vasa", "Dattaram Kap", "Parvez Khan"]);

function num(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isExcluded(name: string | null | undefined): boolean {
  const t = name?.trim();
  return t ? EXCLUDED.has(t) || t.toLowerCase() === "none" : true;
}
function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}
function monthEndExclusive(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const p2 = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${ny}-${p2(nm)}-01`;
}

/** A person's outstanding incentive sources for the month + their identity. */
export interface PersonPayable {
  /** Normalised name key (the ledger keys on name, not always an FK). */
  nameKey: string;
  /** Best display name seen for this person. */
  displayName: string;
  /** First employeeId seen for this person, if any. */
  employeeId: string | null;
  /** Every payable source (entry / project leg / participant) for this person. */
  sources: PayoutSource[];
  /** round2 Σ max(0, accrued − paid) — what a payout would settle now. */
  outstanding: number;
}

/**
 * Resolve all payable incentive sources for `month`, grouped per person.
 * `month` is "YYYY-MM" (IST). Returns a Map keyed by normalised name.
 */
export async function getIncentivePayablesByPerson(
  month: string,
): Promise<Map<string, PersonPayable>> {
  const start = `${month}-01`;
  const end = monthEndExclusive(month);

  const [entries, projects, participants] = await Promise.all([
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
  ]);

  // Group participants by parent so they REPLACE the parent's own legs.
  const partByEntry = new Set<string>();
  const partByProject = new Set<string>();
  for (const p of participants) {
    if (p.entryId) partByEntry.add(p.entryId);
    else if (p.projectId) partByProject.add(p.projectId);
  }

  const byName = new Map<string, PersonPayable>();
  const bucket = (name: string | null, id: string | null): PersonPayable | null => {
    if (isExcluded(name)) return null;
    const key = nameKey(name);
    if (!key) return null;
    let b = byName.get(key);
    if (!b) {
      b = { nameKey: key, displayName: name!.trim(), employeeId: id ?? null, sources: [], outstanding: 0 };
      byName.set(key, b);
    }
    if (id && !b.employeeId) b.employeeId = id;
    return b;
  };
  const push = (
    b: PersonPayable | null,
    src: Omit<PayoutSource, "empName"> & { empName: string | null },
  ) => {
    if (!b) return;
    // Only carry sources that have any accrued pool at all (nothing else is payable).
    if (src.accrued <= 0) return;
    b.sources.push(src);
  };

  // Permanent entries — participants (if any) replace the entry's own row.
  for (const e of entries) {
    if (partByEntry.has(e.id)) continue;
    const b = bucket(e.empName, e.employeeId);
    push(b, {
      kind: "entry",
      sourceId: e.id,
      employeeId: e.employeeId,
      empName: e.empName,
      periodMonth: e.periodMonth,
      accrued: num(e.accruedAmt),
      paid: num(e.paidAmt),
    });
  }

  // Projects — each leg is an independent source, unless participants replace it.
  for (const pr of projects) {
    if (partByProject.has(pr.id)) continue;
    const emp = bucket(pr.supervisorName, pr.supervisorId);
    push(emp, {
      kind: "project",
      sourceId: pr.id,
      leg: "emp",
      employeeId: pr.supervisorId,
      empName: pr.supervisorName,
      periodMonth: pr.periodMonth,
      accrued: num(pr.empAccruedAmt),
      paid: num(pr.empPaidAmt),
    });
    const intern = bucket(pr.internName, pr.internId);
    push(intern, {
      kind: "project",
      sourceId: pr.id,
      leg: "intern",
      employeeId: pr.internId,
      empName: pr.internName,
      periodMonth: pr.periodMonth,
      accrued: num(pr.internAccruedAmt),
      paid: num(pr.internPaidAmt),
    });
  }

  // Participant legs (the authoritative split when present).
  for (const p of participants) {
    const b = bucket(p.empName, p.employeeId);
    push(b, {
      kind: "participant",
      sourceId: p.id,
      employeeId: p.employeeId,
      empName: p.empName,
      periodMonth: p.periodMonth,
      accrued: num(p.accruedAmt),
      paid: num(p.paidAmt),
    });
  }

  for (const b of byName.values()) {
    b.outstanding = outstandingTotal(b.sources);
  }
  return byName;
}

/**
 * Convenience: the outstanding payable sources for ONE person in a month,
 * matched by employeeId first, else by normalised name. Empty array if none.
 */
export async function getPayableSourcesForPerson(
  month: string,
  person: { employeeId: string | null; name: string },
): Promise<PayoutSource[]> {
  const map = await getIncentivePayablesByPerson(month);
  const byKey = map.get(nameKey(person.name));
  if (byKey && (person.employeeId == null || byKey.employeeId == null || byKey.employeeId === person.employeeId)) {
    return byKey.sources;
  }
  if (person.employeeId) {
    for (const p of map.values()) {
      if (p.employeeId === person.employeeId) return p.sources;
    }
  }
  return byKey?.sources ?? [];
}

export { nameKey as payoutNameKey };
