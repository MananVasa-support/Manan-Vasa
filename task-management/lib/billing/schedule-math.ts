/**
 * Pure money maths for the Payment Schedule. Dependency-free and total — no DB,
 * no env, no throwing — so it unit-tests standalone and can be imported from
 * both server queries and client components.
 *
 * Everything is computed in integer PAISE and converted once at the edge. Rupee
 * floats drift the moment you add three GST-bearing lines, and a schedule that
 * is one paisa short reads as "not fully paid" forever.
 *
 * TDS counts toward settlement: it is tax the client remits on your behalf, so
 * it discharges the debt even though it never reaches the bank. Cash and tax
 * credit are still reported separately, because they answer different questions.
 */

export type Money = string | number | null | undefined;

/** Rupees → integer paise. Junk → 0, never NaN. */
export function toPaise(v: Money): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const toRupees = (paise: number): number => Math.round(paise) / 100;

/** GST on a base, in paise. Rate is a whole-number percent (18 = 18%). */
export function gstPaise(basePaise: number, rate: number): number {
  return Math.round((basePaise * (Number.isFinite(rate) ? rate : 0)) / 100);
}

export interface ScheduleLineInput {
  amount: Money;
  gstRate: number;
  receiptAmount: Money;
  /** Whole-number percent withheld at source (0/2/3/5/10). */
  tdsRate: number;
}

/**
 * TDS in paise, withheld on the PRE-GST base.
 *
 * Deliberately not on the GST-inclusive total: GST is shown separately on the
 * invoice and tax is not withheld on tax, so deducting on the gross would
 * over-withhold and leave every line short by rate% of the GST.
 */
export function tdsPaise(basePaise: number, rate: number): number {
  return Math.round((basePaise * (Number.isFinite(rate) ? rate : 0)) / 100);
}

/** Per-line rollup, all figures in RUPEES ready to format. */
export interface LineTotals {
  base: number;
  gst: number;
  /** base + gst — what the client owes for this line. */
  gross: number;
  /** Cash actually banked. */
  received: number;
  /** Withheld at source; counts as settled. */
  tds: number;
  /** received + tds. */
  settled: number;
  /** gross − settled, floored at 0 so an overpayment shows as 0 due. */
  balance: number;
  isSettled: boolean;
  /** Overpayment, surfaced separately so it is never silently swallowed. */
  excess: number;
}

export function lineTotals(l: ScheduleLineInput): LineTotals {
  const base = toPaise(l.amount);
  const gst = gstPaise(base, l.gstRate);
  const gross = base + gst;
  const received = toPaise(l.receiptAmount);
  const tds = tdsPaise(base, l.tdsRate);
  const settled = received + tds;
  const raw = gross - settled;

  return {
    base: toRupees(base),
    gst: toRupees(gst),
    gross: toRupees(gross),
    received: toRupees(received),
    tds: toRupees(tds),
    settled: toRupees(settled),
    balance: toRupees(Math.max(0, raw)),
    // A zero-value line is not "settled" — it is simply nothing owed, and
    // counting it as paid would inflate the settled-lines tally.
    isSettled: gross > 0 && raw <= 0,
    excess: toRupees(Math.max(0, -raw)),
  };
}

export interface ScheduleTotals {
  base: number;
  gst: number;
  gross: number;
  received: number;
  tds: number;
  settled: number;
  /** Total still to collect across every line. */
  balance: number;
  excess: number;
  lineCount: number;
  settledLineCount: number;
  /** Balance on the line(s) flagged `is_final` — the Final Balance Payment. */
  finalBalance: number;
  /** Gross of the final line(s), whether or not settled. */
  finalGross: number;
  /** 0–1 by value. 0 when nothing is scheduled, never NaN. */
  progress: number;
}

export function sumSchedule(
  lines: { totals: LineTotals; isFinal: boolean }[],
): ScheduleTotals {
  const acc = { base: 0, gst: 0, gross: 0, received: 0, tds: 0, excess: 0, finalBalance: 0, finalGross: 0 };
  for (const l of lines) {
    acc.base += toPaise(l.totals.base);
    acc.gst += toPaise(l.totals.gst);
    acc.gross += toPaise(l.totals.gross);
    acc.received += toPaise(l.totals.received);
    acc.tds += toPaise(l.totals.tds);
    acc.excess += toPaise(l.totals.excess);
    if (l.isFinal) {
      acc.finalBalance += toPaise(l.totals.balance);
      acc.finalGross += toPaise(l.totals.gross);
    }
  }
  const settled = acc.received + acc.tds;
  const billable = lines.filter((l) => l.totals.gross > 0).length;

  return {
    base: toRupees(acc.base),
    gst: toRupees(acc.gst),
    gross: toRupees(acc.gross),
    received: toRupees(acc.received),
    tds: toRupees(acc.tds),
    settled: toRupees(settled),
    balance: toRupees(Math.max(0, acc.gross - settled)),
    excess: toRupees(acc.excess),
    lineCount: lines.length,
    settledLineCount: lines.filter((l) => l.totals.isSettled).length,
    finalBalance: toRupees(acc.finalBalance),
    finalGross: toRupees(acc.finalGross),
    progress: acc.gross <= 0 ? 0 : Math.min(1, settled / acc.gross),
  };
}

/**
 * Signed drift between the schedule and the milestone plan, in rupees
 * (schedule gross − milestone total). 0 means they agree.
 *
 * Surfaced rather than auto-corrected: a mismatch is usually a data-entry slip
 * a human must judge, and rewriting either side destroys the evidence of which.
 */
export function scheduleVsMilestones(scheduleGross: number, milestoneTotal: number): number {
  return toRupees(toPaise(scheduleGross) - toPaise(milestoneTotal));
}

/**
 * Indian digit grouping WITHOUT the currency symbol — for inputs that carry
 * their own "(₹)" indicator, where a leading ₹ inside the value would read as
 * part of the number the user typed.
 */
export const inrPlain = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export const inr = (n: number): string => `₹${inrPlain(n)}`;
