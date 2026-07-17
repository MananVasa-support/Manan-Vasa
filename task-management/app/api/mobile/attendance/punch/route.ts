import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { resolvePunchGeofence, insertPunchRow } from "@/lib/attendance/record-punch";
import { resolveMobileDevice } from "@/lib/attendance/mobile-devices";
import { isDccFilledFor } from "@/lib/dcc/gate";
import { needsDailyPlan } from "@/lib/daily-checklist/gate";
import { needsGoalActuals } from "@/lib/weekly-goals/actuals";
import { isManagerWithReports, isMondayIST, managerMondayGoalState } from "@/lib/manager-gates";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { satCommitGateOn, monApproveGateOn, checkoutCloseoutGateOn } from "@/lib/goals/flag";
import { isDayClosedOut } from "@/lib/queries/daily-checklist";
import { weekCommitSatisfied, managerApproveSatisfied } from "@/lib/goals/gates-predicates";
import { isSaturdayIST, isWeekdayIST } from "@/lib/goals/gate-day";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import { localDateString } from "@/lib/format";
import {
  notifyOnInPunch,
  notifyOnDayFinalized,
  alertAdminsNewAttendanceDevice,
  clockInTz,
} from "@/lib/attendance/punch-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type Body = {
  kind?: "in" | "out";
  note?: string;
  location?: { lat: number; lng: number; accuracyM: number };
  deviceId?: string;
  deviceLabel?: string;
  platform?: string;
};

const ok = (data: object) => NextResponse.json(data, { headers: MOBILE_CORS });
const err = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status, headers: MOBILE_CORS });

/**
 * POST /api/mobile/attendance/punch — native check-in / check-out.
 * Anti-proxy: the app gates this with the device's own fingerprint/Face ID
 * (expo-local-authentication) and sends a keystore-bound `deviceId`; the server
 * binds the punch to that registered phone (one phone ↔ one employee) and runs
 * the SAME geofence + day-finalize + notification rules as the web punch.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return err(429, limited.error);

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || (body.kind !== "in" && body.kind !== "out")) {
    return err(400, "kind must be 'in' or 'out'.");
  }
  if (typeof body.deviceId !== "string" || !body.deviceId.trim()) {
    return err(400, "A device id is required.");
  }
  const location = body.location;
  if (
    location &&
    (typeof location.lat !== "number" ||
      typeof location.lng !== "number" ||
      typeof location.accuracyM !== "number")
  ) {
    return err(400, "Invalid location.");
  }

  // ── Gate 1: geofence (shared with web) ──
  const settings = await getOrgSettings();
  const geo = resolvePunchGeofence(settings, location);
  if (!geo.ok) return err(400, geo.error);

  // ── Gate 2: device binding (the mobile anti-proxy) ──
  const device = await resolveMobileDevice(me.id, {
    deviceId: body.deviceId,
    label: body.deviceLabel ?? null,
    platform: body.platform ?? null,
  });
  if (!device.ok) return err(403, device.error);
  if (device.isNewDevice) {
    await alertAdminsNewAttendanceDevice(me, body.deviceLabel ?? null, device.deviceCount);
  }

  const tz = me.timezone || "Asia/Kolkata";

  // ── Saturday commit gate (NEW, default OFF; mirrors the web punch) ──
  // On Saturday, punch-out is blocked until next week is committed + this week's
  // progress filled. FAIL-OPEN; honors SAT_COMMIT_GATE_ON (default off ⇒ no-op).
  if (body.kind === "out" && satCommitGateOn() && isSaturdayIST()) {
    const committed = await weekCommitSatisfied(me.id, currentWeekStart()).catch(() => true);
    if (!committed) {
      return NextResponse.json(
        { ok: false, error: "Commit next week's goals and fill this week's progress before you clock out.", needsCommit: true },
        { status: 409, headers: MOBILE_CORS },
      );
    }
  }

  // ── Close-out gate (NEW, default OFF; mirrors the web punch) — checkout ORDER:
  // close out today's commitments, THEN DCC, THEN the punch. Sits above DCC.
  if (body.kind === "out" && checkoutCloseoutGateOn()) {
    const today = localDateString(tz);
    const closed = await isDayClosedOut(me.id, today).catch(() => true);
    if (!closed) {
      return NextResponse.json(
        { ok: false, error: "Mark your today's commitment before you clock out — open Plan my day, then Finish day.", needsCloseout: true },
        { status: 409, headers: MOBILE_CORS },
      );
    }
  }

  // ── DCC punch-out block (fail-open; honors DCC_GATE_OFF) ──
  // With the Sat commit gate live, DCC is enforced Mon–Fri only (Sat's ritual is
  // the commit above). Default (Sat gate off) ⇒ unchanged: DCC blocks every day.
  const dccBlockDay = satCommitGateOn() ? isWeekdayIST() : true;
  if (body.kind === "out" && dccBlockDay && process.env.DCC_GATE_OFF !== "true") {
    const today = localDateString(tz);
    const dccDone = await isDccFilledFor(me.id, today).catch(() => true);
    if (!dccDone) {
      return NextResponse.json(
        { ok: false, error: "Fill today's DCC before you clock out.", needsDcc: true },
        { status: 409, headers: MOBILE_CORS },
      );
    }
  }

  // ── Clock-IN planning gate (employees only; fail-open; PUNCH_PLAN_GATE_OFF) ──
  // Mirrors the web punch + layout "Plan Your Day" gate. Managers/admins/super-
  // admins exempt. Returns needsPlan so the app can route the user to the plan.
  if (body.kind === "in" && process.env.PUNCH_PLAN_GATE_OFF !== "true") {
    const exempt =
      isSuperAdmin(me.email) || me.isAdmin || (await isManagerWithReports(me.id).catch(() => true));
    if (!exempt) {
      const planned = !(await needsDailyPlan(me.id).catch(() => false));
      const actuals = !(await needsGoalActuals(me.id).catch(() => false));
      if (!planned || !actuals) {
        return NextResponse.json(
          { ok: false, error: "Plan your day (5 commitments + goal progress) before you clock in.", needsPlan: true },
          { status: 409, headers: MOBILE_CORS },
        );
      }
    }
  }

  // ── Monday manager-approval gate (NEW, default OFF; mirrors the web punch) ──
  // On Monday a manager can't clock IN until they've approved their downline's
  // last-week progress + this-week goals. FAIL-OPEN; honors MON_APPROVE_GATE_ON
  // (default off ⇒ no-op); super-admins + non-managers exempt.
  if (body.kind === "in" && monApproveGateOn() && !isSuperAdmin(me.email) && isMondayIST()) {
    const isMgr = await isManagerWithReports(me.id).catch(() => false);
    if (isMgr) {
      const approved = await managerApproveSatisfied(me.id, currentWeekStart()).catch(() => true);
      if (!approved) {
        return NextResponse.json(
          { ok: false, error: "Approve your team's last-week progress and this-week goals before you clock in.", needsApprove: true },
          { status: 409, headers: MOBILE_CORS },
        );
      }
    }
  }

  // ── Manager Monday goal-set gate (fail-open; MANAGER_GATES_OFF; SA exempt) ──
  if (
    body.kind === "in" &&
    process.env.MANAGER_GATES_OFF !== "true" &&
    !isSuperAdmin(me.email) &&
    isMondayIST()
  ) {
    const monday = await managerMondayGoalState(me.id).catch(() => ({ satisfied: true, reports: [] }));
    if (!monday.satisfied) {
      const shortNames = monday.reports.filter((r) => !r.ok).map((r) => r.name).join(", ");
      return NextResponse.json(
        { ok: false, error: `Set this week's goals (weights = 100) for ${shortNames} before you clock in.`, needsGoals: true },
        { status: 409, headers: MOBILE_CORS },
      );
    }
  }

  const inserted = await insertPunchRow(
    { id: me.id, timezone: tz },
    { kind: body.kind, note: body.note, location, distanceM: geo.distanceM },
    { verifyMethod: "biometric", mobileDeviceId: device.rowId, source: "self" },
  );
  if (!inserted.ok) return err(409, inserted.error);

  // Same best-effort notifications as the web punch.
  if (body.kind === "in") {
    await notifyOnInPunch(me, inserted.date, clockInTz(new Date(), tz));
  } else {
    await notifyOnDayFinalized(me, inserted.date);
  }

  return ok({ ok: true, date: inserted.date, newDevice: device.isNewDevice });
}
