import { Archive, LockKeyhole, UserRoundSearch, FileWarning, Briefcase, Building2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { requireAdmin } from "@/lib/auth/current";
import { listEmployees } from "@/lib/queries/employees";
import {
  listHrSheetMonths,
  loadHrSheetMonth,
  loadHrPaidLeave,
  type HrSheetMonthRecord,
  type HrPaidLeaveRecord,
} from "@/lib/queries/attendance-log";
import { HrRecordSelectors } from "@/components/attendance/hr-record/hr-selectors";
import { HrKpiStrip } from "@/components/attendance/hr-record/hr-kpi-strip";
import { HrDayGrid } from "@/components/attendance/hr-record/hr-day-grid";
import { HrPaidLeaveCard } from "@/components/attendance/hr-record/hr-paid-leave-card";
import { AttendanceSyncButton } from "@/components/attendance/hr-record/attendance-sync-button";
import { hrMonthLabel } from "@/components/attendance/hr-record/hr-codes";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Admin-only, READ-ONLY viewer over the historic attendance + paid-leave
 * record imported from the HR "Attendance log" Google Sheet (migration 0101,
 * mirrored by lib/attendance-log/*). A parallel authoritative layer — it
 * never touches the in-app punch flow. Selection is `?emp=` + `?month=`;
 * every read is an existing indexed query from lib/queries/attendance-log.
 */
export default async function HrRecordPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await requireAdmin();

  const roster = (await listEmployees()).map((e) => ({ id: e.id, name: e.name }));

  const empParam = typeof sp.emp === "string" ? sp.emp : null;
  const employee = empParam ? roster.find((r) => r.id === empParam) ?? null : null;

  let months: string[] = [];
  let month: string | null = null;
  let record: HrSheetMonthRecord | null = null;
  let paidLeave: HrPaidLeaveRecord | null = null;
  let loadError = false;

  if (employee) {
    try {
      months = await listHrSheetMonths(employee.id);
      const want =
        typeof sp.month === "string" && /^\d{4}-\d{2}/.test(sp.month)
          ? `${sp.month.slice(0, 7)}-01`
          : null;
      month = want && months.includes(want) ? want : months[0] ?? null;
      [record, paidLeave] = await Promise.all([
        month ? loadHrSheetMonth(employee.id, month) : Promise.resolve(null),
        loadHrPaidLeave(employee.id),
      ]);
    } catch (err) {
      console.error("[attendance/hr-record] load failed", err);
      loadError = true;
    }
  }

  const summary = record?.summary ?? null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Glass hero ── */}
        <header className="wg-rise mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
              >
                <Archive size={13} strokeWidth={2.6} /> Employees · Attendance · HR Record
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted"
                style={{ background: "var(--color-surface-soft)" }}
              >
                <LockKeyhole size={12} strokeWidth={2.6} /> Read-only
              </span>
            </div>
            <AttendanceSyncButton />
          </div>
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
            HR Attendance Record
          </h1>
          <p className="mt-1.5 max-w-[72ch] text-[15.5px] font-medium text-ink-muted">
            The authoritative month-by-month attendance and paid-leave history imported from
            the HR sheet. This mirror is for reference — it can&apos;t be edited here.
          </p>
        </header>

        {/* ── Selection band ── */}
        <section
          className="wg-rise mb-5 rounded-[22px] bg-surface-card p-6 max-md:p-4"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
            animationDelay: "60ms",
          }}
        >
          <HrRecordSelectors
            employees={roster}
            selectedEmp={employee?.id ?? null}
            months={months}
            selectedMonth={month}
          />

          {/* Identity strip — folded from the loaded summary row */}
          {employee && summary && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
              <EmployeeAvatar
                name={employee.name}
                size="lg"
                background="linear-gradient(135deg, #16a34a, #14532d)"
              />
              <div className="min-w-0">
                <div
                  className="truncate text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 900,
                    fontSize: 22,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                  }}
                >
                  {employee.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-ink-muted">
                  {summary.designation && (
                    <span className="inline-flex items-center gap-1.5">
                      <Briefcase size={13} strokeWidth={2.4} className="text-ink-subtle" />
                      {summary.designation}
                    </span>
                  )}
                  {summary.companyName && (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 size={13} strokeWidth={2.4} className="text-ink-subtle" />
                      {summary.companyName}
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {summary.fy && (
                  <span
                    className="inline-flex rounded-pill px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.1em]"
                    style={{
                      background: "color-mix(in srgb, #16a34a 10%, transparent)",
                      color: "#15803d",
                    }}
                  >
                    FY {summary.fy}
                  </span>
                )}
                {month && (
                  <span
                    className="inline-flex rounded-pill px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.1em] text-ink-strong"
                    style={{ background: "var(--color-surface-soft)" }}
                  >
                    {hrMonthLabel(month)}
                  </span>
                )}
              </div>
              {summary.remark && (
                <p className="w-full text-[13.5px] font-medium text-ink-muted">
                  <span className="font-bold text-ink-strong">Remark:</span> {summary.remark}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Body ── */}
        {loadError ? (
          <EmptyState
            icon={<FileWarning size={26} strokeWidth={2.2} />}
            title="Could not load the HR record."
            body="Please refresh in a moment."
          />
        ) : !employee ? (
          <EmptyState
            icon={<UserRoundSearch size={26} strokeWidth={2.2} />}
            title="Pick an employee"
            body="Choose a teammate above to open their imported HR attendance record — months, day-by-day codes, and paid-leave entitlement."
          />
        ) : months.length === 0 && !paidLeave ? (
          <EmptyState
            icon={<Archive size={26} strokeWidth={2.2} />}
            title={`No HR sheet record for ${employee.name}`}
            body="The imported sheet has no attendance or paid-leave rows matched to this employee."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {summary && <HrKpiStrip summary={summary} />}
            {record && month && <HrDayGrid month={month} days={record.days} />}
            {months.length === 0 && (
              <EmptyState
                icon={<Archive size={26} strokeWidth={2.2} />}
                title="No monthly attendance on the sheet"
                body={`${employee.name} has a paid-leave block but no imported attendance months.`}
              />
            )}
            {paidLeave && <HrPaidLeaveCard record={paidLeave} />}
          </div>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}

/* ── Graceful centred empty / error state ── */
function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card px-8 py-16 text-center"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
      }}
    >
      <span
        className="mx-auto mb-4 inline-grid size-14 place-items-center rounded-2xl"
        style={{ background: "color-mix(in srgb, #16a34a 9%, transparent)", color: "#15803d" }}
      >
        {icon}
      </span>
      <h2
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 23,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-[52ch] text-[15px] font-medium text-ink-muted">{body}</p>
    </section>
  );
}
