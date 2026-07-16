"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { eventHolidays, employees } from "@/db/schema";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { reconcileHolidayEvents } from "@/lib/monthly-events/reconcile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { HOLIDAY_APPLIES_TO, RELIGIONS } from "@/db/enums";

const PATH = "/events/holidays";

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

const HolidayFields = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  fyStartYear: z.number().int().min(2020).max(2100),
  holidayDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date."),
  appliesTo: z.enum(HOLIDAY_APPLIES_TO),
  isOptional: z.boolean(),
  isOfficeClosed: z.boolean(),
  isFestivalMarker: z.boolean(),
  isExamMarker: z.boolean(),
  notes: optText,
});
const UpdateSchema = HolidayFields.extend({ id: z.string().uuid() });

export async function createHoliday(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = HolidayFields.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const [row] = await db
      .insert(eventHolidays)
      .values({ ...d, createdById: me.id, updatedById: me.id })
      .returning({ id: eventHolidays.id });
    if (d.isOfficeClosed) await reconcileHolidayEvents(row!.id);
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateHoliday(input: unknown): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db
      .update(eventHolidays)
      .set({ ...d, updatedById: me.id, updatedAt: new Date() })
      .where(eq(eventHolidays.id, id));
    // Reconcile the locked all-day banner (creates, refreshes or removes it to
    // match the new date / office-closed flag).
    await reconcileHolidayEvents(id);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.delete(eventHolidays).where(eq(eventHolidays.id, id));
    // Remove the generated banner (reconcile sees the row is gone → deletes it).
    await reconcileHolidayEvents(id);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

const ReligionSchema = z.object({
  employeeId: z.string().uuid(),
  religion: z.enum(RELIGIONS).nullable(),
});

/** Admin sets an employee's religion (drives the personalised holiday list). */
export async function setEmployeeReligion(
  input: unknown,
): Promise<ActionResult> {
  const { me } = await requireEventsAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ReligionSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { employeeId, religion } = parsed.data;
  try {
    await db
      .update(employees)
      .set({ religion: religion ?? null })
      .where(eq(employees.id, employeeId));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
