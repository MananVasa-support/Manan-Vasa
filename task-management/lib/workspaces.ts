/**
 * Workspaces = the six "rooms" of the company (the hub cards). Each workspace
 * owns a set of routes and shows ONLY its own modules in the top nav — entering
 * WMS must not surface Attendance/Salary/Outstanding, etc.
 *
 * The active workspace is remembered in the `aw` cookie, set when a hub card is
 * opened via `/ws/<id>`. The nav reads it; for cold deep-links it falls back to
 * deriving the owner from the path.
 *
 * This module is intentionally PURE — no icons, no `server-only` — so both the
 * `/ws` route handler (server) and the client nav can import it.
 */
export const WORKSPACE_IDS = [
  "wms",
  "admin",
  "employees",
  "hr",
  "sales",
  "training",
  "accounts",
  "events",
  "goals",
] as const;

export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export function isWorkspaceId(v: string | undefined | null): v is WorkspaceId {
  return !!v && (WORKSPACE_IDS as readonly string[]).includes(v);
}

export const WORKSPACE_LABEL: Record<WorkspaceId, string> = {
  wms: "WMS",
  admin: "Admin",
  employees: "Employees",
  hr: "HR",
  sales: "Sales",
  training: "Training",
  accounts: "Accounts",
  events: "Monthly Events Master",
  goals: "Goals",
};

/** Where each card drops you when you enter the workspace. */
export const WORKSPACE_LANDING: Record<WorkspaceId, string> = {
  wms: "/dashboard",
  // The Admin workspace now opens to Accounts (the day-to-day surface). The
  // red-pill Admin control-room (/admin) is reachable only from the user-menu
  // "Admin panel" link — it's no longer the Admin card's landing.
  admin: "/accounts",
  employees: "/attendance",
  hr: "/hr",
  sales: "/outstanding",
  training: "/training",
  accounts: "/accounts",
  events: "/events",
  // The module entry = the Yearly board (the level pages' landing). With the
  // canvas/board flag OFF that page server-redirects to /goals (the sub-hub),
  // so production behaviour is unchanged until the flag flips.
  goals: "/goals/yearly",
};

export const ACTIVE_WORKSPACE_COOKIE = "aw";

/**
 * Department-restricted rooms. A user may enter one of these ONLY if they're a
 * super-admin or their department matches (case-insensitive). Rooms not listed
 * are open to everyone (unless role-gated below, e.g. Admin). Match is against
 * the employee's free-text `department`.
 */
export const WORKSPACE_DEPARTMENT: Partial<Record<WorkspaceId, string>> = {
  sales: "Sales",
};

/**
 * WORD-match a required department against every membership the user has, so
 * "Sales", "Sales Team", "Sales & Marketing" all grant a room that requires
 * "Sales" — but "Salesforce Admin" does NOT. `departments` carries EVERY
 * department the user belongs to (structured employee_departments membership +
 * the legacy free-text field), so a multi-department person gets in via any one
 * of their memberships.
 */
export function matchesDepartment(departments: string[], required: string): boolean {
  const req = required.toLowerCase();
  return departments.some((d) =>
    (d ?? "").toLowerCase().split(/[^a-z]+/).includes(req),
  );
}

/**
 * Members of this department may enter the Accounts module (which the hub's
 * Admin card opens, landing on `/accounts`) — the accounts team, without being
 * super-admins. The CA Handover credential vault stays super-admin-only and is
 * guarded separately (`canViewCaHandover`).
 */
export const ACCOUNTS_DEPARTMENT = "Accounts";

export function canAccessWorkspace(
  ws: WorkspaceId,
  user: { departments: string[]; isAdmin: boolean; isSuperAdmin: boolean },
): boolean {
  // Super-admins see every room.
  if (user.isSuperAdmin) return true;
  const isAccountsRole = matchesDepartment(user.departments, ACCOUNTS_DEPARTMENT);
  // The Admin card opens the Accounts module (/accounts). Admins OR the Accounts
  // department may enter it. (The /admin control-room is a separate route group
  // with its own isAdmin-only guard, so this does not expose it.)
  if (ws === "admin") return user.isAdmin || isAccountsRole;
  // The Accounts room itself — the Accounts department (super-admins passed above).
  if (ws === "accounts") return isAccountsRole;
  // Monthly Events Master — admins (super-admins passed above). The employee
  // holiday-list view is a self-guarded page (`requireUser` only), reachable
  // directly without entering the room.
  if (ws === "events") return user.isAdmin;
  // Department-gated rooms (Sales).
  const required = WORKSPACE_DEPARTMENT[ws];
  if (!required) return true; // open room
  return matchesDepartment(user.departments, required);
}

/**
 * Rooms that are announced but not yet launched. The hub shows the card (as a
 * SOON tile) but `/ws/<id>` refuses entry so the `aw` cookie is never set to a
 * room with no nav.
 */
export const WORKSPACE_COMING_SOON: Partial<Record<WorkspaceId, boolean>> = {};

/**
 * The workspace that OWNS a path. Used to keep the scoped nav in sync with the
 * page you're actually on (path wins), and as the fallback when the `aw` cookie
 * is absent (cold direct-link / refresh).
 *
 * Shared platform surfaces (`/inbox`, `/archived`, `/profile`, `/admin`)
 * intentionally return null — they belong to no single room, so the nav keeps
 * whatever workspace you came in through (the cookie) instead of snapping.
 */
export function workspaceForPath(pathname: string): WorkspaceId | null {
  // "/" is the hub launcher (redirects to /hub) — it belongs to no workspace.
  const p = pathname;

  // Goals — the Y→Q→M→W cascade + commit/approve/plan/review surfaces, plus the
  // Weekly Goals + Daily Checklist modules (re-parented here from WMS).
  if (p.startsWith("/goals")) return "goals";
  if (p.startsWith("/weekly-goals") || p.startsWith("/daily-checklist")) return "goals";

  // WMS — the work loop (the dashboard now lives at /dashboard). Important
  // Links (/index-hub) moved here from the retired Marketing room.
  if (
    p.startsWith("/dashboard") ||
    p.startsWith("/tasks") ||
    p.startsWith("/projects") ||
    p.startsWith("/documents") ||
    p.startsWith("/index-hub")
  ) {
    return "wms";
  }

  // HR Record (attendance log) was re-parented to the HR room (2026-07). It
  // lives under /attendance/hr-record, so match it BEFORE the /attendance →
  // employees rule below so the HR rail (not the Employees rail) shows there.
  if (p.startsWith("/attendance/hr-record")) return "hr";

  // Employees — people & pay. NOTE: the admin Salary module (/salary) and
  // Overtime (/overtime) moved to the Accounts room; only the employee's OWN
  // self-service pay view (/my-salary) stays here.
  if (
    p.startsWith("/attendance") ||
    p.startsWith("/my-salary") ||
    p.startsWith("/incentive") ||
    p.startsWith("/reimbursements") ||
    p.startsWith("/leave") ||
    p.startsWith("/dcc") ||
    p.startsWith("/pms") ||
    p.startsWith("/appraisal")
  ) {
    return "employees";
  }

  // HR — the paperwork room: dossier, agreements, policies, letters & support.
  // (Dossier + Agreements re-parented here from Employees.)
  if (
    p.startsWith("/hr") ||
    p.startsWith("/dossier") ||
    p.startsWith("/agreements") ||
    p.startsWith("/policies") ||
    p.startsWith("/holidays") ||
    p.startsWith("/letters") ||
    p.startsWith("/queries") ||
    p.startsWith("/support")
  ) {
    return "hr";
  }

  // Sales — collections & relationships
  if (
    p.startsWith("/outstanding") ||
    p.startsWith("/participant-breakthrough") ||
    p.startsWith("/record-reference") ||
    p.startsWith("/people-gives") ||
    p.startsWith("/ambassadors")
  ) {
    return "sales";
  }

  // Training
  if (p.startsWith("/training")) return "training";

  // Accounts — the finance room with its own section nav. The admin Salary
  // module and Overtime were re-parented here from Employees (they're
  // Accounts-managed), so they resolve to this room's nav + access gate.
  if (
    p.startsWith("/accounts") ||
    p.startsWith("/salary") ||
    p.startsWith("/overtime")
  ) {
    return "accounts";
  }

  // Monthly Events Master — the calendar/holidays/obligations room.
  if (p.startsWith("/events")) return "events";

  // Shared / unknown — keep the caller's current workspace.
  return null;
}
