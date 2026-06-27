import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, dccEntries, dccReviews, employees, type Employee } from "@/db/schema";
import { listOwnerItems, type DccItemRow, type DccEntryRow } from "@/lib/queries/dcc";
import { loadDccScope } from "@/lib/dcc/access";
import { isDueOn } from "@/lib/dcc/util";
import { localDateString } from "@/lib/format";

const TZ = "Asia/Kolkata"; // org timezone — attendance log_date is stored in IST

/** Add `delta` calendar days to a YYYY-MM-DD string (pure, no tz drift). */
function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/**
 * DCC compliance gate. Two enforcement points share one rule:
 *   • Morning layout gate  — fill the most recent present working day's DCC.
 *   • Evening punch-out     — today's DCC must be filled before clocking out.
 *
 * "Present working day" = the employee has an in-punch that date (so absent,
 * holiday, weekly-off and on-leave days — which carry no in-punch — are skipped
 * automatically; "fetch from attendance"). All reads are cheap + day-scoped;
 * callers wrap in `.catch()` so a DB hiccup never gates/blocks (fail-open).
 */

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Did the employee punch IN on this calendar day? (Indexed lookup.) */
async function hadInPunch(employeeId: string, ymd: string): Promise<boolean> {
  const [row] = await db
    .select({ id: attendanceLogs.id })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.employeeId, employeeId), eq(attendanceLogs.logDate, ymd), eq(attendanceLogs.kind, "in")))
    .limit(1);
  return Boolean(row);
}

/** Items DUE on `ymd` (by weekday mask) + that day's entries. */
async function dueForDay(employeeId: string, ymd: string): Promise<{ due: DccItemRow[]; entries: DccEntryRow[] }> {
  const items = await listOwnerItems(employeeId);
  const day = ymdToDate(ymd);
  const due = items.filter((it) => isDueOn(it.weekdays, day));
  if (due.length === 0) return { due: [], entries: [] };
  const ids = due.map((i) => i.id);
  const entries = (await db
    .select({ itemId: dccEntries.itemId, entryDate: dccEntries.entryDate, status: dccEntries.status, valueNumber: dccEntries.valueNumber, note: dccEntries.note })
    .from(dccEntries)
    .where(and(inArray(dccEntries.itemId, ids), eq(dccEntries.entryDate, ymd)))) as DccEntryRow[];
  return { due, entries };
}

function unfilledCount(due: DccItemRow[], entries: DccEntryRow[]): number {
  const filled = new Set(entries.filter((e) => (e.status ?? "").trim()).map((e) => e.itemId));
  return due.filter((i) => !filled.has(i.id)).length;
}

export interface DccGateTarget {
  date: string;
  items: DccItemRow[];
  entries: DccEntryRow[];
}

/**
 * The day whose DCC must be filled before the app opens, or null to pass.
 * Walks back from yesterday up to 7 days to the FIRST present working day; if
 * its due items aren't all filled, that day is the target. Only ever requires
 * the single most recent present working day (no backlog wall).
 */
export async function dccGateTarget(employeeId: string, now: Date = new Date()): Promise<DccGateTarget | null> {
  const today = localDateString(TZ, now);
  for (let back = 1; back <= 7; back++) {
    const ymd = addDaysYmd(today, -back);
    if (!(await hadInPunch(employeeId, ymd))) continue; // absent / holiday / off → skip
    const { due, entries } = await dueForDay(employeeId, ymd);
    if (due.length === 0) return null; // present but nothing due → nothing to gate
    return unfilledCount(due, entries) > 0 ? { date: ymd, items: due, entries } : null;
  }
  return null;
}

/** Is `ymd`'s DCC fully filled for this employee? (Punch-out block.) */
export async function isDccFilledFor(employeeId: string, ymd: string): Promise<boolean> {
  const { due, entries } = await dueForDay(employeeId, ymd);
  return due.length === 0 || unfilledCount(due, entries) === 0;
}

// ── Manager morning review gate ───────────────────────────────────────────────

export interface DccReviewReport {
  id: string;
  name: string;
  avatarUrl: string | null;
  date: string;
  due: number;
  done: number;
  reviewed: boolean;
}
export interface DccManagerReviewState {
  satisfied: boolean;
  date: string;
  reports: DccReviewReport[];
}

/**
 * Managers must review each present report's yesterday DCC before the app
 * opens. Review date = yesterday; reports absent yesterday (no in-punch) are
 * exempt. Satisfied once every present report has a dcc_reviews row.
 */
export async function dccManagerReviewState(me: Employee, now: Date = new Date()): Promise<DccManagerReviewState> {
  const scope = await loadDccScope(me);
  const reportIds = [...scope.visibleIds].filter((id) => id !== me.id);
  const date = addDaysYmd(localDateString(TZ, now), -1);
  if (reportIds.length === 0) return { satisfied: true, date, reports: [] };

  // Who was present yesterday (had an in-punch)?
  const punched = (await db
    .select({ employeeId: attendanceLogs.employeeId })
    .from(attendanceLogs)
    .where(and(inArray(attendanceLogs.employeeId, reportIds), eq(attendanceLogs.logDate, date), eq(attendanceLogs.kind, "in")))) as Array<{ employeeId: string }>;
  const presentIds = [...new Set(punched.map((p) => p.employeeId))];
  if (presentIds.length === 0) return { satisfied: true, date, reports: [] };

  const reviewed = new Set(
    ((await db
      .select({ owner: dccReviews.ownerEmployeeId })
      .from(dccReviews)
      .where(and(inArray(dccReviews.ownerEmployeeId, presentIds), eq(dccReviews.reviewDate, date)))) as Array<{ owner: string }>).map((r) => r.owner),
  );

  // Names + yesterday compliance for the UI.
  const people = (await db
    .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
    .from(employees)
    .where(inArray(employees.id, presentIds))) as Array<{ id: string; name: string; avatarUrl: string | null }>;

  const reports: DccReviewReport[] = [];
  for (const p of people) {
    const { due, entries } = await dueForDay(p.id, date);
    const done = entries.filter((e) => (e.status ?? "").toLowerCase() === "done").length;
    reports.push({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, date, due: due.length, done, reviewed: reviewed.has(p.id) });
  }
  reports.sort((a, b) => a.name.localeCompare(b.name));
  return { satisfied: reports.every((r) => r.reviewed), date, reports };
}
