import { NextResponse, type NextRequest } from "next/server";
import {
  ACTIVE_WORKSPACE_COOKIE,
  WORKSPACE_LANDING,
  isWorkspaceId,
} from "@/lib/workspaces";

/**
 * Enter a workspace from the hub.
 *
 * Remembers the chosen room in the `aw` cookie (so the top nav can show ONLY
 * that workspace's modules), then redirects to the workspace's landing page.
 * Unknown ids bounce back to the hub. Auth is already enforced upstream by the
 * middleware — by the time you're clicking a card you're signed in.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const target = isWorkspaceId(id) ? WORKSPACE_LANDING[id] : "/hub";
  const res = NextResponse.redirect(new URL(target, req.url));
  if (isWorkspaceId(id)) {
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, id, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days — sticks across sessions
    });
  }
  return res;
}
