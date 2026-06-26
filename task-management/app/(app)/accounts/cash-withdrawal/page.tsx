import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Banknote, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listCashItems, listCashMonths, listCashLimits } from "@/lib/queries/accounts-cash";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { CashWithdrawal } from "@/components/accounts/cash-withdrawal/cash-client";
import { fyMonthCols, fyLabel, fyStartYearFor } from "@/lib/accounts/cc";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CashWithdrawalPage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curFy = fyStartYearFor(now.getFullYear(), now.getMonth() + 1);
  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [items, months, limits, entityOptions, payeeOptions] = await Promise.all([
    listCashItems(fyStartYear),
    listCashMonths(fyStartYear),
    listCashLimits(fyStartYear),
    listAccountsLookups("cash_entity"),
    listAccountsLookups("cash_payee"),
  ]);

  const cols = fyMonthCols(fyStartYear);
  const isCurrentFy = fyStartYear === curFy;
  const currentMonth = isCurrentFy ? now.getMonth() + 1 : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <Link href={"/accounts" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={15} strokeWidth={2.4} /> Back to Accounts index
        </Link>

        <header className="mt-3 mb-7 flex items-start gap-3">
          <span className="mt-1 inline-flex size-11 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}>
            <Banknote size={22} strokeWidth={2.2} />
          </span>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Accounts</span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 6 }}>
              Cash Withdrawal Tracker
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Cheque withdrawals by entity across the financial year, with each entity&apos;s annual cap and how much headroom is left.
            </p>
          </div>
        </header>

        <div className="mb-6 flex items-center gap-2.5">
          <Link href={`/accounts/cash-withdrawal?fy=${fyStartYear - 1}` as Route} aria-label="Previous financial year" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
            <ChevronLeft size={18} strokeWidth={2.4} />
          </Link>
          <div className="min-w-[130px] text-center text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>
            {fyLabel(fyStartYear)}
          </div>
          <Link href={`/accounts/cash-withdrawal?fy=${fyStartYear + 1}` as Route} aria-label="Next financial year" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
            <ChevronRight size={18} strokeWidth={2.4} />
          </Link>
          {!isCurrentFy && (
            <Link href={"/accounts/cash-withdrawal" as Route} className="ml-1 inline-flex items-center rounded-lg px-3 py-2 text-[13px] font-bold text-ink-soft hover:text-altus-red">Jump to this FY</Link>
          )}
        </div>

        <CashWithdrawal
          fyStartYear={fyStartYear}
          cols={cols}
          currentMonth={currentMonth}
          items={items}
          months={months}
          limits={limits}
          entityOptions={entityOptions}
          payeeOptions={payeeOptions}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
