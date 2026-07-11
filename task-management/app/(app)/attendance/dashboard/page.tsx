import { CalendarCheck2, FileSpreadsheet, FileText } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAdmin } from "@/lib/auth/current";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import { localDateString } from "@/lib/format";
import { AttendanceDashboardTable } from "@/components/attendance/dashboard/dashboard-table";
import { AttendanceMonthSelector } from "@/components/attendance/dashboard/month-selector";
import { GenerateSalaryButton } from "@/components/attendance/dashboard/generate-salary-button";

export const dynamic = "force-dynamic";

/** Default reporting timezone — "today" for the live-row grading. The
 *  per-employee query still reads each employee's own tz internally. */
const DEFAULT_TZ = "Asia/Kolkata";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Parse `?y=&m=`; fall back to the current month in the reporting tz. */
function resolveMonth(
  sp: Record<string, string | string[] | undefined>,
  todayISO: string,
): { year: number; month: number } {
  const [cy, cm] = todayISO.split("-").map(Number);
  const rawY = typeof sp.y === "string" ? Number(sp.y) : NaN;
  const rawM = typeof sp.m === "string" ? Number(sp.m) : NaN;
  const year =
    Number.isInteger(rawY) && rawY >= 2000 && rawY <= 2100 ? rawY : (cy ?? 2026);
  const month =
    Number.isInteger(rawM) && rawM >= 1 && rawM <= 12 ? rawM : (cm ?? 1);
  return { year, month };
}

export default async function AttendanceDashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await requireAdmin();

  const todayISO = localDateString(DEFAULT_TZ);
  const { year, month } = resolveMonth(sp, todayISO);

  let rows: Awaited<ReturnType<typeof getMonthDashboard>>;
  let loadError = false;
  try {
    rows = await getMonthDashboard(year, month, todayISO);
  } catch (err) {
    console.error("[attendance/dashboard] load failed", err);
    rows = [];
    loadError = true;
  }

  // Compact hero summary — a pure fold over the already-loaded rows
  // (no extra queries): headcount + total payable day-count for the month.
  const people = rows.length;
  const payableTotal = rows.reduce((acc, r) => acc + r.summary.payableDays, 0);
  const payableLabel =
    Number.isInteger(payableTotal) ? String(payableTotal) : payableTotal.toFixed(1);

  const monthTitle = `${MONTH_NAMES[month - 1] ?? ""} ${year}`;

  const exportBtnCls =
    "wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/75 py-2 px-4 text-[13.5px] font-bold text-ink-strong hover:border-hairline-strong hover:text-[var(--color-altus-red-deep)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1800px] px-8 max-md:px-4 pt-8 pb-16">
        {/* ── Glass hero band — month headline, nav, exports, summary ──── */}
        <section className="admin-section-band wg-rise mb-6 px-8 py-7 max-md:px-5 max-md:py-5">
          <div className="relative flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              <span className="admin-section-icon size-12 shrink-0 max-md:hidden">
                <CalendarCheck2 size={24} strokeWidth={2.2} aria-hidden />
              </span>
              <div className="min-w-0">
                <div
                  className="uppercase font-bold text-ink-subtle"
                  style={{
                    fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                  }}
                >
                  Admin · Attendance report
                </div>
                <h1
                  className="mt-1 text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: "clamp(28px, 4vw, 38px)",
                    lineHeight: 1.05,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {monthTitle}
                </h1>
                <p className="mt-2 text-[15px] font-medium text-ink-muted">
                  Monthly per-person attendance, leave &amp; payable-day report.
                  Click any row for the daily log.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 max-md:items-start max-md:w-full">
              <AttendanceMonthSelector year={year} month={month} />
              {/* Task A7 — month-scoped report exports. Plain links: the routes
                  respond with an attachment Content-Disposition. */}
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`/attendance/export.xlsx?y=${year}&m=${month}`} className={exportBtnCls}>
                  <FileSpreadsheet size={15} strokeWidth={2.2} />
                  Export Excel
                </a>
                <a href={`/attendance/export.pdf?y=${year}&m=${month}`} className={exportBtnCls}>
                  <FileText size={15} strokeWidth={2.2} />
                  Export PDF
                </a>
                <GenerateSalaryButton year={year} month={month} label={monthTitle} />
              </div>
            </div>
          </div>

          {!loadError && people > 0 && (
            <div className="relative mt-5 flex items-center gap-2.5 flex-wrap">
              <span className="admin-stat-pill">
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
                  People
                </span>
                <span
                  className="tabular-nums leading-none text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 18,
                  }}
                >
                  {people}
                </span>
              </span>
              <span className="admin-stat-pill">
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
                  Payable days
                </span>
                <span
                  className="tabular-nums leading-none text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 18,
                  }}
                >
                  {payableLabel}
                </span>
              </span>
            </div>
          )}
        </section>

        {loadError ? (
          <div
            className="rounded-section bg-surface-card border border-hairline p-10 text-center"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <p className="font-bold text-ink-strong" style={{ fontSize: 18 }}>
              Could not load the attendance dashboard.
            </p>
            <p className="mt-2 font-semibold text-ink-muted" style={{ fontSize: 15 }}>
              Please refresh in a moment.
            </p>
          </div>
        ) : (
          <AttendanceDashboardTable rows={rows} year={year} month={month} />
        )}
      </main>
      <DashboardFooter />
    </>
  );
}
