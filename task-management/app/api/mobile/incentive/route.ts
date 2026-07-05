import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import {
  getIncentivePersonDetail,
  getIncentiveTargetVsActual,
  nameKey,
} from "@/lib/queries/incentives";
import { listIncentiveRequests } from "@/lib/queries/incentive";
import { INCENTIVE_STATUS_LABELS, INCENTIVE_TYPE_LABELS } from "@/db/enums";
import type { IncentiveStatus, IncentiveType } from "@/db/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** "Jun 2026" from a first-of-month `YYYY-MM-DD` string. Wrapped in `new Date`
 *  (noon UTC) so a bare date string never trips a timezone/string→Date bug. */
function monthLabel(periodMonth: string | null): string | null {
  if (!periodMonth) return null;
  const d = new Date(`${periodMonth}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Humanise the request type/status through the same label tables the web uses. */
function typeLabel(type: IncentiveType): string {
  return INCENTIVE_TYPE_LABELS[type] ?? type;
}
function statusLabel(status: IncentiveStatus): string {
  return INCENTIVE_STATUS_LABELS[status] ?? status;
}

/**
 * GET /api/mobile/incentive[?year=YYYY] — the SIGNED-IN user's own incentive
 * analytics: their YTD earned / paid / unpaid + target attainment, the merged
 * permanent-ledger + project-leg lines that make up the total, and their filed
 * incentive requests (newest first). Owner-scoped — never the team roll-up.
 *
 * Reuses the exact web query functions (getIncentivePersonDetail — matched by
 * name, case-insensitive — plus getIncentiveTargetVsActual for attainment and
 * listIncentiveRequests scoped to the employee) so the phone and the web page
 * can never diverge on a person's numbers.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  // Year: default to the current calendar year, with a small trailing window
  // the picker can reach (mirrors the web page).
  const currentYear = new Date().getFullYear();
  const url = new URL(req.url);
  const raw = url.searchParams.get("year");
  const parsed = raw ? Number(raw) : currentYear;
  const year = Number.isFinite(parsed) ? Math.trunc(parsed) : currentYear;
  const years = Array.from(new Set([currentYear, currentYear - 1, currentYear - 2, currentYear - 3]));
  if (!years.includes(year)) years.unshift(year);

  const [detail, targetVsActual, requests] = await Promise.all([
    getIncentivePersonDetail(me.name, year),
    getIncentiveTargetVsActual(year),
    listIncentiveRequests({ employeeId: me.id, isAdmin: false }),
  ]);

  // The person's attainment row (case-insensitive name match) — or null totals.
  const meKey = nameKey(me.name);
  const myTarget = targetVsActual.rows.find((r) => nameKey(r.empName) === meKey) ?? null;

  // Merge the permanent-ledger entries and the project legs into one ledger of
  // render-ready lines, newest period first.
  const entryLines = detail.entries.map((e) => ({
    id: e.id,
    label: e.incentiveName || "Incentive",
    sub: [monthLabel(e.periodMonth), "Permanent"].filter(Boolean).join(" · "),
    periodMonth: e.periodMonth,
    approved: e.approvedAmt,
    paid: e.paidAmt,
    unpaid: Math.max(0, e.approvedAmt - e.paidAmt),
    isPaid: e.approvedAmt > 0 && e.paidAmt >= e.approvedAmt,
  }));
  const projectLines = detail.projects.map((p) => ({
    id: p.id,
    label: p.projectName || "Project incentive",
    sub: [monthLabel(p.periodMonth), p.role === "supervisor" ? "Supervisor" : "Intern"]
      .filter(Boolean)
      .join(" · "),
    periodMonth: p.periodMonth,
    approved: p.approved,
    paid: p.paid,
    unpaid: Math.max(0, p.approved - p.paid),
    isPaid: p.approved > 0 && p.paid >= p.approved,
  }));
  const lines = [...entryLines, ...projectLines]
    .sort((a, b) => (b.periodMonth ?? "").localeCompare(a.periodMonth ?? ""))
    .map(({ periodMonth: _periodMonth, ...line }) => line);

  const requestRows = requests.map((r) => ({
    id: r.id,
    title: typeLabel(r.type),
    status: r.status,
    statusLabel: statusLabel(r.status),
    createdAt: new Date(r.createdAt).toISOString(),
    decisionNote: r.decisionNote ?? null,
  }));

  return NextResponse.json(
    {
      year,
      years,
      ownerName: me.name,
      totals: {
        earned: detail.totals.totalApproved,
        paid: detail.totals.totalPaid,
        unpaid: detail.totals.totalUnpaid,
        target: myTarget?.target ?? 0,
        attainmentPct: myTarget?.attainmentPct ?? null,
      },
      lines,
      requests: requestRows,
    },
    { headers: MOBILE_CORS },
  );
}
