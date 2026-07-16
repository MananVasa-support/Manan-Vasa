import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents, eventHolidays } from "@/db/schema";

/**
 * Reconcile the generated (`source='holiday'`, `is_locked=true`, `all_day=true`)
 * calendar_events for a single holiday so the all-day banner matches the
 * holiday's current date / office-closed flag.
 *
 * Idempotent: keyed on `(source='holiday', source_ref_id = holidayId)`. A holiday
 * with `is_office_closed=true` yields exactly one all-day event on its date; when
 * office is NOT closed (or the row is deleted), the generated event is removed.
 *
 * Runs in a transaction so re-saving a holiday never duplicates the banner.
 */
export async function reconcileHolidayEvents(holidayId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [holiday] = await tx
      .select()
      .from(eventHolidays)
      .where(eq(eventHolidays.id, holidayId))
      .limit(1);

    const existing = await tx
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.source, "holiday"),
          eq(calendarEvents.sourceRefId, holidayId),
        ),
      );

    // Missing holiday, or office is NOT closed → no banner should exist.
    if (!holiday || !holiday.isOfficeClosed) {
      if (existing.length > 0) {
        await tx
          .delete(calendarEvents)
          .where(
            and(
              eq(calendarEvents.source, "holiday"),
              eq(calendarEvents.sourceRefId, holidayId),
            ),
          );
      }
      return;
    }

    // Office-closed → exactly one locked all-day banner on the holiday date.
    const shape = {
      title: holiday.name,
      categoryId: null,
      colorOverride: null,
      eventDate: holiday.holidayDate,
      startMin: null,
      endMin: null,
      allDay: true,
      status: "confirmed" as const,
      location: null,
      notes: null,
      source: "holiday" as const,
      sourceRefId: holidayId,
      isLocked: true,
      obligationId: null,
      updatedById: holiday.updatedById ?? holiday.createdById ?? null,
      updatedAt: new Date(),
    };

    if (existing.length === 0) {
      await tx
        .insert(calendarEvents)
        .values({ ...shape, createdById: holiday.createdById ?? null });
      return;
    }

    // Patch the first (canonical) banner; drop any accidental duplicates.
    const [keep, ...extras] = existing;
    await tx
      .update(calendarEvents)
      .set(shape)
      .where(eq(calendarEvents.id, keep!.id));
    for (const ex of extras) {
      await tx.delete(calendarEvents).where(eq(calendarEvents.id, ex.id));
    }
  });
}
