import Link from "next/link";
import type { Route } from "next";
import { Award, TrendingUp, CheckCircle2, Hourglass, Gauge } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { IncentiveTabs } from "@/components/incentive/incentive-tabs";
import { requireUser } from "@/lib/auth/current";
import { listIncentiveRequests } from "@/lib/queries/incentive";
import {
  getIncentiveDashboard,
  getIncentiveTargetVsActual,
  listIncentiveEntriesAdmin,
} from "@/lib/queries/incentives";
import { getBillingDashboard } from "@/lib/queries/billing";
import { listIncentiveCatalog } from "@/lib/queries/incentive-catalog";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { withRetry } from "@/lib/db/with-timeout";
import { formatInr } from "@/lib/format";
import { IncentiveCatalogDialog } from "@/components/incentive/incentive-catalog-dialog";

export const dynamic = "force-dynamic";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IncentivePage({ searchParams }: PageProps) {
  const me = await requireUser();
  const sp = await searchParams;

  // Year selector — default to the current calendar year; offer a small
  // trailing window so prior years stay reachable.
  const currentYear = new Date().getFullYear();
  const raw = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const parsed = raw ? Number(raw) : currentYear;
  const year = Number.isFinite(parsed) ? parsed : currentYear;
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3].filter(
    (y, i, a) => a.indexOf(y) === i,
  );
  if (!years.includes(year)) years.unshift(year);

  // Each DB read is retried on a FRESH connection (withRetry) — the first query
  // of a request is the one most likely to grab a stale pooled connection (the
  // recurring "That didn't go through" signature), and this page has no cache to
  // fall back on. Previously these ran bare in a Promise.all, so a single
  // transient blip on ANY of them crashed the whole /incentive page to the error
  // boundary. Reads are idempotent, so retry-on-fresh-connection is safe and is
  // the same cure the exec dashboard uses. `getBillingDashboard` is already
  // self-resilient (returns EMPTY on a Sheets hiccup) so it stays bare.
  const r = <T,>(label: string, make: () => Promise<T>): Promise<T> =>
    withRetry(make, { attempts: 2, timeoutMs: [6000, 9000], label });

  const [dashboard, targetVsActual, billing, rows, catalog, entries, employees] =
    await Promise.all([
      r("incentive:dashboard", () => getIncentiveDashboard(year)),
      r("incentive:target-vs-actual", () => getIncentiveTargetVsActual(year)),
      getBillingDashboard(year),
      r("incentive:requests", () => listIncentiveRequests({ employeeId: me.id, isAdmin: me.isAdmin })),
      r("incentive:catalog", () => listIncentiveCatalog()),
      me.isAdmin ? r("incentive:entries", () => listIncentiveEntriesAdmin(year)) : Promise.resolve([]),
      me.isAdmin ? r("incentive:employees", () => listEmployeeOptions()) : Promise.resolve([]),
    ]);

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  // ── Page-level KPIs, folded over the already-loaded data (zero extra queries) ──
  const earned = dashboard.consolidated.approved;
  const paid = dashboard.consolidated.paid;
  const unpaid = dashboard.consolidated.unpaid;
  const attainPct = targetVsActual.totals.attainmentPct;
  const paidRate = earned > 0 ? (paid / earned) * 100 : null;
  const attainAccent =
    attainPct == null
      ? "#334155"
      : attainPct >= 100
        ? GREEN
        : attainPct >= 60
          ? "#d97706"
          : "var(--color-altus-red)";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Glass hero: eyebrow · title · year pills · incentive table ── */}
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
                <Award size={13} strokeWidth={2.6} /> Employees · Incentive
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
                Incentive · {year}
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                {me.isAdmin
                  ? "Team incentive analytics and request review — earned, paid and target attainment across the year."
                  : "Track your incentive earnings, attainment and file requests."}
              </p>
            </div>

            <div className="flex flex-col items-end gap-3 max-md:items-start">
              <nav aria-label="Incentive year" className="flex flex-wrap items-center justify-end gap-2 max-md:justify-start">
                {years.map((y) => {
                  const active = y === year;
                  return (
                    <Link
                      key={y}
                      href={`/incentive?year=${y}` as Route}
                      aria-current={active ? "page" : undefined}
                      className="wg-btn rounded-pill px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap tabular-nums"
                      style={
                        active
                          ? {
                              background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                              color: "#fff",
                              boxShadow: `0 8px 20px -10px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
                            }
                          : {
                              background: "var(--color-surface-card)",
                              color: "var(--color-ink-soft)",
                              boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                            }
                      }
                    >
                      {y}
                    </Link>
                  );
                })}
              </nav>
              <IncentiveCatalogDialog rows={catalog} isAdmin={me.isAdmin} />
            </div>
          </div>
        </header>

        {/* ── KPI strip (folded over the loaded dashboard + attainment — zero extra queries) ── */}
        <section
          aria-label="Incentive totals"
          className="mb-6 grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1"
        >
          <KpiCard
            icon={<TrendingUp size={17} strokeWidth={2.4} />}
            accent={GREEN}
            label="Total earned"
            value={formatInr(earned)}
            caption={`permanent + project · ${year}`}
            delay={0}
          />
          <KpiCard
            icon={<CheckCircle2 size={17} strokeWidth={2.4} />}
            accent={GREEN_DEEP}
            label="Paid"
            value={formatInr(paid)}
            caption={paidRate != null ? `${paidRate.toFixed(0)}% of earned settled` : "nothing earned yet"}
            progress={paidRate != null ? Math.min(paidRate / 100, 1) : null}
            delay={50}
          />
          <KpiCard
            icon={<Hourglass size={17} strokeWidth={2.4} />}
            accent={unpaid > 0 ? "var(--color-altus-red)" : "#334155"}
            label="Unpaid"
            value={formatInr(unpaid)}
            caption={unpaid > 0 ? "awaiting payout" : "all settled"}
            delay={100}
          />
          <KpiCard
            icon={<Gauge size={17} strokeWidth={2.4} />}
            accent={attainAccent}
            label="Avg attainment"
            value={attainPct == null ? "—" : `${attainPct.toFixed(0)}%`}
            caption={
              attainPct == null
                ? "no targets set"
                : `${formatInr(targetVsActual.totals.actual)} of ${formatInr(targetVsActual.totals.target)} target`
            }
            progress={attainPct != null ? Math.min(attainPct / 100, 1) : null}
            delay={150}
          />
        </section>

        <IncentiveTabs
          dashboard={dashboard}
          targetVsActual={targetVsActual}
          billing={billing}
          year={year}
          requests={rows}
          entries={entries}
          employees={employees}
          isAdmin={me.isAdmin}
          pendingCount={pendingCount}
        />
      </main>
      <DashboardFooter />
    </>
  );
}

/* ── KPI card — same construction as the Attendance / Salary stat cards ── */

function KpiCard({
  icon,
  accent,
  label,
  value,
  caption,
  progress,
  delay,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  /** 0–1 fill for the thin bar; omit/null to hide it. */
  progress?: number | null;
  delay: number;
}) {
  return (
    <div
      className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{
            background: `color-mix(in srgb, ${accent} 10%, transparent)`,
            color: accent,
          }}
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
          fontSize: "clamp(21px, 1.7vw, 27px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      {progress != null && (
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-hairline)" }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, progress * 100)}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 75%, #fff), ${accent})`,
            }}
          />
        </div>
      )}
    </div>
  );
}
