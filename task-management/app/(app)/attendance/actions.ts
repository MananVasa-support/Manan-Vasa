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
import { attendanceLogs, employees, type Employee, type NotificationKind } from "@/db/schema";
import { notify } from "@/lib/notifications/dispatch";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { localDateString } from "@/lib/format";
import { distanceMeters } from "@/lib/geo";
import { getOrgSettings } from "@/lib/queries/org-settings";
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

  const today = localDateString(me.timezone || "Asia/Kolkata");

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
