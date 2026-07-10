import { requireUser } from "@/lib/auth/current";
import { listSalaryBreakup } from "@/lib/queries/salary-breakup";
import { toPayrollRows, PAYROLL_COLUMNS } from "@/lib/salary/payroll-rows";

/**
 * GET /salary/export.csv?month=YYYY-MM — admin-only payroll CSV of the on-screen
 * salary sheet (deduped, ex-staff excluded). Money as raw numbers so Sir can
 * total/pay in Excel/Sheets.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentMonthIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** RFC-4180 field quoting. */
function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!me.isAdmin) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonthIST();

  const rows = toPayrollRows(await listSalaryBreakup(month));

  const lines: string[] = [];
  lines.push(PAYROLL_COLUMNS.map((c) => csvCell(c.label)).join(","));
  for (const r of rows) {
    lines.push(
      PAYROLL_COLUMNS.map((c) => {
        const v = r[c.key];
        return csvCell(v == null ? "" : v);
      }).join(","),
    );
  }
  // Totals row for the money columns (blank Sr/Employee).
  const totals = PAYROLL_COLUMNS.map((c) => {
    if (c.key === "employee") return csvCell("TOTAL");
    if (c.money) return csvCell(rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0).toFixed(2));
    return "";
  });
  lines.push(totals.join(","));

  const body = "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payroll-${month}.csv"`,
      "cache-control": "no-store",
    },
  });
}
