import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, CandlestickChart } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listShares } from "@/lib/queries/accounts-shares";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import { SharesRegister } from "@/components/accounts/shares-register/shares-client";

export const dynamic = "force-dynamic";

export default async function SharesRegisterPage() {
  await requireAccountsAccess();
  const [rows, entityOptions] = await Promise.all([
    listShares(),
    listAccountsLookups("shares_entity"),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <Link href={"/accounts" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={15} strokeWidth={2.4} /> Back to Accounts index
        </Link>
        <header className="mt-3 mb-7 flex items-start gap-3">
          <span className="mt-1 inline-flex size-11 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red-deep)" }}>
            <CandlestickChart size={22} strokeWidth={2.2} />
          </span>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>Accounts</span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 6 }}>
              Shares Register
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Register of shareholdings &amp; share transactions per entity — quantity, rate, value and folio/demat.
            </p>
          </div>
        </header>
        <SharesRegister rows={rows} entityOptions={entityOptions} />
      </main>
      <DashboardFooter />
    </>
  );
}
