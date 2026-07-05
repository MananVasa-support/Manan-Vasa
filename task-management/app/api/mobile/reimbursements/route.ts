import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { listModuleSubmissions, type ModuleSubmissionRow } from "@/lib/queries/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Claim ₹ as a number — module fields are stored as strings (verbatim from the web page). */
function claimAmount(r: ModuleSubmissionRow): number {
  const n = Number(String(r.fields.amount ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Approved AND admin logged a payment date ⇒ settled ("paid") — mirrors the web `isPaid`. */
function isPaid(r: ModuleSubmissionRow): boolean {
  return r.status === "approved" && (r.adminFields?.payment_date ?? "") !== "";
}

/** Humanised status label for the pill. */
function statusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return "Pending";
  }
}

function claimDto(r: ModuleSubmissionRow) {
  return {
    id: r.id,
    /** "Expense For" is the claim's headline. */
    title: (r.fields.expense_for ?? "").trim() || "Reimbursement",
    amount: claimAmount(r),
    /** Raw "YYYY-MM-DD" expense date string (or "") — formatted on-device. */
    expenseDate: (r.fields.expense_date ?? "").trim(),
    product: (r.fields.product ?? "").trim() || null,
    billUrl: (r.fields.bill_url ?? "").trim() || null,
    notes: (r.fields.notes ?? "").trim() || null,
    status: r.status,
    statusLabel: statusLabel(r.status),
    isPaid: isPaid(r),
    /** Raw "YYYY-MM-DD" payment date the admin logged (or null). */
    paymentDate: (r.adminFields?.payment_date ?? "").trim() || null,
    /** Which head/entity the admin booked it against, if any. */
    expenseHead: (r.adminFields?.expense_head ?? "").trim() || null,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

/**
 * GET /api/mobile/reimbursements[?view=archived] — the signed-in user's OWN
 * reimbursement claims (owner-scoped; never the admin roll-up) with the same
 * KPIs the web `/reimbursements` page folds over the loaded rows: total claimed,
 * pending, approved · paid, and the claim/rejected count. Reuses the exact web
 * query (`listModuleSubmissions`) and derivation helpers so the two never
 * diverge. Additive — nothing on the web changes.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const url = new URL(req.url);
  const view = url.searchParams.get("view") === "archived" ? "archived" : "active";

  const rows = await listModuleSubmissions({
    module: "reimbursement",
    employeeId: me.id,
    isAdmin: false, // the app is personal — only the signed-in user's claims
    archived: view === "archived",
  });

  // ── KPIs folded over the loaded rows (zero extra queries — mirrors the web page) ──
  const sum = (rs: ModuleSubmissionRow[]) => rs.reduce((s, r) => s + claimAmount(r), 0);
  const totalClaimed = sum(rows);
  const pendingRows = rows.filter((r) => r.status === "pending");
  const approvedRows = rows.filter((r) => r.status === "approved");
  const rejectedRows = rows.filter((r) => r.status === "rejected");
  const pendingAmount = sum(pendingRows);
  const approvedAmount = sum(approvedRows);
  const paidCount = approvedRows.filter(isPaid).length;
  const approvedShare = totalClaimed > 0 ? approvedAmount / totalClaimed : null;

  return NextResponse.json(
    {
      view,
      ownerName: me.name,
      totals: {
        totalClaimed,
        pendingAmount,
        approvedAmount,
        claimCount: rows.length,
        pendingCount: pendingRows.length,
        approvedCount: approvedRows.length,
        paidCount,
        rejectedCount: rejectedRows.length,
        approvedShare,
      },
      claims: rows.map(claimDto),
    },
    { headers: MOBILE_CORS },
  );
}
