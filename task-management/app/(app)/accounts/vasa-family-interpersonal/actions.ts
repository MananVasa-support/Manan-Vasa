"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsVasaBalances } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";

const PATH = "/accounts/vasa-family-interpersonal";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(4000).nullable().optional())
  .transform((s) => (s ? s : null));
function amt(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

const Fields = z.object({
  party: optText,
  direction: optText,
  counterparty: optText,
  amount: z.any(),
  asOn: optText,
  notes: optText,
});
const UpdateSchema = Fields.extend({ id: z.string().uuid() });

export async function createVasaBalance(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = Fields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const maxRows = (await db.select({ next: sql<number>`COALESCE(MAX(${accountsVasaBalances.sortOrder}), 0) + 1` }).from(accountsVasaBalances)) as Array<{ next: number }>;
    const [row] = await db.insert(accountsVasaBalances)
      .values({ party: d.party, direction: d.direction, counterparty: d.counterparty, amount: amt(d.amount), asOn: d.asOn, notes: d.notes, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id })
      .returning({ id: accountsVasaBalances.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateVasaBalance(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsVasaBalances).set({ party: d.party, direction: d.direction, counterparty: d.counterparty, amount: amt(d.amount), asOn: d.asOn, notes: d.notes, updatedAt: new Date() }).where(eq(accountsVasaBalances.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteVasaBalance(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsVasaBalances).set({ archived: true, updatedAt: new Date() }).where(eq(accountsVasaBalances.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Matrix cell editing (a cell + its mirror stay antisymmetric) ────────────────

const CellSchema = z.object({
  asOn: z.string().trim().min(1).max(40),
  rowParty: z.string().trim().min(1).max(120),
  colParty: z.string().trim().min(1).max(120),
  amount: z.any(),
});

/**
 * Set one matrix cell for a snapshot: writes (rowParty → colParty) = amount AND
 * its mirror (colParty → rowParty) = −amount, so the grid stays antisymmetric
 * exactly like the source sheet. A blank / zero amount clears both. Same-party
 * (diagonal) is a no-op.
 */
export async function saveVasaCell(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CellSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { asOn, rowParty, colParty } = parsed.data;
  if (rowParty === colParty) return fail("A party has no balance with itself.");
  const value = amt(parsed.data.amount); // string | null

  try {
    // Clear both directions for this snapshot, then re-insert if non-zero.
    await db.delete(accountsVasaBalances).where(and(
      eq(accountsVasaBalances.asOn, asOn),
      eq(accountsVasaBalances.party, rowParty),
      eq(accountsVasaBalances.counterparty, colParty),
    ));
    await db.delete(accountsVasaBalances).where(and(
      eq(accountsVasaBalances.asOn, asOn),
      eq(accountsVasaBalances.party, colParty),
      eq(accountsVasaBalances.counterparty, rowParty),
    ));

    if (value !== null && Number(value) !== 0) {
      const mirror = String(-Number(value));
      const [maxRow] = (await db.select({ next: sql<number>`COALESCE(MAX(${accountsVasaBalances.sortOrder}), 0) + 1` }).from(accountsVasaBalances)) as Array<{ next: number }>;
      const base = maxRow?.next ?? 1;
      await db.insert(accountsVasaBalances).values([
        { party: rowParty, counterparty: colParty, amount: value, direction: Number(value) < 0 ? "Owes" : "Owed by", asOn, sortOrder: base, createdById: me.id },
        { party: colParty, counterparty: rowParty, amount: mirror, direction: Number(mirror) < 0 ? "Owes" : "Owed by", asOn, sortOrder: base + 1, createdById: me.id },
      ]);
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Start a new snapshot by cloning every cell of the most recent one into a new date. */
export async function addVasaSnapshot(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = z.object({ newAsOn: z.string().trim().min(1).max(40), fromAsOn: z.string().trim().max(40).nullable().optional() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { newAsOn, fromAsOn } = parsed.data;

  try {
    const exists = await db.select({ id: accountsVasaBalances.id }).from(accountsVasaBalances).where(eq(accountsVasaBalances.asOn, newAsOn)).limit(1);
    if (exists.length) return fail(`A snapshot dated "${newAsOn}" already exists.`);

    if (fromAsOn) {
      const src = await db.select().from(accountsVasaBalances).where(and(eq(accountsVasaBalances.asOn, fromAsOn), eq(accountsVasaBalances.archived, false)));
      if (src.length) {
        await db.insert(accountsVasaBalances).values(src.map((r) => ({
          party: r.party, counterparty: r.counterparty, amount: r.amount, direction: r.direction, asOn: newAsOn, sortOrder: r.sortOrder, createdById: me.id,
        })));
      }
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Remove an entire snapshot (all its cells) for a date. */
export async function deleteVasaSnapshot(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ asOn: z.string().trim().min(1).max(40) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    await db.delete(accountsVasaBalances).where(eq(accountsVasaBalances.asOn, parsed.data.asOn));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
