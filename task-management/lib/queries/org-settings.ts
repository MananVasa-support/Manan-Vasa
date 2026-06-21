import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSettings, type OrgSettings } from "@/db/schema";
import { withTimeoutOr } from "@/lib/db/with-timeout";

/**
 * The single-row `org_settings` table has `id = 1` as the only valid row.
 * The seed migration inserts it; we never insert from app code.  If the
 * row is somehow missing (fresh DB without migrations), we fall back to
 * the schema defaults so the caller never has to null-check.
 */
const DEFAULTS: OrgSettings = {
  id: 1,
  companyName: "Altus Corp",
  logoUrl: null,
  digestHourIst: 9,
  idleTimeoutMinutes: 10,
  workingDays: [1, 2, 3, 4, 5],
  timezone: "Asia/Kolkata",
  allowSelfRegister: false,
  notificationMatrix: {
    task_assigned:  ["email", "slack", "whatsapp", "push"],
    task_initiated: ["email", "slack", "whatsapp", "push"],
    status_changed: ["email", "slack", "whatsapp", "push"],
    approved:       ["email", "slack", "whatsapp", "push"],
    declined:       ["email", "slack", "whatsapp", "push"],
    reassigned:     ["email", "slack", "whatsapp", "push"],
    transferred:    ["email", "slack", "whatsapp", "push"],
    cancelled:      ["email", "slack", "whatsapp", "push"],
    commented:      ["email", "slack", "whatsapp", "push"],
    overdue_digest: ["email"],
  },
  boardColumnOrder: null,
  officeLat: null,
  officeLng: null,
  attendanceRadiusM: 100,
  officeIpAllowlist: null,
  attLateAfter: "10:50",
  attEarlyBefore: "19:20",
  attFullDayHours: "9",
  attHalfDayHours: "5",
  updatedAt: new Date(0),
  updatedById: null,
};

export async function getOrgSettings(): Promise<OrgSettings> {
  // Read in the app layout on every authed page, so a hang here would freeze the
  // whole app. Bound it and fall back to DEFAULTS on timeout/error (a stale
  // pooled connection must never block rendering).
  const rows = await withTimeoutOr(
    db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1),
    5000,
    [] as OrgSettings[],
    "org-settings",
  );
  return rows[0] ?? DEFAULTS;
}
