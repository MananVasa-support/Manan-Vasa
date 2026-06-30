import { NextResponse, type NextRequest } from "next/server";
import {
  ACTIVE_WORKSPACE_COOKIE,
  WORKSPACE_LANDING,
  WORKSPACE_COMING_SOON,
  isWorkspaceId,
  canAccessWorkspace,
} from "@/lib/workspaces";
import { getCurrentEmployee } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";

/**
 * Enter a workspace from the hub.
 *
 * Remembers the chosen room in the `aw` cookie (so the top nav can show ONLY
 * that workspace's modules), then redirects to the workspace's landing page.
 * Bounces back to the hub for: an unknown id, a not-yet-launched room (so the
 * cookie is never set to a nav-less room), or a room the user isn't allowed into
 * (Sales = department-gated, Admin = admins only). Auth is enforced upstream by
 * the middleware.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isWorkspaceId(id) || WORKSPACE_COMING_SOON[id]) {
    return NextResponse.redirect(new URL("/hub", req.url));
  }

  const me = await getCurrentEmployee();
  if (!me || !canAccessWorkspace(id, await accessFor(me))) {
    return NextResponse.redirect(new URL("/hub", req.url));
  }

  const res = NextResponse.redirect(new URL(WORKSPACE_LANDING[id], req.url));
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, id, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days — sticks across sessions
  });
  return res;
}
