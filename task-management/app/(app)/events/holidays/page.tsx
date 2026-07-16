import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { listHolidays } from "@/lib/queries/monthly-events";
import { listEmployees } from "@/lib/queries/employees";
import { HolidaysAdmin } from "@/components/events/holidays/holidays-admin";
import type { EmployeeReligionRow } from "@/components/events/holidays/religion-editor";
import type { ReligionCode } from "@/lib/monthly-events/types";

export const dynamic = "force-dynamic";

const ACCENT = "#0891b2";
const ACCENT_DEEP = "#0e7490";
const VALID_FY = new Set([2026, 2027]);

export default async function HolidaysAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  // Admin-gated (masters / holidays admin). Re-asserted in the page.
  await requireEventsAdmin();

  const sp = await searchParams;
  const parsedFy = Number(sp.fy);
  const fyStartYear = VALID_FY.has(parsedFy) ? parsedFy : 2026;

  const [holidays, roster] = await Promise.all([
    listHolidays(fyStartYear),
    listEmployees(),
  ]);

  const employees: EmployeeReligionRow[] = roster.map((e) => ({
    id: e.id,
    name: e.name,
    religion: (e.religion as ReligionCode | null) ?? null,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pb-16 pt-8 max-md:px-4">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Holiday Master
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px, 3vw, 38px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            Company holidays, per financial year
          </h1>
          <p className="mt-2 max-w-[70ch] text-[15px] font-medium text-ink-muted">
            Manage FY26 &amp; FY27 holidays with auto weekday, religion tags and
            festival / exam markers. Office-closed days auto-block the calendar as
            a locked all-day banner. Nothing is Hindu-only until you tag it.
          </p>
        </header>

        <HolidaysAdmin
          fyStartYear={fyStartYear}
          holidays={holidays}
          employees={employees}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
