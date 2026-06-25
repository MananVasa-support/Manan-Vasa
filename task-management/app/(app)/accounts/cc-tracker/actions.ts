"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsCcCards, accountsCcMonths } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/accounts/cc-tracker";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(4000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

const fyYear = z.number().int().min(2000).max(2100);

// ── Card master CRUD ───────────────────────────────────────────────────────────

const CardFields = z.object({
  fyStartYear: fyYear,
  code: optText,
  entityName: optText,
  cardName: z.string().trim().min(1, "A card name is required.").max(2000),
  ecs: optText,
  ecsFrom: optText,
  stmtPeriod: optText,
  stmtStartDay: optText,
  dueDay: optText,
  softCopyAutoEmail: optText,
});
const UpdateCardSchema = CardFields.omit({ fyStartYear: true }).extend({ id: z.string().uuid() });

export async function createCcCard(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CardFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;

  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsCcCards.sortOrder}), 0) + 1` })
      .from(accountsCcCards)
      .where(eq(accountsCcCards.fyStartYear, d.fyStartYear))) as Array<{ next: number }>;
    const [row] = await db
      .insert(accountsCcCards)
      .values({ ...d, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id })
      .returning({ id: accountsCcCards.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateCcCard(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateCardSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;

  try {
    await db
      .update(accountsCcCards)
      .set({ ...d, updatedAt: new Date() })
      .where(eq(accountsCcCards.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteCcCard(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    await db
      .update(accountsCcCards)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(accountsCcCards.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Per-month tracking record ────────────────────────────────────────────────

const MonthSchema = z.object({
  cardId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  hardCopy: optText,
  googleDrive: optText,
  tallyEntry: optText,
  balanceTally: optText,
  ccPaidDate: optText,
  ccPaidAmt: optText,
  intFinChgs: optText,
  chgReversed: optText,
  notes: optText,
});

/**
 * Upsert one card's full month record. If every field is empty the row is
 * deleted so the grid stays sparse.
 */
export async function saveCcMonth(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = MonthSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { cardId, month, ...fields } = parsed.data;

  const allEmpty = Object.values(fields).every((v) => v === null);

  try {
    if (allEmpty) {
      await db
        .delete(accountsCcMonths)
        .where(and(eq(accountsCcMonths.cardId, cardId), eq(accountsCcMonths.month, month)));
      revalidatePath(PATH);
      return { ok: true };
    }

    await db
      .insert(accountsCcMonths)
      .values({ cardId, month, ...fields, updatedById: me.id })
      .onConflictDoUpdate({
        target: [accountsCcMonths.cardId, accountsCcMonths.month],
        set: { ...fields, updatedById: me.id, updatedAt: new Date() },
      });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
