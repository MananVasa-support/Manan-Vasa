"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import {
  attendanceLogs,
  employees,
  employeeEvents,
  type Employee,
  type NotificationKind,
} from "@/db/schema";
import { notify } from "@/lib/notifications/dispatch";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { localDateString } from "@/lib/format";
import { distanceMeters } from "@/lib/geo";
import { getOrgSettings } from "@/lib/queries/org-settings";
import {
  companyDefaults,
  employeeSchedule,
} from "@/lib/queries/attendance-status";
import {
  notifyAttendance,
  decideCheckoutNotification,
} from "@/lib/attendance/notify";
import { toMin } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";
import {
  AdminUpsertPunch,
  AdminEditDayTimes,
  AdminDeletePunch,
} from "@/lib/validators/attendance";
import {
  listCredentials,
  mintRegistrationOptions,
  verifyAndStoreRegistration,
  mintPunchOptions,
  verifyPunchAssertion,
} from "@/lib/webauthn/attendance";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// A GPS fix worse than this is treated as "no fix" — accepting a ±2km blob
// would make the 100m geofence meaningless.
const MAX_ACCURACY_M = 250;

const PunchSchema = z
  .object({
    kind: z.enum(["in", "out"]),
    note: z.string().trim().max(500).optional(),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracyM: z.number().min(0).max(100_000),
      })
      .optional(),
  })
  .strict();

/**
 * Record today's check-in or check-out. "Today" is the calendar day in the
 * employee's own timezone. One punch per kind per day — a duplicate returns
 * a friendly error instead of silently rewriting the log.
 *
 * Biometric + geofence (0054): when the admin has set an office location,
 * the punch must carry a GPS fix within `attendance_radius_m` of it; when
 * the employee has a registered passkey, the punch must carry a fresh
 * user-verified WebAuthn assertion (the device's fingerprint / Face ID).
 */
export async function punchAttendance(input: {
  kind: "in" | "out";
  note?: string;
  location?: { lat: number; lng: number; accuracyM: number };
  assertion?: AuthenticationResponseJSON;
}): Promise<ActionResult<{ date: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const { assertion, ...rest } = input;
  const parsed = PunchSchema.safeParse(rest);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { kind, note, location } = parsed.data;

  // ── Gate 1: geofence ────────────────────────────────────────────────
  // This gate runs for BOTH `kind: "in"` and `kind: "out"` — neither punch is
  // special-cased below, so check-out is fenced exactly like check-in.
  const settings = await getOrgSettings();
  const fenced = settings.officeLat != null && settings.officeLng != null;
  let distanceM: number | null = null;
  if (fenced) {
    if (!location) {
      return {
        ok: false,
        error: "Location is required to punch — please allow location access.",
      };
    }
    if (location.accuracyM > MAX_ACCURACY_M) {
      return {
        ok: false,
        error: `GPS fix too imprecise (±${Math.round(location.accuracyM)}m). Enable precise location and try again.`,
      };
    }
    distanceM = distanceMeters(
      location.lat,
      location.lng,
      settings.officeLat!,
      settings.officeLng!,
    );
    if (distanceM > settings.attendanceRadiusM) {
      return {
        ok: false,
        error: `You're ${Math.round(distanceM)}m from the office — punches register only within ${settings.attendanceRadiusM}m.`,
      };
    }
  } else if (location) {
    // No fence configured — still record where the punch happened.
    distanceM = null;
  }

  // ── Gate 2: biometric (MANDATORY unless admin-exempted) ─────────────
  // This is the anti-proxy gate. Without it, an account with no passkey only
  // needed a GPS fix inside the fence, so a colleague at the office could
  // punch for an absent person with a shared password. Now: a registered
  // device + live fingerprint/Face-ID is required. The only bypass is an
  // admin-set exemption for employees whose phone has no biometric sensor —
  // they fall back to GPS-only.
  let verifyMethod: "biometric" | "gps_only" = "gps_only";
  let credentialId: string | null = null;
  const creds = await listCredentials(me.id);
  if (creds.length > 0) {
    if (!assertion) {
      return {
        ok: false,
        error: "Biometric confirmation required — punch from your own registered device.",
      };
    }
    const verdict = await verifyPunchAssertion(me.id, assertion);
    if (!verdict.ok) return verdict;
    verifyMethod = "biometric";
    credentialId = verdict.credentialId;
  } else if (!me.attendanceBiometricExempt) {
    return {
      ok: false,
      error:
        "Set up biometric punch on your own phone before checking in. (No fingerprint sensor on your device? Ask an admin to enable the exemption.)",
    };
  }
  // exempt + no credential → GPS-only is allowed (verifyMethod stays "gps_only").

  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // Self punches are today-only: an employee may never backfill a past day.
  // `today` is derived from the employee's own clock above, so this also
  // hard-stops any future variant that lets the client pass a logDate.
  // Backfilling / corrections go through the audited admin actions below.
  if (today !== localDateString(tz)) {
    return { ok: false, error: "You can only mark attendance for today." };
  }

  try {
    await db.insert(attendanceLogs).values({
      employeeId: me.id,
      logDate: today,
      kind,
      note: note ? note : null,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      accuracyM: location?.accuracyM ?? null,
      distanceM,
      verifyMethod,
      credentialId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("attendance_logs_employee_day_kind_uq")) {
      return {
        ok: false,
        error:
          kind === "in"
            ? "You already checked in today."
            : "You already checked out today.",
      };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

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

/** Step 1 of registering this device's fingerprint/Face ID for punching. */
export async function startBiometricSetup(): Promise<
  ActionResult<{ options: PublicKeyCredentialCreationOptionsJSON }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const options = await mintRegistrationOptions({
    id: me.id,
    name: me.name,
    email: me.email,
  });
  return { ok: true, options };
}

/** Step 2 — store the verified credential. */
export async function finishBiometricSetup(
  response: RegistrationResponseJSON,
  deviceLabel?: string,
): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const result = await verifyAndStoreRegistration(
    me.id,
    response,
    deviceLabel?.slice(0, 120) ?? null,
  );
  if (!result.ok) return result;
  revalidatePath("/attendance");
  // Tell admins a new attendance device was enrolled — the second line of
  // defence against proxy punching (someone enrolling on a colleague's phone).
  if (result.isNewDevice) {
    await alertAdminsNewAttendanceDevice(me, deviceLabel ?? null, result.deviceCount);
  }
  return { ok: true };
}

/**
 * In-app heads-up to every active admin that an employee registered a new
 * biometric device for attendance. In-app only (forceChannels: []) — it's a
 * security audit signal, not something to email/Slack the whole admin team.
 * Best-effort: never blocks the registration that triggered it.
 */
async function alertAdminsNewAttendanceDevice(
  actor: Employee,
  deviceLabel: string | null,
  deviceCount: number,
): Promise<void> {
  try {
    const admins = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.isAdmin, true), eq(employees.isActive, true)));

    const label = deviceLabel?.trim() || "a new device";
    const title =
      deviceCount > 1
        ? `${actor.name} added another attendance device`
        : `${actor.name} enrolled a biometric attendance device`;
    const body = `${actor.name} registered ${label} for biometric punch (now ${deviceCount} device${deviceCount === 1 ? "" : "s"}). A passkey on someone else's phone can punch on their behalf — review if this looks off.`;

    await Promise.all(
      admins
        .filter((a) => a.id !== actor.id) // don't alert the registrant themselves
        .map((a) =>
          notify({
            userId: a.id,
            kind: "attendance_device" as NotificationKind,
            title,
            body,
            actorId: actor.id,
            forceChannels: [], // in-app inbox only
          }),
        ),
    );
  } catch (err) {
    console.warn("[attendance] admin new-device alert failed (non-fatal)", err);
  }
}

/** Fresh challenge for a biometric punch. Null options = nothing registered. */
export async function startBiometricPunch(): Promise<
  ActionResult<{ options: PublicKeyCredentialRequestOptionsJSON | null }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const options = await mintPunchOptions(me.id);
  return { ok: true, options };
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
  const { employeeId, logDate, kind, timeHHmm, reason } = parsed.data;

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
        recordedById: me.id,
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
          recordedById: me.id,
          verifyMethod: "none",
        },
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await auditPunch(me.id, employeeId, "attendance_punch_upsert", {
    logDate,
    kind,
    timeHHmm,
    reason,
  });
  // If this upsert finalized the day (both in + out now present), fire the
  // same waived/half-day email an organic check-out would. Best-effort.
  const target = await targetForNotify(employeeId);
  if (target) await notifyOnDayFinalized(target, logDate);
  revalidateAttendanceAdmin();
  return { ok: true };
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
  if (target) await notifyOnDayFinalized(target, logDate);
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

// ════════════════════════════════════════════════════════════════════════════
// Attendance notifications (Task A8) — best-effort triggers
//
// Fired AFTER the punch/edit is committed. Each helper is wrapped so a notify
// failure (or a schedule lookup miss) can never break the underlying punch.
// ════════════════════════════════════════════════════════════════════════════

/** "HH:mm" wall-clock of a timestamptz in `tz`. */
function clockInTz(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

/** Resolve an employee's effective attendance schedule (org defaults + their
 *  per-employee lateAfter/earlyBefore overrides). */
async function resolveScheduleFor(emp: {
  attLateAfter: string | null;
  attEarlyBefore: string | null;
}): Promise<AttendanceSchedule> {
  const org = await getOrgSettings();
  return employeeSchedule(emp, companyDefaults(org));
}

/** Read an employee's folded in/out "HH:mm" (in `tz`) for one log day. */
async function readDayTimes(
  employeeId: string,
  logDate: string,
  tz: string,
): Promise<{ inAt: string | null; outAt: string | null }> {
  const rows = await db
    .select({ kind: attendanceLogs.kind, loggedAt: attendanceLogs.loggedAt })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.employeeId, employeeId),
        eq(attendanceLogs.logDate, logDate),
      ),
    );
  let inAt: string | null = null;
  let outAt: string | null = null;
  for (const r of rows) {
    const t = clockInTz(r.loggedAt, tz);
    if (r.kind === "in") inAt = t;
    else outAt = t;
  }
  return { inAt, outAt };
}

/**
 * Decide + fire the right attendance email for a SELF check-in. A late arrival
 * gets the `attendance_late` heads-up immediately (the waiver, if any, comes
 * later on check-out). Best-effort.
 */
async function notifyOnInPunch(
  emp: { id: string; attLateAfter: string | null; attEarlyBefore: string | null },
  logDate: string,
  inAt: string,
): Promise<void> {
  try {
    const sched = await resolveScheduleFor(emp);
    if (toMin(inAt) > toMin(sched.lateAfter)) {
      await notifyAttendance("attendance_late", emp, { logDate, inAt });
    }
  } catch (err) {
    console.warn("[attendance] notifyOnInPunch failed (non-fatal)", err);
  }
}

/**
 * Decide + fire the right attendance email when a day's OUT is finalized (self
 * check-out, or an admin edit/upsert that completes the day). Re-reads both
 * punches so the decision matches the graded day. Best-effort.
 */
async function notifyOnDayFinalized(
  emp: { id: string; timezone: string; attLateAfter: string | null; attEarlyBefore: string | null },
  logDate: string,
): Promise<void> {
  try {
    const tz = emp.timezone || "Asia/Kolkata";
    const { inAt, outAt } = await readDayTimes(emp.id, logDate, tz);
    if (!inAt || !outAt) return;
    const sched = await resolveScheduleFor(emp);
    const kind = decideCheckoutNotification({ inAt, outAt, sched });
    if (!kind) return;
    const worked = Math.max(0, toMin(outAt) - toMin(inAt));
    await notifyAttendance(kind, emp, { logDate, inAt, outAt, workedMinutes: worked });
  } catch (err) {
    console.warn("[attendance] notifyOnDayFinalized failed (non-fatal)", err);
  }
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
