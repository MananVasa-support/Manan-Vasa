import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listWeeklyItems, listWeeklyChecks } from "@/lib/queries/accounts-weekly";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { WeeklyChecklist } from "@/components/accounts/weekly-checklist/weekly-client";
import {
  weeksOfMonth,
  weekNoForDay,
  MONTH_LABELS,
  WEEKLY_CHECK_STATUSES,
  weeklyStatusTone,
} from "@/lib/accounts/weekly";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function clampMonth(y: number, m: number): { y: number; m: number } {
  // m is 1-based; normalise overflow/underflow into adjacent years.
  let year = y;
  let month = m;
  while (month < 1) { month += 12; year -= 1; }
  while (month > 12) { month -= 12; year += 1; }
  return { y: year, m: month };
}

export default async function WeeklyChecklistPage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;

  const rawY = parseInt(String(sp.y ?? ""), 10);
  const rawM = parseInt(String(sp.m ?? ""), 10);
  const year = Number.isFinite(rawY) ? rawY : curY;
  const month = Number.isFinite(rawM) && rawM >= 1 && rawM <= 12 ? rawM : curM;

  const [items, checks, deadlineOptions, categoryOptions, responsibleOptions, frequencyOptions] =
    await Promise.all([
      listWeeklyItems(),
      listWeeklyChecks(year, month),
      listAccountsLookups("weekly_deadline"),
      listAccountsLookups("weekly_category"),
      listAccountsLookups("weekly_responsible"),
      listAccountsLookups("weekly_frequency"),
    ]);

  const weeks = weeksOfMonth(year, month);
  const isCurrentMonth = year === curY && month === curM;
  const currentWeekNo = isCurrentMonth ? weekNoForDay(now.getDate()) : null;

  const prev = clampMonth(year, month - 1);
  const next = clampMonth(year, month + 1);
  const prevHref = `/accounts/weekly-checklist?y=${prev.y}&m=${prev.m}` as Route;
  const nextHref = `/accounts/weekly-checklist?y=${next.y}&m=${next.m}` as Route;
  const monthLabel = `${MONTH_LABELS[month - 1]} ${year}`;

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
              Weekly Checklist
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Recurring weekly compliance items — tick each week of the month as it&apos;s done.
            </p>
          </div>
        </header>

        {/* Month navigator + legend */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-9 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}>
              <CalendarCheck size={18} strokeWidth={2.4} />
            </span>
            <Link href={prevHref} aria-label="Previous month" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
              <ChevronLeft size={18} strokeWidth={2.4} />
            </Link>
            <div className="min-w-[180px] text-center">
              <div className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "-0.02em" }}>
                {monthLabel}
              </div>
              {isCurrentMonth && <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--color-altus-red-deep)" }}>This month · Wk{currentWeekNo}</div>}
            </div>
            <Link href={nextHref} aria-label="Next month" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
              <ChevronRight size={18} strokeWidth={2.4} />
            </Link>
            {!isCurrentMonth && (
              <Link href={"/accounts/weekly-checklist" as Route} className="ml-1 inline-flex items-center rounded-lg px-3 py-2 text-[13px] font-bold text-ink-soft hover:text-altus-red">
                Jump to this month
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {WEEKLY_CHECK_STATUSES.map((s) => {
              const t = weeklyStatusTone(s);
              return (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: t.bg, color: t.fg }}>
                  <span className="inline-block size-[7px] rounded-full" style={{ background: t.dot }} />
                  {s}
                </span>
              );
            })}
          </div>
        </div>

        <WeeklyChecklist
          year={year}
          month={month}
          weeks={weeks}
          currentWeekNo={currentWeekNo}
          items={items}
          checks={checks}
          deadlineOptions={deadlineOptions}
          categoryOptions={categoryOptions}
          responsibleOptions={responsibleOptions}
          frequencyOptions={frequencyOptions}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
