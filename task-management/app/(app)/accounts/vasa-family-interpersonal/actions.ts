"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
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
