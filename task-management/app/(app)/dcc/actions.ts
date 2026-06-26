"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccKpiItems, dccEntries, dccReviews } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { loadDccScope, canManageItemsFor, canReviewFor } from "@/lib/dcc/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";
import { parseFrequencyToMask } from "@/lib/dcc/util";

const PATH = "/dcc";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(4000).nullable().optional())
  .transform((s) => (s ? s : null));
function num(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

// ── Daily fill ──────────────────────────────────────────────────────────────
const EntrySchema = z.object({
  itemId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Bad date."),
  status: optText,
  value: z.any().optional(),
  note: optText,
});

/** Upsert (or clear) one item's entry for a day. Owner-or-super only. */
export async function setDccEntry(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = EntrySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, date } = parsed.data;
  const status = parsed.data.status;
  const value = num(parsed.data.value);
  const note = parsed.data.note;

  try {
    const [item] = await db.select({ owner: dccKpiItems.ownerEmployeeId }).from(dccKpiItems).where(eq(dccKpiItems.id, itemId)).limit(1);
    if (!item) return fail("KPI not found.");
    if (!(isSuperAdmin(me.email) || item.owner === me.id)) return fail("You can only fill your own KPIs.");

    if (!status && value === null && !note) {
      await db.delete(dccEntries).where(and(eq(dccEntries.itemId, itemId), eq(dccEntries.entryDate, date)));
      revalidatePath(PATH);
      return { ok: true };
    }
    await db
      .insert(dccEntries)
      .values({ itemId, entryDate: date, status, valueNumber: value, note, filledById: me.id })
      .onConflictDoUpdate({
        target: [dccEntries.itemId, dccEntries.entryDate],
        set: { status, valueNumber: value, note, filledById: me.id, updatedAt: new Date() },
      });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── KPI item CRUD (managers for their team; super-admins anyone) ─────────────
const ItemFields = z.object({
  ownerEmployeeId: z.string().uuid(),
  section: optText,
  code: optText,
  title: z.string().trim().min(1, "A title is required.").max(2000),
  frequency: optText,
  targetNumber: z.any(),
  unit: optText,
});
const UpdateItem = ItemFields.omit({ ownerEmployeeId: true }).extend({ id: z.string().uuid() });

export async function createDccItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  const scope = await loadDccScope(me);
  if (!canManageItemsFor(scope, d.ownerEmployeeId)) return fail("You can't add KPIs for this person.");
  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${dccKpiItems.sortOrder}), 0) + 1` })
      .from(dccKpiItems)
      .where(eq(dccKpiItems.ownerEmployeeId, d.ownerEmployeeId))) as Array<{ next: number }>;
    const [row] = await db
      .insert(dccKpiItems)
      .values({
        ownerEmployeeId: d.ownerEmployeeId, section: d.section, code: d.code, title: d.title,
        frequency: d.frequency, weekdays: parseFrequencyToMask(d.frequency), targetNumber: num(d.targetNumber),
        unit: d.unit, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id,
      })
      .returning({ id: dccKpiItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateDccItem(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateItem.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    const [item] = await db.select({ owner: dccKpiItems.ownerEmployeeId }).from(dccKpiItems).where(eq(dccKpiItems.id, id)).limit(1);
    if (!item) return fail("KPI not found.");
    const scope = await loadDccScope(me);
    if (!canManageItemsFor(scope, item.owner)) return fail("Not allowed.");
    await db.update(dccKpiItems).set({
      section: d.section, code: d.code, title: d.title, frequency: d.frequency,
      weekdays: parseFrequencyToMask(d.frequency), targetNumber: num(d.targetNumber), unit: d.unit, updatedAt: new Date(),
    }).where(eq(dccKpiItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteDccItem(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    const [item] = await db.select({ owner: dccKpiItems.ownerEmployeeId }).from(dccKpiItems).where(eq(dccKpiItems.id, id)).limit(1);
    if (!item) return fail("KPI not found.");
    const scope = await loadDccScope(me);
    if (!canManageItemsFor(scope, item.owner)) return fail("Not allowed.");
    await db.update(dccKpiItems).set({ archived: true, updatedAt: new Date() }).where(eq(dccKpiItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Manager review ───────────────────────────────────────────────────────────
const ReviewSchema = z.object({
  ownerEmployeeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  status: z.enum(["approved", "needs_rework", ""]).nullable().optional(),
  note: optText,
});

export async function setDccReview(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { ownerEmployeeId, date, note } = parsed.data;
  const status = parsed.data.status || null;
  const scope = await loadDccScope(me);
  if (!canReviewFor(scope, ownerEmployeeId)) return fail("You can only review your team.");
  try {
    if (!status && !note) {
      await db.delete(dccReviews).where(and(eq(dccReviews.ownerEmployeeId, ownerEmployeeId), eq(dccReviews.reviewDate, date)));
      revalidatePath(PATH);
      return { ok: true };
    }
    await db
      .insert(dccReviews)
      .values({ ownerEmployeeId, reviewDate: date, reviewerId: me.id, status, note })
      .onConflictDoUpdate({ target: [dccReviews.ownerEmployeeId, dccReviews.reviewDate], set: { reviewerId: me.id, status, note, updatedAt: new Date() } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}
