import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import {
  calendarEvents,
  eventCategories,
  eventHolidays,
  obligations,
} from "@/db/schema";
import type {
  CalendarEvent,
  EventCategory,
  Holiday,
  Obligation,
} from "@/lib/monthly-events/types";

/**
 * Shared reads for the Monthly Events Master module. Used across slices
 * (calendar, masters, holidays, obligations). Hot reads (the calendar month
 * fetch) wrap in `withRetry` to self-heal a stale pooled connection.
 */

/** Active categories (the colour legend), ordered by sort_order then name. */
export async function listCategories(): Promise<EventCategory[]> {
  return db
    .select()
    .from(eventCategories)
    .where(eq(eventCategories.isActive, true))
    .orderBy(asc(eventCategories.sortOrder), asc(eventCategories.name));
}

/**
 * Calendar events whose `event_date` falls in the inclusive `[from, to]` window
 * (ISO `yyyy-mm-dd`). This is the calendar's hot path → wrapped in `withRetry`.
 */
export async function getMonthEvents(
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  return withRetry(
    () =>
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            gte(calendarEvents.eventDate, from),
            lte(calendarEvents.eventDate, to),
          ),
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.startMin)),
    { timeoutMs: [6000, 12000], label: "monthly-events.getMonthEvents" },
  );
}

/** All holidays for a financial year (fy_start_year), ordered by date. */
export async function listHolidays(fyStartYear: number): Promise<Holiday[]> {
  return db
    .select()
    .from(eventHolidays)
    .where(eq(eventHolidays.fyStartYear, fyStartYear))
    .orderBy(asc(eventHolidays.holidayDate));
}

/** Active obligations ("compulsory sessions"), ordered by name. */
export async function listObligations(): Promise<Obligation[]> {
  return db
    .select()
    .from(obligations)
    .where(eq(obligations.isActive, true))
    .orderBy(asc(obligations.name));
}
