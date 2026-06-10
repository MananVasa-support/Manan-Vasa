"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { outstandingEntries, outstandingFollowups } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CreateEntrySchema = z
  .object({
    client: z.string().trim().min(1, "Client is required").max(200),
    particulars: z.string().trim().max(500).optional(),
    amount: z.number().positive("Amount must be greater than zero").max(1_000_000_000),
    dueDate: z.string().regex(DATE_RE, "Invalid date").optional(),
    ownerId: z.string().uuid().optional(),
  })
  .strict();

/** Add a receivable to the ledger (admin). */
export async function createOutstandingEntry(input: {
  client: string;
  particulars?: string;
  amount: number;
  dueDate?: string;
  ownerId?: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingEntries)
      .values({
        client: parsed.data.client,
        particulars: parsed.data.particulars || null,
        amount: parsed.data.amount.toFixed(2),
        dueDate: parsed.data.dueDate ?? null,
        ownerId: parsed.data.ownerId ?? null,
        createdById: me.id,
      })
      .returning({ id: outstandingEntries.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

const FollowupSchema = z
  .object({
    entryId: z.string().uuid(),
    note: z.string().trim().min(1, "A note is required").max(1000),
    promisedDate: z.string().regex(DATE_RE, "Invalid date").optional(),
    amountReceived: z
      .number()
      .positive("Received amount must be greater than zero")
      .max(1_000_000_000)
      .optional(),
  })
  .strict();

/**
 * Log a collection follow-up (any signed-in employee). An optional payment
 * rolls up into the entry's amount_received and auto-advances its status
 * (open → partial → paid); a written-off entry stays written off.
 */
export async function addOutstandingFollowup(input: {
  entryId: string;
  note: string;
  promisedDate?: string;
  amountReceived?: number;
}): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = FollowupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const entry = await db.query.outstandingEntries.findFirst({
    where: eq(outstandingEntries.id, parsed.data.entryId),
  });
  if (!entry) return { ok: false, error: "Entry not found" };

  const amt = parsed.data.amountReceived;

  try {
    await db.insert(outstandingFollowups).values({
      entryId: entry.id,
      actorId: me.id,
      note: parsed.data.note,
      promisedDate: parsed.data.promisedDate ?? null,
      amountReceived: amt !== undefined ? amt.toFixed(2) : null,
    });

    if (amt !== undefined) {
      // Atomic roll-up — the CASE runs against current DB values so two
      // concurrent payments can't clobber each other.
      const inc = amt.toFixed(2);
      await db
        .update(outstandingEntries)
        .set({
          amountReceived: sql`${outstandingEntries.amountReceived} + ${inc}::numeric`,
          status: sql`CASE
            WHEN ${outstandingEntries.status} = 'written_off' THEN ${outstandingEntries.status}
            WHEN ${outstandingEntries.amountReceived} + ${inc}::numeric >= ${outstandingEntries.amount} THEN 'paid'
            ELSE 'partial'
          END`,
          updatedAt: new Date(),
        })
        .where(eq(outstandingEntries.id, entry.id));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

const StatusSchema = z
  .object({
    entryId: z.string().uuid(),
    action: z.enum(["write_off", "reopen"]),
  })
  .strict();

/** Write off an entry, or reopen a written-off one (admin). */
export async function setOutstandingWriteOff(input: {
  entryId: string;
  action: "write_off" | "reopen";
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const entry = await db.query.outstandingEntries.findFirst({
    where: eq(outstandingEntries.id, parsed.data.entryId),
  });
  if (!entry) return { ok: false, error: "Entry not found" };

  // Reopen recomputes the natural status from the amounts.
  const received = Number(entry.amountReceived);
  const amount = Number(entry.amount);
  const reopened: "open" | "partial" | "paid" =
    received >= amount && amount > 0 ? "paid" : received > 0 ? "partial" : "open";
  const next = parsed.data.action === "write_off" ? "written_off" : reopened;

  try {
    await db
      .update(outstandingEntries)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(outstandingEntries.id, entry.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

/** Delete an entry and its follow-ups (admin). */
export async function deleteOutstandingEntry(
  entryId: string,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsedId = z.string().uuid().safeParse(entryId);
  if (!parsedId.success) return { ok: false, error: "Invalid entry id" };

  try {
    await db
      .delete(outstandingEntries)
      .where(eq(outstandingEntries.id, parsedId.data));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}
