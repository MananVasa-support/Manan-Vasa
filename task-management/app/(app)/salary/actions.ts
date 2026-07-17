"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { salaryRuns, salaryBreakup } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { computeSalary } from "@/lib/salary/compute";
import { assembleMonthInputs } from "@/lib/salary/generate";
import { getRun, listRunsForMonth } from "@/lib/queries/salary";
import { GenerateSalarySchema, RunEditSchema } from "@/lib/validators/salary";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/salary";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Generate (or regenerate) the salary runs for a month.
 *
 * For each employee that has a salary profile (annualCtc > 0) we recompute the
 * breakdown from the current attendance summary + profile (via
 * `assembleMonthInputs` → `computeSalary`) and upsert a `salary_runs` row keyed
 * on (employee_id, month).
 *
 * Carry-forward contract: we persist `pending_balance_in = input.pendingBalanceIn`
 * and `net_payable = breakdown.net` (which already INCLUDES + pendingBalanceIn).
 * This keeps `lastDisbursedRemainder` recursion correct.
 *
 * Regenerate semantics (idempotent re-run): on conflict we RECOMPUTE the
 * computed columns (payable/late/gross/pt/tds/advances/pending/net) from the
 * current attendance + profile, but we intentionally OMIT `disbursed`,
 * `disbursed_amount` and `approved_by_id` from the `set` clause so a re-run
 * never clobbers an already-disbursed payment. Note: because `advances` and
 * `pending_balance_in` are re-derived from the assembler (sumAdvances /
 * lastDisbursedRemainder — both the source of truth), any manual `editRun`
 * tweak to those two fields IS overwritten by a later regenerate. That is
 * acceptable and intentional.
 *
 * Employees without a profile (annualCtc 0) are SKIPPED (no ₹0 run created).
 */
export async function generateSalary(input: unknown): Promise<ActionResult<{ generated: number }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = GenerateSalarySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { month } = parsed.data;

  let generated = 0;
  try {
    const rows = await assembleMonthInputs(month);
    for (const row of rows) {
      if (!row.hasProfile) continue; // no CTC → skip (don't materialize a ₹0 run)
      const b = computeSalary(row.input);

      const computed = {
        month,
        fy: row.fy,
        annualCtc: row.annualCtc.toFixed(2),
        daysInMonth: row.daysInMonth,
        payableDays: b.payableDays.toFixed(2),
        lateMarks: row.input.lateMarksInMonth,
        lateDeductionDays: b.lateDeductionDays.toFixed(2),
        gross: b.gross.toFixed(2),
        pt: b.pt.toFixed(2),
        tds: b.tds.toFixed(2),
        advances: b.advances.toFixed(2),
        pendingBalanceIn: b.pendingBalanceIn.toFixed(2),
        netPayable: b.net.toFixed(2),
      };

      await db
        .insert(salaryRuns)
        .values({
          employeeId: row.employeeId,
          ...computed,
          source: "generated",
          generatedById: me.id,
        })
        .onConflictDoUpdate({
          target: [salaryRuns.employeeId, salaryRuns.month],
          // Re-run updates the COMPUTED columns + updated_at only. Does NOT
          // touch disbursed / disbursed_amount / approved_by_id (preserve a
          // recorded disbursement across regenerates).
          //
          // INVARIANT: this set-clause updates ONLY recomputed columns. It MUST
          // NOT include `disbursed`, `disbursedAmount`, or `approvedById` —
          // regenerating a month must never wipe a disbursement. setDisbursed
          // touches only those columns, so the two writers are column-disjoint
          // and safe under concurrency. If you ever add a disbursement column
          // here, add a `WHERE disbursed = false` guard or wrap in a transaction.
          set: { ...computed, updatedAt: new Date() },
        });
      generated += 1;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return { ok: true, generated };
}

/**
 * BULK "Generate salary for all" — a convenience, non-destructive pass over
 * every active salaried employee (annualCtc > 0) for `month`.
 *
 * Unlike `generateSalary` (which UPSERTS / regenerates every employee), this
 * action SKIPS anyone who already has a run for the month, so it never
 * clobbers an existing — possibly already-disbursed or hand-edited — run. It
 * is best-effort per employee: a single employee's compute/insert failure is
 * caught and counted as `failed`, the loop continues, and the action still
 * succeeds with a created/skipped/failed summary. The first row that ERRORED
 * (if any) is surfaced as `firstError` for diagnostics.
 */
export async function generateSalaryAll(
  input: unknown,
): Promise<
  ActionResult<{ created: number; skipped: number; failed: number; firstError?: string }>
> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = GenerateSalarySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { month } = parsed.data;

  let rows;
  let existing;
  try {
    [rows, existing] = await Promise.all([
      assembleMonthInputs(month),
      listRunsForMonth(month),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  const alreadyRun = new Set(existing.map((r) => r.employeeId));

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const row of rows) {
    if (!row.hasProfile) continue; // no CTC → never materialize a ₹0 run
    if (alreadyRun.has(row.employeeId)) {
      skipped += 1;
      continue;
    }

    try {
      const b = computeSalary(row.input);
      await db.insert(salaryRuns).values({
        employeeId: row.employeeId,
        month,
        fy: row.fy,
        annualCtc: row.annualCtc.toFixed(2),
        daysInMonth: row.daysInMonth,
        payableDays: b.payableDays.toFixed(2),
        lateMarks: row.input.lateMarksInMonth,
        lateDeductionDays: b.lateDeductionDays.toFixed(2),
        gross: b.gross.toFixed(2),
        pt: b.pt.toFixed(2),
        tds: b.tds.toFixed(2),
        advances: b.advances.toFixed(2),
        pendingBalanceIn: b.pendingBalanceIn.toFixed(2),
        netPayable: b.net.toFixed(2),
        source: "generated",
        generatedById: me.id,
      });
      created += 1;
    } catch (err: unknown) {
      // Best-effort: count the failure (e.g. a race created the row between our
      // snapshot and insert → unique conflict) and keep going.
      failed += 1;
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
    }
  }

  revalidatePath(PATH);
  return { ok: true, created, skipped, failed, firstError };
}

/**
 * Adjust a single run's `advances` and/or `pending_balance_in` and recompute
 * its `net_payable` from the already-stored gross / pt / tds (money read via
 * Number(), written as `.toFixed(2)`). Admin-only.
 *
 * net = gross - pt - tds - advances + pendingBalanceIn
 */
export async function editRun(input: unknown): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RunEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const run = await getRun(data.runId);
  if (!run) return { ok: false, error: "Run not found." };
  if (run.disbursed) {
    return {
      ok: false,
      error: "This run is already disbursed — un-disburse it first to edit advances or pending balance.",
    };
  }

  const advances = data.advances ?? run.advances;
  const pendingBalanceIn = data.pendingBalanceIn ?? run.pendingBalanceIn;
  const net = run.gross - run.pt - run.tds - advances + pendingBalanceIn;

  try {
    await db
      .update(salaryRuns)
      .set({
        advances: advances.toFixed(2),
        pendingBalanceIn: pendingBalanceIn.toFixed(2),
        netPayable: net.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(salaryRuns.id, data.runId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Toggle a run's disbursed flag. When disbursing, `disbursed_amount` defaults
 * to the run's net_payable (the full pay) unless an explicit amount is given —
 * a smaller amount becomes the carry-forward source (next month's
 * `lastDisbursedRemainder` reads `net_payable - disbursed_amount`). When
 * un-disbursing, `disbursed_amount` is cleared. `approved_by_id` is stamped on
 * disburse. Admin-only.
 */
export async function setDisbursed(
  runId: string,
  disbursed: boolean,
  disbursedAmount?: number,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!UUID_RE.test(runId)) return { ok: false, error: "Invalid id" };
  if (disbursedAmount !== undefined && (!Number.isFinite(disbursedAmount) || disbursedAmount < 0)) {
    return { ok: false, error: "Invalid disbursed amount" };
  }

  const run = await getRun(runId);
  if (!run) return { ok: false, error: "Run not found." };

  const amount = disbursed
    ? (disbursedAmount ?? run.netPayable).toFixed(2)
    : null;

  try {
    await db
      .update(salaryRuns)
      .set({
        disbursed,
        disbursedAmount: amount,
        approvedById: disbursed ? me.id : null,
        updatedAt: new Date(),
      })
      .where(eq(salaryRuns.id, runId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Toggle the salary "Paid" mark for one salary_breakup row. SUPER-ADMINS ONLY
 * (Manan/Hetesh) — tracks whether that employee's salary for the month has been
 * disbursed. Stored on salary_breakup.paid (survives sheet re-syncs).
 */
export async function setSalaryPaid(id: string, paid: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can mark salary as paid." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid row." };
  try {
    await db
      .update(salaryBreakup)
      .set({ paid, paidAt: paid ? new Date() : null, paidById: paid ? me.id : null })
      .where(eq(salaryBreakup.id, id));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Set the "Wave-Off" (condoned days) grant for one salary_breakup row.
 * SUPER-ADMINS ONLY (Manan/Hetesh) — mirrors the setSalaryPaid guard.
 *
 * This is a GRANT, not an edit of the raw amount: it stores how many DAYS to
 * condone; the salary view adds those days back at the per-day rate
 * (monthly_ctc / days_in_month) to reduce the attendance deduction ("your money
 * isn't deducted"). The stored base amounts (payable_after_pt / final_payment)
 * are NEVER mutated here — the add-back is purely additive to the displayed net.
 * Stored on salary_breakup.waive_off_days/note (survives sheet re-syncs).
 * `days = 0` clears the grant (and its audit stamps).
 */
export async function setWaiveOff(input: {
  rowId: string;
  days: number;
  note?: string | null;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can wave off salary days." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const { rowId, days, note } = input;
  if (!UUID_RE.test(rowId)) return { ok: false, error: "Invalid row." };
  if (!Number.isFinite(days) || days < 0 || days > 366) {
    return { ok: false, error: "Wave-off days must be between 0 and 366." };
  }
  // numeric(6,2): keep two decimals, clamp to the column's precision.
  const rounded = Math.round(days * 100) / 100;
  const trimmedNote = note?.trim().slice(0, 500) || null;

  try {
    await db
      .update(salaryBreakup)
      .set({
        waiveOffDays: rounded.toFixed(2),
        waiveOffNote: trimmedNote,
        waiveOffAt: rounded > 0 ? new Date() : null,
        waiveOffById: rounded > 0 ? me.id : null,
      })
      .where(eq(salaryBreakup.id, rowId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Set the SIGNED pre-payout adjustment (+extra / −deduct) on a salary_breakup row
 * before the final take-home (Sir #37). SUPER-ADMINS ONLY. Base final_payment is
 * never mutated; the effective net (table/exports/payslip) adds this on top.
 */
export async function setPayoutAdjustment(input: {
  rowId: string;
  amount: number;
  note?: string | null;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can adjust the payout." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const { rowId, amount, note } = input;
  if (!UUID_RE.test(rowId)) return { ok: false, error: "Invalid row." };
  if (!Number.isFinite(amount) || Math.abs(amount) > 10_000_000) {
    return { ok: false, error: "Adjustment must be within ±1,00,00,000." };
  }
  const rounded = Math.round(amount * 100) / 100;
  const trimmedNote = note?.trim().slice(0, 500) || null;

  try {
    await db
      .update(salaryBreakup)
      .set({
        payoutAdjustment: rounded.toFixed(2),
        payoutAdjustmentNote: trimmedNote,
        payoutAdjustmentAt: rounded !== 0 ? new Date() : null,
        payoutAdjustmentById: rounded !== 0 ? me.id : null,
      })
      .where(eq(salaryBreakup.id, rowId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Set the editable "Remarks" note for one salary_breakup row. SUPER-ADMINS ONLY
 * (Manan/Hetesh). Stored on salary_breakup.admin_note (survives sheet re-syncs).
 * An empty/blank note clears it.
 */
export async function setSalaryNote(id: string, note: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can edit salary notes." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid row." };
  const trimmed = note.trim().slice(0, 500);
  const value = trimmed.length ? trimmed : null;
  try {
    await db
      .update(salaryBreakup)
      .set({
        adminNote: value,
        adminNoteAt: value ? new Date() : null,
        adminNoteById: value ? me.id : null,
      })
      .where(eq(salaryBreakup.id, id));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}
