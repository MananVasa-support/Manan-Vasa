import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { dccKpiItems, dccEntries, dccReviews, employees } from "@/db/schema";

export interface DccItemRow {
  id: string;
  ownerEmployeeId: string;
  section: string | null;
  code: string | null;
  title: string;
  frequency: string | null;
  weekdays: number | null;
  targetNumber: string | null;
  unit: string | null;
  sortOrder: number | null;
}

export interface DccEntryRow {
  itemId: string;
  entryDate: string; // YYYY-MM-DD
  status: string | null;
  valueNumber: string | null;
  note: string | null;
}

export interface DccPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
}

/** KPI items for one person, ordered by section then sort/code. */
export async function listOwnerItems(ownerId: string): Promise<DccItemRow[]> {
  return withRetry(
    () =>
      db
        .select({
          id: dccKpiItems.id,
          ownerEmployeeId: dccKpiItems.ownerEmployeeId,
          section: dccKpiItems.section,
          code: dccKpiItems.code,
          title: dccKpiItems.title,
          frequency: dccKpiItems.frequency,
          weekdays: dccKpiItems.weekdays,
          targetNumber: dccKpiItems.targetNumber,
          unit: dccKpiItems.unit,
          sortOrder: dccKpiItems.sortOrder,
        })
        .from(dccKpiItems)
        .where(and(eq(dccKpiItems.ownerEmployeeId, ownerId), eq(dccKpiItems.archived, false)))
        .orderBy(asc(dccKpiItems.sortOrder), asc(dccKpiItems.code)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-items" },
  );
}

/** All entries for one person's items since `fromDate` (inclusive). */
export async function listOwnerEntries(ownerId: string, fromDate: string): Promise<DccEntryRow[]> {
  return withRetry(
    () =>
      db
        .select({
          itemId: dccEntries.itemId,
          entryDate: dccEntries.entryDate,
          status: dccEntries.status,
          valueNumber: dccEntries.valueNumber,
          note: dccEntries.note,
        })
        .from(dccEntries)
        .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
        .where(and(eq(dccKpiItems.ownerEmployeeId, ownerId), gte(dccEntries.entryDate, fromDate))),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-entries" },
  );
}

/** People (with KPI items) the viewer can see, for the team/dashboard roster. */
export async function listDccPeople(visibleIds: string[]): Promise<DccPerson[]> {
  if (visibleIds.length === 0) return [];
  const rows = await withRetry(
    () =>
      db
        .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl, department: employees.department })
        .from(employees)
        .where(inArray(employees.id, visibleIds)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-people" },
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** All items (id/owner/weekdays/target) for a set of owners — roster aggregation. */
export async function listItemsForOwners(ownerIds: string[]): Promise<Pick<DccItemRow, "id" | "ownerEmployeeId" | "weekdays" | "targetNumber">[]> {
  if (ownerIds.length === 0) return [];
  return withRetry(
    () =>
      db
        .select({
          id: dccKpiItems.id,
          ownerEmployeeId: dccKpiItems.ownerEmployeeId,
          weekdays: dccKpiItems.weekdays,
          targetNumber: dccKpiItems.targetNumber,
        })
        .from(dccKpiItems)
        .where(and(inArray(dccKpiItems.ownerEmployeeId, ownerIds), eq(dccKpiItems.archived, false))),
    { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-items-roster" },
  );
}

/** Entries for a set of owners since fromDate — roster/analytics aggregation. */
export async function listEntriesForOwners(ownerIds: string[], fromDate: string): Promise<Array<DccEntryRow & { ownerEmployeeId: string }>> {
  if (ownerIds.length === 0) return [];
  return withRetry(
    () =>
      db
        .select({
          itemId: dccEntries.itemId,
          ownerEmployeeId: dccKpiItems.ownerEmployeeId,
          entryDate: dccEntries.entryDate,
          status: dccEntries.status,
          valueNumber: dccEntries.valueNumber,
          note: dccEntries.note,
        })
        .from(dccEntries)
        .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
        .where(and(inArray(dccKpiItems.ownerEmployeeId, ownerIds), gte(dccEntries.entryDate, fromDate))),
    { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-entries-roster" },
  );
}

/** Reviews for a set of owners since fromDate. */
export async function listReviewsForOwners(ownerIds: string[], fromDate: string): Promise<Array<{ ownerEmployeeId: string; reviewDate: string; status: string | null; note: string | null }>> {
  if (ownerIds.length === 0) return [];
  return withRetry(
    () =>
      db
        .select({
          ownerEmployeeId: dccReviews.ownerEmployeeId,
          reviewDate: dccReviews.reviewDate,
          status: dccReviews.status,
          note: dccReviews.note,
        })
        .from(dccReviews)
        .where(and(inArray(dccReviews.ownerEmployeeId, ownerIds), gte(dccReviews.reviewDate, fromDate))),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-reviews" },
  );
}
