"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccKpiItems, dccEntries, dccReviews } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { loadDccScope, canManageItemsFor, canReviewFor, canViewFor } from "@/lib/dcc/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";
import { parseFrequencyToMask } from "@/lib/dcc/util";
import { listOwnerItems, listOwnerEntries } from "@/lib/queries/dcc";
import { generateText, GeminiNotConfiguredError } from "@/lib/ai/gemini";

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
  // The morning gate fills with silent:true so each keystroke does NOT
  // revalidate /dcc — that auto-refresh re-runs the layout gate mid-fill and a
  // single transient hiccup would fail-open and dismiss the gate early. The
  // gate re-evaluates ONCE, when the user clicks Continue (router.refresh).
  silent: z.boolean().optional(),
});

/** Upsert (or clear) one item's entry for a day. Owner-or-super only. */
export async function setDccEntry(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = EntrySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, date, silent } = parsed.data;
  const status = parsed.data.status;
  const value = num(parsed.data.value);
  const note = parsed.data.note;

  try {
    const [item] = await db.select({ owner: dccKpiItems.ownerEmployeeId }).from(dccKpiItems).where(eq(dccKpiItems.id, itemId)).limit(1);
    if (!item) return fail("KPI not found.");
    if (!(isSuperAdmin(me.email) || item.owner === me.id)) return fail("You can only fill your own KPIs.");

    if (!status && value === null && !note) {
      await db.delete(dccEntries).where(and(eq(dccEntries.itemId, itemId), eq(dccEntries.entryDate, date)));
      if (!silent) revalidatePath(PATH);
      return { ok: true };
    }
    await db
      .insert(dccEntries)
      .values({ itemId, entryDate: date, status, valueNumber: value, note, filledById: me.id })
      .onConflictDoUpdate({
        target: [dccEntries.itemId, dccEntries.entryDate],
        set: { status, valueNumber: value, note, filledById: me.id, updatedAt: new Date() },
      });
    if (!silent) revalidatePath(PATH);
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
  silent: z.boolean().optional(), // gate reviews skip revalidate (see setDccEntry)
});

export async function setDccReview(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { ownerEmployeeId, date, note, silent } = parsed.data;
  const status = parsed.data.status || null;
  const scope = await loadDccScope(me);
  if (!canReviewFor(scope, ownerEmployeeId)) return fail("You can only review your team.");
  try {
    if (!status && !note) {
      await db.delete(dccReviews).where(and(eq(dccReviews.ownerEmployeeId, ownerEmployeeId), eq(dccReviews.reviewDate, date)));
      if (!silent) revalidatePath(PATH);
      return { ok: true };
    }
    await db
      .insert(dccReviews)
      .values({ ownerEmployeeId, reviewDate: date, reviewerId: me.id, status, note })
      .onConflictDoUpdate({ target: [dccReviews.ownerEmployeeId, dccReviews.reviewDate], set: { reviewerId: me.id, status, note, updatedAt: new Date() } });
    if (!silent) revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Approve every still-unreviewed report for a date (manager gate "Approve all"). */
export async function approveAllDccReviews(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) }).safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  const { date } = parsed.data;
  const scope = await loadDccScope(me);
  const reportIds = [...scope.visibleIds].filter((id) => id !== me.id && canReviewFor(scope, id));
  if (reportIds.length === 0) return { ok: true };
  try {
    await db
      .insert(dccReviews)
      .values(reportIds.map((id) => ({ ownerEmployeeId: id, reviewDate: date, reviewerId: me.id, status: "approved" as const, note: null })))
      .onConflictDoNothing({ target: [dccReviews.ownerEmployeeId, dccReviews.reviewDate] });
    // No revalidate: the gate advances only when the manager clicks Continue
    // (router.refresh), so a mid-review re-render can't fail-open the gate.
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** AI "summarize my day" — gathers a person's entries for a date → Gemini. */
export async function summarizeDccDay(input: unknown): Promise<ActionResult<{ summary: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ ownerId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) }).safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  const { ownerId, date } = parsed.data;
  const scope = await loadDccScope(me);
  if (!canViewFor(scope, ownerId)) return fail("Not allowed.");
  try {
    const [items, entries] = await Promise.all([listOwnerItems(ownerId), listOwnerEntries(ownerId, date)]);
    const byItem = new Map(entries.filter((e) => e.entryDate === date).map((e) => [e.itemId, e]));
    const lines = items
      .map((it) => {
        const e = byItem.get(it.id);
        if (!e || (!e.status && !e.valueNumber && !e.note)) return null;
        return `- ${it.title}: ${e.status ?? "—"}${e.valueNumber ? ` (${e.valueNumber})` : ""}${e.note ? ` — ${e.note}` : ""}`;
      })
      .filter(Boolean)
      .join("\n");
    if (!lines) return fail("Nothing filled for this day yet.");
    const prompt = `These are an employee's Daily Compliance KPI entries for ${date}. Write a concise 2-3 sentence summary of what they accomplished and what was missed or pending. Professional tone; keep any Hinglish as-is; do not invent anything.\n\n${lines}`;
    const summary = await generateText(prompt);
    return { ok: true, summary };
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) return fail("AI summary isn't set up yet (no GEMINI_API_KEY).");
    return fail(err instanceof Error ? err.message : String(err));
  }
}
