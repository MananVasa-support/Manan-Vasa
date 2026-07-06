import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { needsDailyChecklistPlan, MIN_DAILY_ITEMS } from "@/lib/daily-checklist/gate";
import { needsGoalActuals } from "@/lib/weekly-goals/actuals";
import { isManagerWithReports } from "@/lib/manager-gates";
import { dccGateTarget } from "@/lib/dcc/gate";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { countPlannedItems, todayYmd } from "@/lib/queries/daily-checklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY diagnostic — returns the caller's OWN gate decision + each check's
// result/error, to find why the login gate isn't firing. Remove after debugging.
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;
  const wrap = async <T>(fn: () => Promise<T>): Promise<T | string> => {
    try { return await fn(); } catch (e) { return "ERR: " + (e instanceof Error ? e.message : String(e)); }
  };
  const [mgr, plan, goals, dcc, items] = await Promise.all([
    wrap(() => isManagerWithReports(me.id)),
    wrap(() => needsDailyChecklistPlan(me.id)),
    wrap(() => needsGoalActuals(me.id)),
    wrap(() => dccGateTarget(me.id)),
    wrap(() => countPlannedItems(me.id, todayYmd())),
  ]);
  const planExempt = me.isAdmin || isSuperAdmin(me.email) || mgr === true;
  const wouldGatePlan = !planExempt && (plan === true || goals === true);
  return NextResponse.json(
    {
      name: me.name,
      isAdmin: me.isAdmin,
      superAdmin: isSuperAdmin(me.email),
      todayYmd: todayYmd(),
      MIN_DAILY_ITEMS,
      itemsToday: items,
      isManager: mgr,
      needsChecklistPlan: plan,
      needsGoalActuals: goals,
      dccTarget: dcc && typeof dcc === "object" ? "HAS_TARGET" : dcc,
      planExempt,
      WOULD_GATE_PLAN: wouldGatePlan,
    },
    { headers: MOBILE_CORS },
  );
}
