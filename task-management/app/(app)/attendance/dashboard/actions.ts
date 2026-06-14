"use server";

import { requireAdmin } from "@/lib/auth/current";
import {
  getEmployeeMonthStatus,
  type EmployeeMonthStatus,
} from "@/lib/queries/attendance-status";
import { localDateString } from "@/lib/format";

/** Default reporting timezone for the admin dashboard. The per-employee query
 *  reads each employee's own tz internally; this is only used to derive the
 *  caller's "today" for the live-row grading. */
const DEFAULT_TZ = "Asia/Kolkata";

/**
 * Fetch one employee's daily month status for the drill-down dialog
 * (Task A6). Admin-only. `refTodayISO` is computed server-side in the default
 * reporting tz so the current-day row uses the live clock.
 */
export async function fetchEmployeeMonthDetail(
  employeeId: string,
  year: number,
  month: number,
): Promise<{ ok: boolean; error?: string; data?: EmployeeMonthStatus }> {
  await requireAdmin();
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return { ok: false, error: "Invalid month." };
  }
  try {
    const refTodayISO = localDateString(DEFAULT_TZ);
    const data = await getEmployeeMonthStatus(employeeId, year, month, refTodayISO);
    return { ok: true, data };
  } catch (err) {
    console.error("[fetchEmployeeMonthDetail] failed", err);
    return { ok: false, error: "Could not load attendance detail." };
  }
}
