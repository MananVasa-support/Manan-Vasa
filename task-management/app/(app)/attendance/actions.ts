"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { attendanceLogs } from "@/db/schema";
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

  // ── Gate 2: biometric ───────────────────────────────────────────────
  let verifyMethod: "biometric" | "gps_only" = "gps_only";
  let credentialId: string | null = null;
  const creds = await listCredentials(me.id);
  if (creds.length > 0) {
    if (!assertion) {
      return {
        ok: false,
        error: "Biometric confirmation required — punch from a registered device.",
      };
    }
    const verdict = await verifyPunchAssertion(me.id, assertion);
    if (!verdict.ok) return verdict;
    verifyMethod = "biometric";
    credentialId = verdict.credentialId;
  }

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
  if (result.ok) revalidatePath("/attendance");
  return result;
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
