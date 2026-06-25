import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listCcCards, listCcMonths } from "@/lib/queries/accounts-cc";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { CcMaster } from "@/components/accounts/cc-master/cc-client";
import { fyMonthCols, fyLabel, fyStartYearFor } from "@/lib/accounts/cc";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CcMasterPage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curFy = fyStartYearFor(now.getFullYear(), curMonth);

  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const cols = fyMonthCols(fyStartYear);
  const isCurrentFy = fyStartYear === curFy;
  const rawM = parseInt(String(sp.m ?? ""), 10);
  const validMonth = Number.isFinite(rawM) && rawM >= 1 && rawM <= 12;
  const month = validMonth ? rawM : isCurrentFy ? curMonth : 4; // default current month, else April

  const [cards, months, entityOptions] = await Promise.all([
    listCcCards(fyStartYear),
    listCcMonths(fyStartYear),
    listAccountsLookups("cc_entity"),
  ]);

  const prevHref = `/accounts/cc-tracker?fy=${fyStartYear - 1}&m=${month}` as Route;
  const nextHref = `/accounts/cc-tracker?fy=${fyStartYear + 1}&m=${month}` as Route;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <Link href={"/accounts" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={15} strokeWidth={2.4} />
          Back to Accounts index
        </Link>

        <header className="mt-3 mb-7 flex items-start gap-3">
          <span className="mt-1 inline-flex size-11 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}>
            <CreditCard size={22} strokeWidth={2.2} />
          </span>
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
              Credit Cards Master
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Per-card statement, payment &amp; tally tracking — pick a month of the financial year.
            </p>
          </div>
        </header>

        {/* FY navigator */}
        <div className="mb-4 flex items-center gap-2.5">
          <Link href={prevHref} aria-label="Previous financial year" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
            <ChevronLeft size={18} strokeWidth={2.4} />
          </Link>
          <div className="min-w-[130px] text-center text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>
            {fyLabel(fyStartYear)}
          </div>
          <Link href={nextHref} aria-label="Next financial year" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
            <ChevronRight size={18} strokeWidth={2.4} />
          </Link>
        </div>

        {/* Month chips (Apr→Mar) */}
        <div className="mb-6 flex flex-wrap gap-1.5">
          {cols.map((c) => {
            const active = c.month === month;
            const href = `/accounts/cc-tracker?fy=${fyStartYear}&m=${c.month}` as Route;
            return (
              <Link
                key={c.month}
                href={href}
                className="inline-flex items-center rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors"
                style={
                  active
                    ? { background: "var(--color-altus-red)", color: "#fff" }
                    : { background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }
                }
              >
                {c.label} &apos;{String(c.calYear % 100).padStart(2, "0")}
              </Link>
            );
          })}
        </div>

        <CcMaster
          fyStartYear={fyStartYear}
          month={month}
          cards={cards}
          months={months}
          entityOptions={entityOptions}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
