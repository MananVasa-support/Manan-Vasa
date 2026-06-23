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
};

/** Where each card drops you when you enter the workspace. */
export const WORKSPACE_LANDING: Record<WorkspaceId, string> = {
  wms: "/dashboard",
  admin: "/admin",
  employees: "/attendance",
  sales: "/outstanding",
  marketing: "/index-hub",
  // No live training surface yet — the card is SOON and never linked here.
  training: "/",
};

export const ACTIVE_WORKSPACE_COOKIE = "aw";

/**
 * Department-restricted rooms. A user may enter one of these ONLY if they're a
 * super-admin or their department matches (case-insensitive). Rooms not listed
 * are open to everyone. Match is against the employee's free-text `department`.
 */
export const WORKSPACE_DEPARTMENT: Partial<Record<WorkspaceId, string>> = {
  sales: "Sales",
};

export function canAccessWorkspace(
  ws: WorkspaceId,
  user: { department?: string | null; isSuperAdmin: boolean },
): boolean {
  const required = WORKSPACE_DEPARTMENT[ws];
  if (!required) return true; // open room
  if (user.isSuperAdmin) return true;
  // Contains-match (not strict equality) so real-world values like "Sales Team"
  // or "Sales & Marketing" still grant access and we don't lock out the people
  // who belong in the room over a label nuance.
  return (user.department ?? "").trim().toLowerCase().includes(required.toLowerCase());
}

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
    p.startsWith("/reimbursements") ||
    p.startsWith("/leave")
  ) {
    return "employees";
  }

  // Sales — collections & relationships
  if (
    p.startsWith("/outstanding") ||
    p.startsWith("/participant-breakthrough") ||
    p.startsWith("/record-reference")
  ) {
    return "sales";
  }

  // Marketing
  if (p.startsWith("/index-hub")) return "marketing";

  // Shared / unknown — keep the caller's current workspace.
  return null;
}
