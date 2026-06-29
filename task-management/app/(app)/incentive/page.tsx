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
import { IncentiveCatalogDialog } from "@/components/incentive/incentive-catalog-dialog";

export const dynamic = "force-dynamic";

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

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1280px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(36px, 4vw, 52px)",
                letterSpacing: "-0.025em",
                lineHeight: 1,
              }}
            >
              Incentive
            </h1>
            <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 18 }}>
              {me.isAdmin
                ? "Team incentive analytics and request review."
                : "Track incentive earnings and file requests."}
            </p>
          </div>
          <div className="shrink-0">
            <IncentiveCatalogDialog rows={catalog} isAdmin={me.isAdmin} />
          </div>
        </header>

        <IncentiveTabs
          dashboard={dashboard}
          targetVsActual={targetVsActual}
          billing={billing}
          years={years}
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
