import "server-only";
import { and, asc, desc, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  incentiveCatalog,
  incentiveEntries,
  incentiveProjects,
  type IncentiveCatalog,
  type IncentiveEntry,
  type IncentiveProject,
} from "@/db/schema";

/**
 * Read queries for the Incentive MIS module (migration 0064 / native rebuild
 * of the "Altus Eco System MIS" incentive tabs). All money is numeric(14,2)
 * stored — Drizzle returns it as strings; we parse to numbers only inside the
 * dashboard aggregator and keep raw strings on the list rows. `unpaid` is
 * always DERIVED (approved − paid); it is never stored.
 *
 * These three named people are operational/admin actors whose incentive rows
 * exist in the sheet for bookkeeping but must NOT count toward dashboard
 * aggregates or the leaderboard.
 */
const EXCLUDED = new Set<string>(["Manan Vasa", "Dattaram Kap", "Parvez Khan"]);

function num(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isExcluded(name: string | null | undefined): boolean {
  return name ? EXCLUDED.has(name.trim()) : false;
}

/** [start, end) date bounds for a calendar year, as YYYY-MM-DD strings. */
function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

/** Two-digit zero-pad. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** First-of-month YYYY-MM-DD for a (year, 1-based month). */
function monthStart(year: number, month1: number): string {
  return `${year}-${pad2(month1)}-01`;
}

/** A normalised key for matching ledger names to employee names. */
function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

// --- list queries ----------------------------------------------------------

/** The incentive chart / catalog, active first then by sort order. */
export async function listIncentiveCatalog(): Promise<IncentiveCatalog[]> {
  return db
    .select()
    .from(incentiveCatalog)
    .orderBy(asc(incentiveCatalog.sortOrder), asc(incentiveCatalog.name));
}

/** Permanent-incentive ledger rows, newest period first. Optional year filter. */
export async function listIncentiveEntries(
  opts: { year?: number } = {},
): Promise<IncentiveEntry[]> {
  const where =
    opts.year != null
      ? and(
          gte(incentiveEntries.periodMonth, yearBounds(opts.year).start),
          lt(incentiveEntries.periodMonth, yearBounds(opts.year).end),
        )
      : undefined;
  return db
    .select()
    .from(incentiveEntries)
    .where(where)
    .orderBy(desc(incentiveEntries.periodMonth), desc(incentiveEntries.srcSrNo));
}

/** Project-based incentive rows, newest period first. Optional year filter. */
export async function listIncentiveProjects(
  opts: { year?: number } = {},
): Promise<IncentiveProject[]> {
  const where =
    opts.year != null
      ? and(
          gte(incentiveProjects.periodMonth, yearBounds(opts.year).start),
          lt(incentiveProjects.periodMonth, yearBounds(opts.year).end),
        )
      : undefined;
  return db
    .select()
    .from(incentiveProjects)
    .where(where)
    .orderBy(desc(incentiveProjects.periodMonth), desc(incentiveProjects.srcSrNo));
}

// --- dashboard --------------------------------------------------------------

export interface IncentiveTotals {
  /** Approved-amount basis (what was earned/owed). */
  approved: number;
  paid: number;
  unpaid: number;
}

export interface IncentivePersonRow {
  name: string;
  permanent: number; // approved permanent incentives
  project: number; // approved project incentives (emp + intern share, as applicable)
  total: number;
  paid: number;
  unpaid: number;
}

export interface IncentiveNameRow {
  name: string;
  count: number;
  approved: number;
  paid: number;
  unpaid: number;
}

export interface IncentiveMonthRow {
  /** First-of-month YYYY-MM-DD. */
  month: string;
  permanent: number;
  project: number;
  total: number;
  paid: number;
  unpaid: number;
}

export interface IncentiveDashboard {
  year: number;
  /** Consolidated YTD totals across permanent + project. */
  consolidated: IncentiveTotals;
  /** Permanent (entries) YTD totals only. */
  permanent: IncentiveTotals;
  /** Project YTD totals only. */
  project: IncentiveTotals;
  /** Per-employee YTD (permanent + project, paid/unpaid), sorted desc by total. */
  perEmployee: IncentivePersonRow[];
  /** Per-incentive-name YTD (permanent ledger), sorted desc by approved. */
  perIncentiveName: IncentiveNameRow[];
  /** Monthly series (Jan→Dec rows that have data), ascending by month. */
  monthly: IncentiveMonthRow[];
  /** Leaderboard = top earners by approved total (same shape as perEmployee). */
  leaderboard: IncentivePersonRow[];
}

/**
 * Consolidated YTD incentive dashboard for the given calendar `year`.
 * Aggregates the (small) permanent-entry and project ledgers in memory.
 * Excluded operational actors (see EXCLUDED) are dropped from every roll-up.
 */
export async function getIncentiveDashboard(year: number): Promise<IncentiveDashboard> {
  const [entries, projects] = await Promise.all([
    listIncentiveEntries({ year }),
    listIncentiveProjects({ year }),
  ]);

  const zero = (): IncentiveTotals => ({ approved: 0, paid: 0, unpaid: 0 });
  const permanent = zero();
  const project = zero();

  const people = new Map<string, IncentivePersonRow>();
  const names = new Map<string, IncentiveNameRow>();
  const months = new Map<string, IncentiveMonthRow>();

  function person(name: string): IncentivePersonRow {
    let p = people.get(name);
    if (!p) {
      p = { name, permanent: 0, project: 0, total: 0, paid: 0, unpaid: 0 };
      people.set(name, p);
    }
    return p;
  }
  function month(m: string): IncentiveMonthRow {
    let row = months.get(m);
    if (!row) {
      row = { month: m, permanent: 0, project: 0, total: 0, paid: 0, unpaid: 0 };
      months.set(m, row);
    }
    return row;
  }

  // Permanent entries — name resolved from the raw emp_name column.
  for (const e of entries) {
    if (isExcluded(e.empName)) continue;
    const approved = num(e.approvedAmt);
    const paid = num(e.paidAmt);
    const unpaid = Math.max(0, approved - paid);

    permanent.approved += approved;
    permanent.paid += paid;
    permanent.unpaid += unpaid;

    const p = person(e.empName.trim());
    p.permanent += approved;
    p.total += approved;
    p.paid += paid;
    p.unpaid += unpaid;

    const nm = e.incentiveName.trim();
    let n = names.get(nm);
    if (!n) {
      n = { name: nm, count: 0, approved: 0, paid: 0, unpaid: 0 };
      names.set(nm, n);
    }
    n.count += 1;
    n.approved += approved;
    n.paid += paid;
    n.unpaid += unpaid;

    if (e.periodMonth) {
      const mo = month(e.periodMonth);
      mo.permanent += approved;
      mo.total += approved;
      mo.paid += paid;
      mo.unpaid += unpaid;
    }
  }

  // Project incentives — supervisor (emp share) + intern (intern share) legs.
  for (const pr of projects) {
    const legs: Array<{ name: string | null; approved: number; paid: number }> = [
      {
        name: pr.supervisorName,
        approved: num(pr.empApprovedAmt),
        paid: num(pr.empPaidAmt),
      },
      {
        name: pr.internName,
        approved: num(pr.internApprovedAmt),
        paid: num(pr.internPaidAmt),
      },
    ];
    for (const leg of legs) {
      if (!leg.name || isExcluded(leg.name) || leg.name.trim().toLowerCase() === "none") {
        continue;
      }
      const approved = leg.approved;
      const paid = leg.paid;
      const unpaid = Math.max(0, approved - paid);
      if (approved === 0 && paid === 0) continue;

      project.approved += approved;
      project.paid += paid;
      project.unpaid += unpaid;

      const p = person(leg.name.trim());
      p.project += approved;
      p.total += approved;
      p.paid += paid;
      p.unpaid += unpaid;

      if (pr.periodMonth) {
        const mo = month(pr.periodMonth);
        mo.project += approved;
        mo.total += approved;
        mo.paid += paid;
        mo.unpaid += unpaid;
      }
    }
  }

  const consolidated: IncentiveTotals = {
    approved: permanent.approved + project.approved,
    paid: permanent.paid + project.paid,
    unpaid: permanent.unpaid + project.unpaid,
  };

  const perEmployee = [...people.values()].sort((a, b) => b.total - a.total);
  const perIncentiveName = [...names.values()].sort((a, b) => b.approved - a.approved);
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  const leaderboard = perEmployee.slice(0, 10);

  return {
    year,
    consolidated,
    permanent,
    project,
    perEmployee,
    perIncentiveName,
    monthly,
    leaderboard,
  };
}

// --- monthly digest ---------------------------------------------------------

/** One recent ledger line for the per-employee monthly digest. */
export interface IncentiveDigestEntryRow {
  label: string;
  periodMonth: string | null;
  approved: number;
  paid: boolean;
}

/** A single recipient's incentive roll-up for a [start, end) period. */
export interface IncentivePeriodSummary {
  /** Normalised name key this summary is bucketed under. */
  nameKey: string;
  /** Display name (from the most recent matching ledger row). */
  displayName: string;
  approved: number;
  paid: number;
  unpaid: number;
  entryCount: number;
  /** Newest-first recent lines (capped). */
  recent: IncentiveDigestEntryRow[];
}

const RECENT_LIMIT = 6;

/**
 * Per-EMPLOYEE incentive summaries for the [start, end) month window — used by
 * the monthly-digest cron. Mirrors the dashboard aggregator (same EXCLUDED set,
 * same permanent + project legs, derived unpaid) but:
 *   - filters by an arbitrary period range instead of a calendar year, and
 *   - keys rows by NORMALISED NAME (the ledger stores names, not always a FK),
 *     so the cron can match each active employee to their rows by name.
 *
 * `start`/`end` are YYYY-MM-DD strings; the window is [start, end).
 * The returned map is keyed by `nameKey` (lower-cased, trimmed name).
 */
export async function getIncentivePeriodSummaries(
  start: string,
  end: string,
): Promise<Map<string, IncentivePeriodSummary>> {
  const [entries, projects] = await Promise.all([
    db
      .select()
      .from(incentiveEntries)
      .where(
        and(
          gte(incentiveEntries.periodMonth, start),
          lt(incentiveEntries.periodMonth, end),
        ),
      )
      .orderBy(desc(incentiveEntries.periodMonth), desc(incentiveEntries.srcSrNo)),
    db
      .select()
      .from(incentiveProjects)
      .where(
        and(
          gte(incentiveProjects.periodMonth, start),
          lt(incentiveProjects.periodMonth, end),
        ),
      )
      .orderBy(desc(incentiveProjects.periodMonth), desc(incentiveProjects.srcSrNo)),
  ]);

  const byName = new Map<string, IncentivePeriodSummary>();

  function bucket(name: string): IncentivePeriodSummary {
    const key = nameKey(name);
    let s = byName.get(key);
    if (!s) {
      s = {
        nameKey: key,
        displayName: name.trim(),
        approved: 0,
        paid: 0,
        unpaid: 0,
        entryCount: 0,
        recent: [],
      };
      byName.set(key, s);
    }
    return s;
  }

  function addRecent(s: IncentivePeriodSummary, row: IncentiveDigestEntryRow): void {
    if (s.recent.length < RECENT_LIMIT) s.recent.push(row);
  }

  // Permanent entries — already newest-first.
  for (const e of entries) {
    if (isExcluded(e.empName)) continue;
    const approved = num(e.approvedAmt);
    const paid = num(e.paidAmt);
    if (approved === 0 && paid === 0) continue;

    const s = bucket(e.empName);
    s.approved += approved;
    s.paid += paid;
    s.unpaid += Math.max(0, approved - paid);
    s.entryCount += 1;
    addRecent(s, {
      label: e.incentiveName.trim() || "Incentive",
      periodMonth: e.periodMonth,
      approved,
      paid: approved > 0 && paid >= approved,
    });
  }

  // Project incentives — supervisor + intern legs.
  for (const pr of projects) {
    const legs: Array<{ name: string | null; approved: number; paid: number }> = [
      { name: pr.supervisorName, approved: num(pr.empApprovedAmt), paid: num(pr.empPaidAmt) },
      { name: pr.internName, approved: num(pr.internApprovedAmt), paid: num(pr.internPaidAmt) },
    ];
    for (const leg of legs) {
      if (!leg.name || isExcluded(leg.name) || leg.name.trim().toLowerCase() === "none") {
        continue;
      }
      const approved = leg.approved;
      const paid = leg.paid;
      if (approved === 0 && paid === 0) continue;

      const s = bucket(leg.name);
      s.approved += approved;
      s.paid += paid;
      s.unpaid += Math.max(0, approved - paid);
      s.entryCount += 1;
      addRecent(s, {
        label: pr.projectName?.trim() || "Project incentive",
        periodMonth: pr.periodMonth,
        approved,
        paid: approved > 0 && paid >= approved,
      });
    }
  }

  return byName;
}

/** Re-export the month helpers the cron uses to compute the trailing window. */
export { monthStart, nameKey };
