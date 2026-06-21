import "server-only";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
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

// `org_settings` is a single, rarely-changed row read in the (app) layout on
// EVERY authed page for EVERY user. Uncached, that's one DB round-trip per page
// load per user — pure pooler load during a login rush. Cache it for 60s
// (time-based): the only field on the hot path is idleTimeoutMinutes, so a
// settings change taking up to 60s to propagate is harmless. This is a
// CROSS-user cache (one shared key), so after the first load fills it the whole
// team skips this query for 60s — meaningful relief when many people load at
// once. Stays inside the withTimeoutOr below so a cache MISS can't hang a page.
const readOrgSettingsRow = unstable_cache(
  () => db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1),
  ["org-settings:v1"],
  { revalidate: 60 },
);

export async function getOrgSettings(): Promise<OrgSettings> {
  // Read in the app layout on every authed page, so a hang here would freeze the
  // whole app. Bound it and fall back to DEFAULTS on timeout/error (a stale
  // pooled connection must never block rendering).
  const rows = await withTimeoutOr(
    readOrgSettingsRow(),
    5000,
    [] as OrgSettings[],
    "org-settings",
  );
  return rows[0] ?? DEFAULTS;
}
