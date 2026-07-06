import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { getOvertimeDashboard } from "@/lib/queries/overtime";
import { getReimbursementDashboard } from "@/lib/queries/reimbursement-dashboard";
import { formatInr } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type Stat = { label: string; value: string };
type Person = { name: string; primary: string; secondary: string };
type Dash = { title: string; periodLabel: string; stats: Stat[]; people: Person[] };

function currentMonth(): { iso: string; label: string } {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const iso = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-01`;
  const label = ist.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { iso, label };
}

/**
 * GET /api/mobile/team-dashboard/[type] — a normalized admin team dashboard
 * (overtime · reimbursements). Reuses the web dashboard queries so the two never
 * diverge; scope (admins → all, else → own/team) is enforced inside those
 * queries. Returns { title, periodLabel, stats[], people[] } for one screen.
 */
export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const { type } = await ctx.params;

  let dash: Dash;
  if (type === "overtime") {
    const { iso, label } = currentMonth();
    const d = await getOvertimeDashboard({ employeeId: me.id, isAdmin: me.isAdmin, monthStartISO: iso, monthLabel: label });
    dash = {
      title: "Overtime",
      periodLabel: label,
      stats: [
        { label: "Pending", value: String(d.pendingCount) },
        { label: "People", value: String(d.people.length) },
      ],
      people: d.people.map((p) => ({
        name: p.employeeName,
        primary: `${p.monthHours}h this month`,
        secondary: `${p.allTimeHours}h all-time`,
      })),
    };
  } else if (type === "reimbursements") {
    const d = await getReimbursementDashboard({ employeeId: me.id, isAdmin: me.isAdmin });
    dash = {
      title: "Reimbursements",
      periodLabel: "",
      stats: [
        { label: "Approved", value: formatInr(d.approved.amount) },
        { label: "Pending", value: formatInr(d.pending.amount) },
        { label: "Paid", value: formatInr(d.paid.amount) },
      ],
      people: d.byPerson.map((p) => ({ name: p.name, primary: formatInr(p.amount), secondary: "" })),
    };
  } else {
    return NextResponse.json({ error: "unknown-dashboard" }, { status: 404, headers: MOBILE_CORS });
  }

  return NextResponse.json(dash, { headers: MOBILE_CORS });
}
