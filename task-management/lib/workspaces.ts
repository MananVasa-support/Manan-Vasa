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
  "sales",
  "marketing",
  "training",
  "accounts",
] as const;

export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export function isWorkspaceId(v: string | undefined | null): v is WorkspaceId {
  return !!v && (WORKSPACE_IDS as readonly string[]).includes(v);
}

export const WORKSPACE_LABEL: Record<WorkspaceId, string> = {
  wms: "WMS",
  admin: "Admin",
  employees: "Employees",
  sales: "Sales",
  marketing: "Marketing",
  training: "Training",
  accounts: "Accounts",
};

/** Where each card drops you when you enter the workspace. */
export const WORKSPACE_LANDING: Record<WorkspaceId, string> = {
  wms: "/dashboard",
  // The Admin workspace now opens to Accounts (the day-to-day surface). The
  // red-pill Admin control-room (/admin) is reachable only from the user-menu
  // "Admin panel" link — it's no longer the Admin card's landing.
  admin: "/accounts",
  employees: "/attendance",
  sales: "/outstanding",
  marketing: "/index-hub",
  training: "/training",
  accounts: "/accounts",
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

export function canAccessWorkspace(
  ws: WorkspaceId,
  user: { departments: string[]; isAdmin: boolean; isSuperAdmin: boolean },
): boolean {
  // Super-admins see every room.
  if (user.isSuperAdmin) return true;
  // The Admin room is role-gated: admins only (NOT doers).
  if (ws === "admin") return user.isAdmin;
  // Accounts is locked to super-admins (who already returned true above).
  if (ws === "accounts") return false;
  // Department-gated rooms (Sales).
  const required = WORKSPACE_DEPARTMENT[ws];
  if (!required) return true; // open room
  // `departments` carries EVERY department the user belongs to (structured
  // employee_departments membership + the legacy free-text field). WORD-match
  // against each: "Sales", "Sales Team", "Sales & Marketing" grant access, but
  // "Salesforce Admin" does NOT. A multi-department person (e.g. Sales +
  // Consulting + Founder Office) gets in via their Sales membership — which the
  // single free-text column could never represent.
  const req = required.toLowerCase();
  return user.departments.some((d) =>
    (d ?? "").toLowerCase().split(/[^a-z]+/).includes(req),
  );
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

  // WMS — the work loop (the dashboard now lives at /dashboard)
  if (
    p.startsWith("/dashboard") ||
    p.startsWith("/tasks") ||
    p.startsWith("/projects") ||
    p.startsWith("/weekly-goals") ||
    p.startsWith("/daily-checklist") ||
    p.startsWith("/documents")
  ) {
    return "wms";
  }

  // Employees — people & pay
  if (
    p.startsWith("/attendance") ||
    p.startsWith("/salary") ||
    p.startsWith("/incentive") ||
    p.startsWith("/overtime") ||
    p.startsWith("/reimbursements") ||
    p.startsWith("/leave") ||
    p.startsWith("/dcc")
  ) {
    return "employees";
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

  // Marketing
  if (p.startsWith("/index-hub")) return "marketing";

  // Training
  if (p.startsWith("/training")) return "training";

  // Accounts — admin/super-admin module with its own section nav.
  if (p.startsWith("/accounts")) return "accounts";

  // Shared / unknown — keep the caller's current workspace.
  return null;
}
