import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Landmark, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listBankItems, listBankWeeks, listBankBalances } from "@/lib/queries/accounts-bank";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { BankBalance } from "@/components/accounts/bank-balance/bank-client";
import { fyLabel, fyStartYearFor } from "@/lib/accounts/cc";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BankBalancePage({ searchParams }: PageProps) {
  await requireAccountsAccess();
  const sp = await searchParams;

  const now = new Date();
  const curFy = fyStartYearFor(now.getFullYear(), now.getMonth() + 1);
  const rawFy = parseInt(String(sp.fy ?? ""), 10);
  const fyStartYear = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [items, weeks, balances, entityOptions] = await Promise.all([
    listBankItems(fyStartYear),
    listBankWeeks(fyStartYear),
    listBankBalances(fyStartYear),
    listAccountsLookups("bank_entity"),
  ]);

  const isCurrentFy = fyStartYear === curFy;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <Link href={"/accounts" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={15} strokeWidth={2.4} /> Back to Accounts index
        </Link>

        <header className="mt-3 mb-7 flex items-start gap-3">
          <span className="mt-1 inline-flex size-11 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}>
            <Landmark size={22} strokeWidth={2.2} />
          </span>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Accounts</span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 6 }}>
              Bank Balance Tracker
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Weekly closing balances per account vs the target balance — the latest snapshot tells you who&apos;s short and by how much.
            </p>
          </div>
        </header>

        <div className="mb-6 flex items-center gap-2.5">
          <Link href={`/accounts/bank-balance?fy=${fyStartYear - 1}` as Route} aria-label="Previous financial year" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
            <ChevronLeft size={18} strokeWidth={2.4} />
          </Link>
          <div className="min-w-[130px] text-center text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>
            {fyLabel(fyStartYear)}
          </div>
          <Link href={`/accounts/bank-balance?fy=${fyStartYear + 1}` as Route} aria-label="Next financial year" className="inline-flex size-9 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
            <ChevronRight size={18} strokeWidth={2.4} />
          </Link>
          {!isCurrentFy && (
            <Link href={"/accounts/bank-balance" as Route} className="ml-1 inline-flex items-center rounded-lg px-3 py-2 text-[13px] font-bold text-ink-soft hover:text-altus-red">Jump to this FY</Link>
          )}
        </div>

        <BankBalance
          fyStartYear={fyStartYear}
          items={items}
          weeks={weeks}
          balances={balances}
          entityOptions={entityOptions}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
