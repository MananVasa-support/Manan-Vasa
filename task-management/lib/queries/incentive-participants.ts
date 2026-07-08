import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  incentiveEntries,
  incentiveParticipants,
  incentiveProjects,
  type IncentiveParticipant,
} from "@/db/schema";

/**
 * Read queries for the WS-4 Phase B3 N-participant split editor. A participant
 * row attaches to an incentive ENTRY (permanent ledger) XOR a PROJECT and holds
 * that one person's booked / accrued / paid share. When a parent has any
 * participant rows they REPLACE the parent's own leg amounts in all roll-ups
 * (see `getIncentivePaidByPerson` in lib/queries/incentives.ts) — so the split
 * is authoritative, never additive on top of the parent legs.
 *
 * Money is numeric(14,2) → Drizzle returns strings; we parse to numbers only for
 * the JSON-safe rows the editor renders. All writes live in the sibling actions
 * file (app/(app)/incentive/participant-actions.ts).
 */

function num(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** JSON-safe participant row for the split editor. Money as numbers. */
export interface IncentiveParticipantRow {
  id: string;
  empName: string;
  employeeId: string | null;
  bookedAmt: number;
  accruedAmt: number;
  paidAmt: number;
  paidDate: string | null;
  note: string | null;
}

/** The parent an editor is attached to, plus its own owed/booked/accrued/paid. */
export interface IncentiveSplitParent {
  kind: "entry" | "project";
  id: string;
  label: string;
  periodMonth: string | null;
  /** The cap Σparticipants may not exceed, per basis (owed = approved/accrued). */
  owed: { booked: number; accrued: number; paid: number };
}

export interface IncentiveSplitView {
  parent: IncentiveSplitParent;
  participants: IncentiveParticipantRow[];
  totals: { booked: number; accrued: number; paid: number };
}

function toRow(p: IncentiveParticipant): IncentiveParticipantRow {
  return {
    id: p.id,
    empName: p.empName,
    employeeId: p.employeeId,
    bookedAmt: num(p.bookedAmt),
    accruedAmt: num(p.accruedAmt),
    paidAmt: num(p.paidAmt),
    paidDate: p.paidDate,
    note: p.note,
  };
}

/** List a parent's participant rows (oldest first — stable insertion order). */
export async function listParticipantsFor(
  parent: { kind: "entry" | "project"; id: string },
): Promise<IncentiveParticipantRow[]> {
  const where =
    parent.kind === "entry"
      ? eq(incentiveParticipants.entryId, parent.id)
      : eq(incentiveParticipants.projectId, parent.id);
  const rows = await db
    .select()
    .from(incentiveParticipants)
    .where(where)
    .orderBy(asc(incentiveParticipants.createdAt));
  return rows.map(toRow);
}

/**
 * The full split view for one parent: the parent's own owed caps (approved for
 * booked/accrued caps, approved for the paid cap too — we cap every basis at the
 * parent's approved/accrued owed so the split can never over-allocate) plus its
 * current participant rows and their live totals. Returns null if the parent id
 * does not resolve, so the caller can 404 cleanly.
 */
export async function getSplitView(
  kind: "entry" | "project",
  id: string,
): Promise<IncentiveSplitView | null> {
  if (kind === "entry") {
    const [e] = await db.select().from(incentiveEntries).where(eq(incentiveEntries.id, id));
    if (!e) return null;
    const approved = num(e.approvedAmt);
    const accrued = num(e.accruedAmt);
    const parent: IncentiveSplitParent = {
      kind: "entry",
      id: e.id,
      label: `${e.incentiveName} · ${e.empName}`,
      periodMonth: e.periodMonth,
      // Booked/paid are capped at approved owed; accrued at accrued (fall back to
      // approved when accrued was never split out) so caps are never below data.
      owed: {
        booked: approved,
        accrued: accrued > 0 ? accrued : approved,
        paid: approved,
      },
    };
    const participants = await listParticipantsFor({ kind, id });
    return withTotals(parent, participants);
  }

  const [pr] = await db.select().from(incentiveProjects).where(eq(incentiveProjects.id, id));
  if (!pr) return null;
  // A project's owed is the sum of both legs (emp + intern) on each basis.
  const approved = num(pr.empApprovedAmt) + num(pr.internApprovedAmt);
  const accrued = num(pr.empAccruedAmt) + num(pr.internAccruedAmt);
  const paid = num(pr.empPaidAmt) + num(pr.internPaidAmt);
  const parent: IncentiveSplitParent = {
    kind: "project",
    id: pr.id,
    label: pr.projectName?.trim() || "Project incentive",
    periodMonth: pr.periodMonth,
    owed: {
      booked: approved,
      accrued: accrued > 0 ? accrued : approved,
      paid: paid > 0 ? paid : approved,
    },
  };
  const participants = await listParticipantsFor({ kind, id });
  return withTotals(parent, participants);
}

function withTotals(
  parent: IncentiveSplitParent,
  participants: IncentiveParticipantRow[],
): IncentiveSplitView {
  const totals = participants.reduce(
    (acc, p) => {
      acc.booked += p.bookedAmt;
      acc.accrued += p.accruedAmt;
      acc.paid += p.paidAmt;
      return acc;
    },
    { booked: 0, accrued: 0, paid: 0 },
  );
  return { parent, participants, totals };
}

/** True when a parent already carries a split (drives the "N-way" badge). */
export async function hasParticipants(
  parent: { kind: "entry" | "project"; id: string },
): Promise<boolean> {
  const where =
    parent.kind === "entry"
      ? eq(incentiveParticipants.entryId, parent.id)
      : eq(incentiveParticipants.projectId, parent.id);
  const rows = await db
    .select({ id: incentiveParticipants.id })
    .from(incentiveParticipants)
    .where(where)
    .limit(1);
  return rows.length > 0;
}

/**
 * Count of participant rows per entry id for the year, driving the Entries list
 * "N-way" badge. Participants carry their own `period_month` (mirrored from the
 * parent) so we can range-filter without a join.
 */
export async function participantCountsByEntry(
  year: number,
): Promise<Map<string, number>> {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const rows = await db
    .select({ entryId: incentiveParticipants.entryId })
    .from(incentiveParticipants)
    .where(
      and(
        gte(incentiveParticipants.periodMonth, start),
        lt(incentiveParticipants.periodMonth, end),
      ),
    );
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.entryId) continue;
    out.set(r.entryId, (out.get(r.entryId) ?? 0) + 1);
  }
  return out;
}

export type { IncentiveParticipant };
