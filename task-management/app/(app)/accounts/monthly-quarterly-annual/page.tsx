import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listMonthlyItems, listMonthlyChecks } from "@/lib/queries/accounts-monthly";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { MonthlyChecklist } from "@/components/accounts/monthly-checklist/monthly-client";
import {
  fyMonthCols,
  fyLabel,
  fyStartYearFor,
  MONTHLY_CHECK_STATUSES,
  monthlyStatusTone,
} from "@/lib/accounts/monthly";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MonthlyChecklistPage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curFy = fyStartYearFor(now.getFullYear(), curMonth);

  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [items, checks, typeOptions, responsibleOptions, deadlineOptions, frequencyOptions] =
    await Promise.all([
      listMonthlyItems(),
      listMonthlyChecks(fyStartYear),
      listAccountsLookups("monthly_type"),
      listAccountsLookups("monthly_responsible"),
      listAccountsLookups("monthly_deadline"),
      listAccountsLookups("monthly_frequency"),
    ]);

  const cols = fyMonthCols(fyStartYear);
  const isCurrentFy = fyStartYear === curFy;
  const currentMonth = isCurrentFy ? curMonth : null;

  const prevHref = `/accounts/monthly-quarterly-annual?fy=${fyStartYear - 1}` as Route;
  const nextHref = `/accounts/monthly-quarterly-annual?fy=${fyStartYear + 1}` as Route;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <Link href={"/accounts" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={15} strokeWidth={2.4} />
          Back to Accounts index
        </Link>

        <header className="mt-3 mb-7 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>
              Accounts
            </span>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px, 3.4vw, 44px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
                marginTop: 6,
              }}
            >
              Quarter / Month / Annual Checklist
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Monthly, quarterly and annual things to get done — tick each month of the financial year as it&apos;s done.
            </p>
          </div>
        </header>

        {/* FY navigator + legend */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-9 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}>
              <CalendarRange size={18} strokeWidth={2.4} />
            </span>
            <Link href={prevHref} aria-label="Previous financial year" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
              <ChevronLeft size={18} strokeWidth={2.4} />
            </Link>
            <div className="min-w-[160px] text-center">
              <div className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "-0.02em" }}>
                {fyLabel(fyStartYear)}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Apr–Mar</div>
            </div>
            <Link href={nextHref} aria-label="Next financial year" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
              <ChevronRight size={18} strokeWidth={2.4} />
            </Link>
            {!isCurrentFy && (
              <Link href={"/accounts/monthly-quarterly-annual" as Route} className="ml-1 inline-flex items-center rounded-lg px-3 py-2 text-[13px] font-bold text-ink-soft hover:text-altus-red">
                Jump to this FY
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {MONTHLY_CHECK_STATUSES.map((s) => {
              const t = monthlyStatusTone(s);
              return (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: t.bg, color: t.fg }}>
                  <span className="inline-block size-[7px] rounded-full" style={{ background: t.dot }} />
                  {s}
                </span>
              );
            })}
          </div>
        </div>

        <MonthlyChecklist
          fyStartYear={fyStartYear}
          cols={cols}
          currentMonth={currentMonth}
          items={items}
          checks={checks}
          typeOptions={typeOptions}
          responsibleOptions={responsibleOptions}
          deadlineOptions={deadlineOptions}
          frequencyOptions={frequencyOptions}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
