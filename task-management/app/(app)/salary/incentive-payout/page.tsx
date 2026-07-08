import Link from "next/link";
import type { Route } from "next";
import { Coins, HandCoins, Wallet } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAdmin } from "@/lib/auth/current";
import { listRunsForMonth } from "@/lib/queries/salary";
import { getIncentivePayablesByPerson, payoutNameKey } from "@/lib/queries/incentive-payout";
import { isIncentivePayoutOff } from "./actions";
import {
  IncentivePayoutSurface,
  type PayoutRunRow,
} from "@/components/salary/incentive-payout-surface";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const MONTH_RE = /^\d{4}-\d{2}$/;

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Recent months to offer in the selector (this IST month + 11 prior). */
function recentMonths(count = 12): string[] {
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  const out: string[] = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1; // 1-based
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${m < 10 ? `0${m}` : m}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/**
 * WS-4 #7 — the unified incentive-payout surface. Sits alongside salary: for a
 * chosen month it lists the salary runs, and next to each shows that person's
 * accrued-but-unpaid incentive pool with a one-click "Pay incentives with this
 * run" action (behind INCENTIVE_PAYOUT_OFF). A batch "Pay all" settles everyone.
 */
export default async function IncentivePayoutPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const raw = typeof sp.month === "string" ? sp.month : undefined;
  const nowYm = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  // Default to last complete month (runs usually exist for it).
  const months = recentMonths();
  const defaultMonth = months.find((m) => m < nowYm) ?? months[0]!;
  const month = raw && MONTH_RE.test(raw) ? raw : defaultMonth;

  const [runs, payables, killed] = await Promise.all([
    listRunsForMonth(month),
    getIncentivePayablesByPerson(month),
    isIncentivePayoutOff(),
  ]);

  // Join each run to its incentive payable bucket (by name, then employeeId).
  const rows: PayoutRunRow[] = runs.map((r) => {
    let bucket = payables.get(payoutNameKey(r.employeeName));
    if (!bucket && r.employeeId) {
      for (const b of payables.values()) {
        if (b.employeeId === r.employeeId) {
          bucket = b;
          break;
        }
      }
    }
    const accruedTotal = bucket
      ? bucket.sources.reduce((s, x) => s + x.accrued, 0)
      : 0;
    const paidTotal = bucket ? bucket.sources.reduce((s, x) => s + x.paid, 0) : 0;
    return {
      runId: r.id,
      employeeName: r.employeeName,
      payingEntityName: r.payingEntityName,
      netPayable: r.netPayable,
      disbursed: r.disbursed,
      incentiveAccrued: Math.round(accruedTotal * 100) / 100,
      incentivePaid: Math.round(paidTotal * 100) / 100,
      incentiveOutstanding: bucket ? bucket.outstanding : 0,
      sourceCount: bucket ? bucket.sources.length : 0,
    };
  });

  const totalOutstanding = rows.reduce((s, r) => s + r.incentiveOutstanding, 0);
  const peopleWithOutstanding = rows.filter((r) => r.incentiveOutstanding > 0.005).length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
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
                <HandCoins size={13} strokeWidth={2.6} /> Salary · Incentive payout
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
                {monthLabel(month)} payout
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                Pay accrued incentives from the same place salary is paid. Each payout stamps the
                incentive as paid, links it to the salary run, and is idempotent — re-running only
                settles what still remains.
              </p>
            </div>

            <nav
              aria-label="Payout month"
              className="flex max-w-[560px] flex-wrap items-center justify-end gap-2 max-md:justify-start"
            >
              {months.map((m) => {
                const active = m === month;
                return (
                  <Link
                    key={m}
                    href={`/salary/incentive-payout?month=${m}` as Route}
                    aria-current={active ? "page" : undefined}
                    className="wg-btn rounded-pill px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap"
                    style={
                      active
                        ? {
                            background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                            color: "#fff",
                            boxShadow: `0 8px 20px -10px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent)`,
                          }
                        : {
                            background: "var(--color-surface-card)",
                            color: "var(--color-ink-soft)",
                            boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                          }
                    }
                  >
                    {new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1)).toLocaleDateString(
                      "en-GB",
                      { month: "short", year: "2-digit", timeZone: "UTC" },
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        {/* KPI strip */}
        <section
          aria-label="Payout totals"
          className="mb-5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1"
        >
          <KpiCard
            icon={<Wallet size={17} strokeWidth={2.4} />}
            accent="#334155"
            label="Salary runs"
            value={String(rows.length)}
            caption="on this month"
          />
          <KpiCard
            icon={<Coins size={17} strokeWidth={2.4} />}
            accent={GREEN}
            label="Accrued unpaid"
            value={`₹${Math.round(totalOutstanding).toLocaleString("en-IN")}`}
            caption={`${peopleWithOutstanding} ${peopleWithOutstanding === 1 ? "person" : "people"} to pay`}
          />
          <KpiCard
            icon={<HandCoins size={17} strokeWidth={2.4} />}
            accent={GREEN_DEEP}
            label="Payout mode"
            value={killed ? "Legacy" : "Unified"}
            caption={killed ? "INCENTIVE_PAYOUT_OFF is set" : "one surface with salary"}
          />
        </section>

        <IncentivePayoutSurface
          month={month}
          monthLabel={monthLabel(month)}
          rows={rows}
          killed={killed}
        />
      </main>
      <DashboardFooter />
    </>
  );
}

function KpiCard({
  icon,
  accent,
  label,
  value,
  caption,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div
      className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {label}
        </span>
      </div>
      <div
        className="mt-2 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(20px, 1.6vw, 25px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
    </div>
  );
}
