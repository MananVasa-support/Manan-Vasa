"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  incentiveEntries,
  incentiveParticipants,
  incentivePayoutEvents,
  incentiveProjects,
  salaryPayments,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getRun } from "@/lib/queries/salary";
import { getPayableSourcesForPerson } from "@/lib/queries/incentive-payout";
import { planPayout, type PayoutLine, type PayoutSource } from "@/lib/incentive/payout";

/**
 * WS-4 #7 / WS-3 #22 — UNIFIED INCENTIVE PAYOUT.
 *
 * Pays accrued-but-unpaid incentives from the SAME surface salary is paid. For a
 * salary run (employee + month), we resolve that person's payable incentive
 * sources (accrued − paid), then, in ONE transaction:
 *   1. stamp each source's paidAmt (cumulative) / paid / paidDate / payoutRunId
 *      (+ paidById on entries),
 *   2. append an `incentive_payout_events` audit row per source, and
 *   3. append a `salary_payments` row with kind='incentive' per source.
 * All-or-nothing: a mid-write failure rolls the whole payout back.
 *
 * IDEMPOTENT per (source, month): the pure planner only pays the remaining
 * outstanding, so a second identical call pays 0 and writes nothing.
 *
 * KILL-SWITCH: `INCENTIVE_PAYOUT_OFF=1` → default legacy (payout is a no-op
 * error; incentives keep being marked paid the old manual way). Fail-open
 * convention: unset / anything-but-"1" = ON.
 */

const KILL = process.env.INCENTIVE_PAYOUT_OFF === "1";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/salary/incentive-payout";
const money2 = (n: number): string => n.toFixed(2);

/** IST-today "YYYY-MM-DD" for the paid_date stamp. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

function killed<T = unknown>(): ActionResult<T> {
  return {
    ok: false,
    error: "Unified incentive payout is disabled (INCENTIVE_PAYOUT_OFF). Incentives are still paid the legacy way.",
  };
}

const PayInput = z
  .object({ runId: z.string().uuid() })
  .strict();

const PayAllInput = z
  .object({ month: z.string().regex(/^\d{4}-\d{2}$/, "Use a YYYY-MM month") })
  .strict();

/**
 * Persist ONE payout plan inside an already-open transaction `tx`. Writes source
 * stamps + payout events + salary_payments. Returns the total paid.
 */
async function writePlanTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  lines: readonly PayoutLine[],
  ctx: { salaryRunId: string; month: string; paidById: string; paidDate: string },
): Promise<number> {
  let paid = 0;
  for (const line of lines) {
    const { source: s, amount, newPaidTotal } = line;

    // 1) stamp the source row's cumulative paid + payout linkage.
    if (s.kind === "entry") {
      await tx
        .update(incentiveEntries)
        .set({
          paidAmt: money2(newPaidTotal),
          paid: true,
          paidDate: ctx.paidDate,
          payoutRunId: ctx.salaryRunId,
          paidById: ctx.paidById,
          updatedAt: new Date(),
        })
        .where(eq(incentiveEntries.id, s.sourceId));
    } else if (s.kind === "project") {
      const set =
        s.leg === "intern"
          ? { internPaidAmt: money2(newPaidTotal) }
          : { empPaidAmt: money2(newPaidTotal) };
      await tx
        .update(incentiveProjects)
        .set({
          ...set,
          paid: true,
          paidDate: ctx.paidDate,
          payoutRunId: ctx.salaryRunId,
          updatedAt: new Date(),
        })
        .where(eq(incentiveProjects.id, s.sourceId));
    } else {
      await tx
        .update(incentiveParticipants)
        .set({
          paidAmt: money2(newPaidTotal),
          paidDate: ctx.paidDate,
          payoutRunId: ctx.salaryRunId,
          updatedAt: new Date(),
        })
        .where(eq(incentiveParticipants.id, s.sourceId));
    }

    // 2) audit spine.
    await tx.insert(incentivePayoutEvents).values({
      employeeId: s.employeeId,
      empName: s.empName,
      source: s.kind,
      sourceId: s.sourceId,
      salaryRunId: ctx.salaryRunId,
      periodMonth: s.periodMonth ?? `${ctx.month}-01`,
      amount: money2(amount),
      paidDate: ctx.paidDate,
      createdById: ctx.paidById,
      note: s.leg ? `project ${s.leg} leg` : null,
    });

    // 3) partial-payment ledger (kind='incentive'); link entry sources.
    await tx.insert(salaryPayments).values({
      employeeId: s.employeeId,
      salaryRunId: ctx.salaryRunId,
      month: ctx.month,
      kind: "incentive",
      incentiveEntryId: s.kind === "entry" ? s.sourceId : null,
      amount: money2(amount),
      paidDate: ctx.paidDate,
      note: s.leg ? `Incentive payout · project ${s.leg} leg` : "Incentive payout",
      createdById: ctx.paidById,
    });

    paid += amount;
  }
  return paid;
}

/**
 * Pay one person's accrued incentives against their salary run, atomically.
 * Idempotent: re-running pays only what still remains outstanding.
 */
export async function recordIncentivePayout(
  input: z.input<typeof PayInput>,
): Promise<ActionResult<{ paid: number; lines: number; skipped: number }>> {
  const me = await requireAdmin();
  if (KILL) return killed();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = PayInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const run = await getRun(parsed.data.runId);
  if (!run) return { ok: false, error: "Salary run not found." };

  let sources: PayoutSource[];
  try {
    sources = await getPayableSourcesForPerson(run.month, {
      employeeId: run.employeeId,
      name: run.employeeName,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  const plan = planPayout(sources);
  if (plan.lines.length === 0) {
    return { ok: true, paid: 0, lines: 0, skipped: plan.skipped };
  }

  try {
    const total = await db.transaction((tx) =>
      writePlanTx(tx, plan.lines, {
        salaryRunId: run.id,
        month: run.month,
        paidById: me.id,
        paidDate: istToday(),
      }),
    );
    revalidatePath(PATH);
    revalidatePath("/incentive");
    return { ok: true, paid: total, lines: plan.lines.length, skipped: plan.skipped };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
}

/**
 * "Pay incentives with this run" for EVERY person who has a salary run in the
 * month. Each person's payout is its own transaction (a single failure does not
 * roll back the others); best-effort with a created/skipped/failed summary.
 * Idempotent per source, so re-running only settles new outstanding amounts.
 */
export async function payIncentivesWithRun(
  input: z.input<typeof PayAllInput>,
): Promise<
  ActionResult<{ people: number; paid: number; lines: number; failed: number; firstError?: string }>
> {
  const me = await requireAdmin();
  if (KILL) return killed();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = PayAllInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { month } = parsed.data;

  // Resolve the month's salary runs (payout must attach to a run) + payables.
  const { listRunsForMonth } = await import("@/lib/queries/salary");
  const { getIncentivePayablesByPerson, payoutNameKey } = await import(
    "@/lib/queries/incentive-payout"
  );

  let runs;
  let payables;
  try {
    [runs, payables] = await Promise.all([
      listRunsForMonth(month),
      getIncentivePayablesByPerson(month),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  const paidDate = istToday();
  let people = 0;
  let paid = 0;
  let lines = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const run of runs) {
    // Match this run to a payable bucket by employeeId first, else by name.
    let bucket = payables.get(payoutNameKey(run.employeeName));
    if (!bucket && run.employeeId) {
      for (const b of payables.values()) {
        if (b.employeeId === run.employeeId) {
          bucket = b;
          break;
        }
      }
    }
    if (!bucket) continue;

    const plan = planPayout(bucket.sources);
    if (plan.lines.length === 0) continue;

    try {
      const total = await db.transaction((tx) =>
        writePlanTx(tx, plan.lines, {
          salaryRunId: run.id,
          month,
          paidById: me.id,
          paidDate,
        }),
      );
      people += 1;
      paid += total;
      lines += plan.lines.length;
    } catch (err: unknown) {
      failed += 1;
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
    }
  }

  revalidatePath(PATH);
  revalidatePath("/incentive");
  return { ok: true, people, paid, lines, failed, firstError };
}

/** Whether the unified payout is disabled (for the UI to show a banner). */
export async function isIncentivePayoutOff(): Promise<boolean> {
  await requireAdmin();
  return KILL;
}
