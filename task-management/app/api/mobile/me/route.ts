import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { countUnfilledWeekGoals } from "@/lib/weekly-goals/gate";

// Node runtime (Firebase Admin) + always dynamic (per-request auth).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/me — the native app's "who am I / am I enrolled" check.
 * Verifies the Bearer Firebase ID token and returns the signed-in employee.
 * Doubles as the post-login gate (200 = enrolled & active).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const e = auth.employee;

  // Mandatory weekly-goals fill gate (design §11): tell the native app how many
  // current-week goals are still un-filled so it can show its own gate screen.
  const unfilledCount = await countUnfilledWeekGoals(e.id);

  return NextResponse.json(
    {
      id: e.id,
      name: e.name,
      email: e.email,
      isAdmin: e.isAdmin,
      avatarUrl: e.avatarUrl ?? null,
      department: e.department ?? null,
      weeklyGoalsGate: {
        required: unfilledCount > 0,
        unfilledCount,
      },
    },
    { headers: MOBILE_CORS },
  );
}
