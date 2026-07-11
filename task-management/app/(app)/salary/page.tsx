import Link from "next/link";
import type { Route } from "next";
import { FileSpreadsheet, Wallet } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireFinanceAccess } from "@/lib/auth/finance-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { salaryBreakupMonths, listSalaryBreakup } from "@/lib/queries/salary-breakup";
import { type SalaryRow } from "@/components/salary/salary-breakup-table";
import { SalaryWorkspace } from "@/components/salary/salary-workspace";
import { SalarySyncButton } from "@/components/salary/salary-sync-button";
import { SalaryMonthPicker } from "@/components/salary/salary-month-picker";
import { SalaryExportButtons } from "@/components/salary/salary-export-buttons";
import {
  StatementDownloads,
  type StatementEmployee,
} from "@/components/salary/statement-downloads";
import { fyForMonth } from "@/lib/salary/period";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/* Employees-module identity — matches the Attendance page. */
const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthLabel(ym: string, style: "long" | "short" = "long"): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function SalaryPage({ searchParams }: PageProps) {
  const me = await requireFinanceAccess();
  const canMarkPaid = isSuperAdmin(me.email);
  const sp = await searchParams;
  const months = await salaryBreakupMonths();
  const raw = typeof sp.month === "string" ? sp.month : undefined;
  // Default to the last COMPLETE month — not the current in-progress month (which
  // only has a day or two logged, so it would show tiny pro-rated pay). `months`
  // is newest-first; the first one before this IST month is the last full one.
  const nowYm = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  const defaultMonth = months.find((m) => m < nowYm) ?? months[0] ?? "";
  const month = raw && MONTH_RE.test(raw) ? raw : defaultMonth;
  const rows = month ? await listSalaryBreakup(month) : [];

  // WS-5/WS-6 — linked employees for the statement/earnings document downloads
  // (behind SALARY_STATEMENTS). Only rows with a resolved employeeId can be
  // used (attendance + incentive lookups key on it); dedupe by id.
  const statementsOn = process.env.SALARY_STATEMENTS !== "false";
  const statementEmployees: StatementEmployee[] = [];
  if (statementsOn) {
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.employeeId && !seen.has(r.employeeId)) {
        seen.add(r.employeeId);
        statementEmployees.push({ id: r.employeeId, name: r.employeeName });
      }
    }
  }
  const fyStartYear = (() => {
    const [my, mm] = (month || "").split("-").map(Number);
    if (!my || !mm) return new Date().getFullYear();
    return mm >= 4 ? my : my - 1;
  })();

  // Plain serializable rows for the client table.
  const tableRows: SalaryRow[] = rows.map((r, i) => ({
    id: r.id,
    srNo: r.srNo ?? i + 1,
    employeeName: r.employeeName,
    designation: r.designation,
    companyName: r.companyName,
    present: r.present,
    absent: r.absent,
    halfDay: r.halfDay,
    weeklyOff: r.weeklyOff,
    totalDaysWorked: r.totalDaysWorked,
    finalWorkingDays: r.finalWorkingDays,
    monthlyCtc: r.monthlyCtc,
    payableAfterLeave: r.payableAfterLeave,
    pt: r.pt,
    payableAfterPt: r.payableAfterPt,
    advance: r.advance,
    previousPending: r.previousPending,
    finalPayment: r.finalPayment,
    remarks: r.remarks,
    mananRemarks: r.mananRemarks,
    paid: r.paid,
    adminNote: r.adminNote,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Glass hero: eyebrow · month title · month selector ── */}
        <header
          className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${GREEN} 9%, transparent), transparent 55%)`,
              `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${GREEN} 5%, transparent), transparent 52%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <span
                className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
              >
                <Wallet size={13} strokeWidth={2.6} /> Employees · Salary
              </span>
              <h1
                className="mt-3 text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(30px,3.6vw,46px)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.02,
                }}
              >
                {month ? `${monthLabel(month)} payroll` : "Salary breakup"}
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                Straight from the salary sheet (imported as-is). The attendance figures here are
                the sheet&apos;s own — the app&apos;s attendance does not change these numbers.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                {process.env.SALARY_DOCS_UI !== "false" && (
                  <Link href={"/salary/documents" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: GREEN_DEEP }}>
                    Exit documents &amp; signatory letters →
                  </Link>
                )}
                {process.env.SALARY_ANALYTICS !== "false" && (
                  <Link href={`/salary/analytics${month ? `?month=${month}` : ""}` as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: GREEN_DEEP }}>
                    Attendance analytics →
                  </Link>
                )}
                {process.env.INCENTIVE_PAYOUT === "true" && (
                  <Link href={"/salary/incentive-payout" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: GREEN_DEEP }}>
                    Pay incentives with salary →
                  </Link>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2.5 max-md:items-start">
              <SalarySyncButton />
              <SalaryExportButtons month={month} />
            </div>
          </div>

          {months.length > 0 && (
            <SalaryMonthPicker months={months} selected={month ?? ""} />
          )}
        </header>

        {/* ── The breakup workspace: a COMPANY selector scopes the KPI cards +
            table together; then document downloads below. ── */}
        {rows.length === 0 ? (
          <section
            className="wg-rise admin-panel px-6 py-16 text-center"
            style={{ animationDelay: "140ms" }}
          >
            <span
              className="mx-auto mb-4 inline-grid size-12 place-items-center rounded-2xl"
              style={{
                background: `color-mix(in srgb, ${GREEN} 10%, transparent)`,
                color: GREEN_DEEP,
              }}
              aria-hidden
            >
              <FileSpreadsheet size={22} strokeWidth={2.2} />
            </span>
            <p
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-serif), system-ui, sans-serif",
                fontStyle: "italic",
                fontSize: 22,
                letterSpacing: "-0.015em",
              }}
            >
              No salary rows for this month
            </p>
            <p className="mt-2 text-[14px] text-ink-subtle">
              {months.length > 0
                ? "Pick another month above, or import the sheet for this one."
                : "Import the salary sheet to see the monthly breakup here."}
            </p>
          </section>
        ) : (
          <>
            <SalaryWorkspace rows={tableRows} canMarkPaid={canMarkPaid} canEditNote={canMarkPaid} />

            {/* ── Statement & earnings document downloads (behind SALARY_STATEMENTS) ── */}
            {statementsOn && month && statementEmployees.length > 0 && (
              <div className="mt-5">
                <StatementDownloads
                  employees={statementEmployees}
                  month={month}
                  monthLabel={monthLabel(month, "short")}
                  fy={fyForMonth(month)}
                  fyStartYear={fyStartYear}
                />
              </div>
            )}
          </>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}
