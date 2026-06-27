"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  attendanceLogs,
  employees,
  employeeEvents,
  type Employee,
  type NotificationKind,
} from "@/db/schema";
import type { PunchReason } from "@/db/enums";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { localDateString } from "@/lib/format";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { insertPunchRow, resolvePunchGeofence } from "@/lib/attendance/record-punch";
import { isDccFilledFor } from "@/lib/dcc/gate";
import { needsDailyPlan } from "@/lib/daily-checklist/gate";
import { needsGoalActuals } from "@/lib/weekly-goals/actuals";
import { isManagerWithReports, isMondayIST, managerMondayGoalState } from "@/lib/manager-gates";
import {
  notifyOnInPunch,
  notifyOnDayFinalized,
  notifyAdminLateDeduction,
  clockInTz,
} from "@/lib/attendance/punch-notify";
import {
  AdminUpsertPunch,
  AdminEditDayTimes,
  AdminDeletePunch,
} from "@/lib/validators/attendance";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PunchSchema = z
  .object({
    kind: z.enum(["in", "out"]),
    note: z.string().trim().max(500).optional(),
    location: z
      .object({
        lat: z.number().finite(),
        lng: z.number().finite(),
        accuracyM: z.number().finite().nonnegative(),
      })
      .optional(),
  })
  .strict();

/**
 * Record today's check-in or check-out. "Today" is the calendar day in the
 * employee's own timezone. One punch per kind per day — a duplicate returns a
 * friendly error instead of silently rewriting the log.
 *
 * The ONLY gate is the office geofence (location). When the admin has set
 * office coordinates the punch must carry a GPS fix inside `attendanceRadiusM`;
 * otherwise location is recorded but never rejected. No Wi-Fi/IP allowlist, no
 * biometric on the web path — verifyMethod is "gps_only".
 */
export async function punchAttendance(input: {
  kind: "in" | "out";
  note?: string;
  location?: { lat: number; lng: number; accuracyM: number };
}): Promise<ActionResult<{ date: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = PunchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, note, location } = parsed.data;

  const settings = await getOrgSettings();

  // ── The ONLY gate: office geofence ───────────────────────────────────
  // When office coordinates are configured the punch must carry a GPS fix
  // inside the radius (with an accuracy guard — an imprecise fix asks for
  // precise location). When no coordinates are set the punch is accepted from
  // anywhere and location is still recorded. Shared verbatim with the mobile
  // punch via resolvePunchGeofence so the rule never diverges.
  const geo = resolvePunchGeofence(settings, location);
  if (!geo.ok) return { ok: false, error: geo.error };

  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // ── DCC punch-out block ──────────────────────────────────────────────
  // You can't clock OUT for the day until today's DCC is filled. FAIL-OPEN:
  // a check error never traps a punch-out. Honors the DCC_GATE_OFF switch.
  if (kind === "out" && process.env.DCC_GATE_OFF !== "true") {
    const dccDone = await isDccFilledFor(me.id, today).catch(() => true);
    if (!dccDone) {
      return { ok: false, error: "Fill today's DCC before you clock out — open the DCC page, then try again." };
    }
  }

  // ── Clock-IN planning gate (employees only) ──────────────────────────
  // An employee must "Plan Your Day" — commit ≥5 today AND log today's progress
  // on each open weekly goal — before clocking IN. Managers, admins and super-
  // admins are EXEMPT. FAIL-OPEN (any check error → allow the punch), honors
  // PUNCH_PLAN_GATE_OFF. Mirrors the layout gate so the mobile punch can't skip it.
  if (kind === "in" && process.env.PUNCH_PLAN_GATE_OFF !== "true") {
    const exempt =
      isSuperAdmin(me.email) || me.isAdmin || (await isManagerWithReports(me.id).catch(() => true));
    if (!exempt) {
      const planned = !(await needsDailyPlan(me.id).catch(() => false));
      const actuals = !(await needsGoalActuals(me.id).catch(() => false));
      if (!planned || !actuals) {
        return {
          ok: false,
          error: "Plan your day first — commit your 5 and log today's goal progress on the Daily Checklist, then clock in.",
        };
      }
    }
  }

  // ── Manager Monday goal-set gate ─────────────────────────────────────
  // On Monday (IST) a manager can't clock IN until every active report has this
  // week's goals set with weights summing to 100 (satisfied if set over the
  // weekend). FAIL-OPEN, honors MANAGER_GATES_OFF, super-admins exempt.
  if (
    kind === "in" &&
    process.env.MANAGER_GATES_OFF !== "true" &&
    !isSuperAdmin(me.email) &&
    isMondayIST()
  ) {
    const monday = await managerMondayGoalState(me.id).catch(() => ({ satisfied: true, reports: [] }));
    if (!monday.satisfied) {
      const short = monday.reports.filter((r) => !r.ok).map((r) => r.name).join(", ");
      return {
        ok: false,
        error: `Set this week's goals (weights = 100) for ${short} before you clock in — open Weekly Goals.`,
      };
    }
  }

  // Insert via the shared core (today-only; one punch per kind per day).
  // verifyMethod "gps_only": location-verified, no biometric on the web path.
  const inserted = await insertPunchRow(
    { id: me.id, timezone: tz },
    { kind, note, location, distanceM: geo.distanceM },
    { verifyMethod: "gps_only", source: "self" },
  );
  if (!inserted.ok) return inserted;

  // ── Best-effort attendance notifications (Task A8) ───────────────────
  // The punch is committed above; a notify failure must never surface to the
  // user. On check-in we flag a late arrival; on check-out we recompute the
  // finalized day and fire waived/half-day as appropriate.
  if (kind === "in") {
    const inAt = clockInTz(new Date(), tz);
    await notifyOnInPunch(me, today, inAt);
  } else {
    await notifyOnDayFinalized(me, today);
  }

  revalidatePath("/attendance");
  return { ok: true, date: today };
}

// ════════════════════════════════════════════════════════════════════════════
// Admin punch management (Attendance Phase A, Task A4)
//
// Admins can backfill, correct, or remove an employee's in/out punches — the
// escape hatch the self-only `punchAttendance` deliberately lacks. Every write
// carries `source:"admin"`, a `reason`, the acting admin (`recordedById`), and
// an immutable `employee_events` audit row, so a corrected log stays honest.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a timestamptz for `${ymd} ${hhmm}` interpreted as wall-clock time in
 * `tz` (e.g. an admin types 10:30 for an employee in Asia/Kolkata → the UTC
 * instant that reads 10:30 there). Mirrors how `punchAttendance`/`logDate`
 * pin everything to the employee's own timezone rather than the server's UTC.
 */
function zonedWallClockToUtc(ymd: string, hhmm: string, tz: string): Date {
  const dParts = ymd.split("-").map((n) => parseInt(n, 10));
  const tParts = hhmm.split(":").map((n) => parseInt(n, 10));
  const y = dParts[0] ?? 1970;
  const mo = dParts[1] ?? 1;
  const d = dParts[2] ?? 1;
  const h = tParts[0] ?? 0;
  const mi = tParts[1] ?? 0;
  // Treat the wall-clock fields as if they were UTC, then correct by the zone's
  // offset at that instant. One iteration is exact except across the rare DST
  // boundary; India (the only configured tz) has no DST, so this is exact.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offsetMs = tzOffsetMs(new Date(asUtc), tz);
  return new Date(asUtc - offsetMs);
}

/** Offset (ms) of `tz` from UTC at instant `at` (positive east of UTC). */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}

/** Load the target employee's timezone (defaulting to IST), or null if gone. */
async function targetTz(employeeId: string): Promise<string | null> {
  const [row] = await db
    .select({ timezone: employees.timezone })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return null;
  return row.timezone || "Asia/Kolkata";
}

/** Load the notify-relevant slice of the target employee (for Task A8 admin
 *  triggers). Returns null if the employee is gone. */
async function targetForNotify(employeeId: string): Promise<{
  id: string;
  timezone: string;
  attLateAfter: string | null;
  attEarlyBefore: string | null;
} | null> {
  const [row] = await db
    .select({
      id: employees.id,
      timezone: employees.timezone,
      attLateAfter: employees.attLateAfter,
      attEarlyBefore: employees.attEarlyBefore,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return null;
  return { ...row, timezone: row.timezone || "Asia/Kolkata" };
}

function revalidateAttendanceAdmin(): void {
  revalidatePath("/attendance/dashboard");
  revalidatePath("/attendance/manage");
}

/**
 * Create or overwrite a single in/out punch for an employee+day. Upsert on the
 * (employee, day, kind) unique index: a second admin punch of the same kind
 * updates the time/reason rather than failing.
 */
export async function adminUpsertPunch(
  input: unknown,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdminUpsertPunch.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  return upsertPunchCore(me.id, parsed.data);
}

/**
 * Shared upsert body for admin-recorded punches: writes the in/out punch as
 * `source:"admin"` (`verifyMethod:"none"`, no biometric/geofence), audits it,
 * fires the day-finalized / late-deduction emails when the day is now
 * complete, and revalidates. Called by `adminUpsertPunch` (any admin, via the
 * dashboard day-detail dialog) and `superAdminQuickPunch` (super-admins,
 * inline on the team list).
 */
async function upsertPunchCore(
  meId: string,
  {
    employeeId,
    logDate,
    kind,
    timeHHmm,
    reason,
  }: {
    employeeId: string;
    logDate: string;
    kind: "in" | "out";
    timeHHmm: string;
    reason: PunchReason;
  },
): Promise<ActionResult> {
  const tz = await targetTz(employeeId);
  if (!tz) return { ok: false, error: "Employee not found." };
  const loggedAt = zonedWallClockToUtc(logDate, timeHHmm, tz);

  try {
    await db
      .insert(attendanceLogs)
      .values({
        employeeId,
        logDate,
        kind,
        loggedAt,
        source: "admin",
        reason,
        recordedById: meId,
        verifyMethod: "none",
      })
      .onConflictDoUpdate({
        target: [
          attendanceLogs.employeeId,
          attendanceLogs.logDate,
          attendanceLogs.kind,
        ],
        set: {
          loggedAt,
          source: "admin",
          reason,
          recordedById: meId,
          verifyMethod: "none",
        },
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await auditPunch(meId, employeeId, "attendance_punch_upsert", {
    logDate,
    kind,
    timeHHmm,
    reason,
  });
  // If this upsert finalized the day (both in + out now present), fire the
  // same waived/half-day email an organic check-out would. Best-effort.
  const target = await targetForNotify(employeeId);
  if (target) {
    await notifyOnDayFinalized(target, logDate);
    await notifyAdminLateDeduction(target, logDate);
  }
  revalidateAttendanceAdmin();
  return { ok: true };
}

/**
 * Inline team-list quick punch — super-admins (Hetesh / Manan) only, TODAY
 * only. Stamps an employee's in/out for the current day at a super-admin-typed
 * time. The reason is fixed to "correction" so the UI stays decoupled from the
 * reason enum; everything else (audit, emails, source:"admin") flows through
 * `upsertPunchCore`. Guarded on BOTH super-admin and today so a crafted call
 * for another admin or a past date is refused.
 */
export async function superAdminQuickPunch(
  input: unknown,
): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only super-admins can mark attendance here." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Inject the fixed reason before parsing the strict schema (the client only
  // sends employeeId / logDate / kind / timeHHmm).
  const withReason =
    typeof input === "object" && input !== null
      ? { ...(input as Record<string, unknown>), reason: "correction" }
      : input;
  const parsed = AdminUpsertPunch.safeParse(withReason);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const tz = me.timezone || "Asia/Kolkata";
  if (parsed.data.logDate !== localDateString(tz)) {
    return { ok: false, error: "Quick punch is for today only." };
  }
  return upsertPunchCore(me.id, parsed.data);
}

/**
 * Edit the existing in/out punch times for an employee+day. Only the supplied
 * side(s) are touched; a missing punch row is left as-is (use `adminUpsertPunch`
 * to create one). The reason on the existing rows is preserved.
 */
export async function adminEditDayTimes(
  input: unknown,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdminEditDayTimes.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, logDate, inHHmm, outHHmm } = parsed.data;

  const tz = await targetTz(employeeId);
  if (!tz) return { ok: false, error: "Employee not found." };

  try {
    if (inHHmm) {
      await db
        .update(attendanceLogs)
        .set({ loggedAt: zonedWallClockToUtc(logDate, inHHmm, tz) })
        .where(
          and(
            eq(attendanceLogs.employeeId, employeeId),
            eq(attendanceLogs.logDate, logDate),
            eq(attendanceLogs.kind, "in"),
          ),
        );
    }
    if (outHHmm) {
      await db
        .update(attendanceLogs)
        .set({ loggedAt: zonedWallClockToUtc(logDate, outHHmm, tz) })
        .where(
          and(
            eq(attendanceLogs.employeeId, employeeId),
            eq(attendanceLogs.logDate, logDate),
            eq(attendanceLogs.kind, "out"),
          ),
        );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await auditPunch(me.id, employeeId, "attendance_punch_edit", {
    logDate,
    inHHmm: inHHmm ?? null,
    outHHmm: outHHmm ?? null,
  });
  // Re-grade the (now edited) day and fire waived/half-day if it applies.
  const target = await targetForNotify(employeeId);
  if (target) {
    await notifyOnDayFinalized(target, logDate);
    await notifyAdminLateDeduction(target, logDate);
  }
  revalidateAttendanceAdmin();
  return { ok: true };
}

/** Delete a single in/out punch for an employee+day. */
export async function adminDeletePunch(
  input: unknown,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AdminDeletePunch.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, logDate, kind } = parsed.data;

  try {
    await db
      .delete(attendanceLogs)
      .where(
        and(
          eq(attendanceLogs.employeeId, employeeId),
          eq(attendanceLogs.logDate, logDate),
          eq(attendanceLogs.kind, kind),
        ),
      );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await auditPunch(me.id, employeeId, "attendance_punch_delete", {
    logDate,
    kind,
  });
  revalidateAttendanceAdmin();
  return { ok: true };
}


/** Append an immutable `employee_events` audit row for an admin punch change.
 *  Best-effort: a failed audit write must never roll back the data change. */
async function auditPunch(
  actorId: string,
  employeeId: string,
  eventType: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(employeeEvents).values({
      employeeId,
      actorId,
      eventType,
      toValue: detail,
      note: `Admin ${eventType} ${JSON.stringify(detail)}`,
    });
  } catch (err) {
    console.error("[attendance] admin punch audit write failed", err);
  }
}
