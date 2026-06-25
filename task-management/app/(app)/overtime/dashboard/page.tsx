import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import { getOvertimeDashboard, overtimeScopeFor } from "@/lib/queries/overtime";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

function StatCard({
  label,
  value,
  sub,
  Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  Icon: typeof Clock;
  accent: string;
}) {
  return (
    <div
      className="rounded-section border border-hairline bg-surface-card p-5"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {label}
        </span>
        <span
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: `${accent}1A`, color: accent }}
        >
          <Icon size={16} strokeWidth={2.4} />
        </span>
      </div>
      <div
        className="mt-3 font-bold text-ink-strong tabular-nums"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 32,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <p className="mt-1.5 text-[13px] font-medium text-ink-subtle">{sub}</p>
      )}
    </div>
  );
}

export default async function OvertimeDashboardPage() {
  const me = await requireUser();
  const scope = await overtimeScopeFor(me);

  // Reviewers only — admin OR a manager with reports.
  const canReview = scope.all || scope.ids.length > 1;
  if (!canReview) throw new Error("Forbidden");

  const todayISO = localDateString(TZ);
  const [y, m] = todayISO.split("-");
  const monthStartISO = `${y}-${m}-01`;
  const monthLabel = new Date(`${monthStartISO}T00:00:00`).toLocaleDateString(
    "en-IN",
    { month: "short", year: "numeric" },
  );

  const dash = await getOvertimeDashboard({
    employeeId: me.id,
    isAdmin: me.isAdmin,
    monthStartISO,
    monthLabel,
  });

  const maxAllTime = Math.max(1, ...dash.people.map((p) => p.allTimeHours));
  const fmt = (n: number) => `${n.toFixed(n % 1 === 0 ? 0 : 2)}h`;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1280px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <Link
            href={"/overtime" as Route}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-subtle hover:text-[color:var(--color-altus-red)] transition-colors"
          >
            <ArrowLeft size={15} strokeWidth={2.6} />
            Back to Overtime
          </Link>
          <h1
            className="text-ink-strong mt-2"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px, 3.2vw, 42px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
            }}
          >
            Overtime Dashboard
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Hours by person, this month vs all-time, and pending approvals.
          </p>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1 mb-6">
          <StatCard
            label={`This month (${monthLabel})`}
            value={fmt(dash.monthTotalHours)}
            sub="Total logged hours"
            Icon={Clock}
            accent="#E10600"
          />
          <StatCard
            label="All-time"
            value={fmt(dash.allTimeTotalHours)}
            sub="Total logged hours"
            Icon={Clock}
            accent="#0F172A"
          />
          <StatCard
            label="Pending"
            value={String(dash.pendingCount)}
            sub="Awaiting your review"
            Icon={AlertCircle}
            accent="#D97706"
          />
          <StatCard
            label="Approved"
            value={String(dash.byStatus.approved)}
            sub={`${dash.byStatus.rejected} rejected`}
            Icon={CheckCircle2}
            accent="#16A34A"
          />
        </div>

        {/* By-person bars */}
        <section
          className="rounded-section border border-hairline bg-surface-card p-6 max-md:p-5"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
        >
          <h2
            className="font-bold text-ink-strong mb-1"
            style={{ fontSize: 18, letterSpacing: "-0.01em" }}
          >
            Overtime by person
          </h2>
          <p className="text-[13px] font-medium text-ink-subtle mb-5">
            All-time hours per person. Filled bar = approved; lighter = pending /
            rejected.
          </p>

          {dash.people.length === 0 ? (
            <div className="py-10 text-center">
              <XCircle
                size={26}
                strokeWidth={1.8}
                className="mx-auto mb-3 text-ink-subtle"
              />
              <p className="font-bold text-ink-strong" style={{ fontSize: 15 }}>
                No overtime logged yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {dash.people.map((p) => {
                const totalPct = (p.allTimeHours / maxAllTime) * 100;
                const approvedPct =
                  p.allTimeHours > 0
                    ? (p.allTimeApprovedHours / p.allTimeHours) * 100
                    : 0;
                return (
                  <div key={p.employeeId}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="font-semibold text-ink-strong text-[14px]">
                        {p.employeeName}
                      </span>
                      <span className="font-bold text-ink-strong text-[14px] tabular-nums">
                        {fmt(p.allTimeHours)}
                        <span className="ml-2 font-medium text-ink-subtle text-[12px]">
                          {fmt(p.monthHours)} this month
                        </span>
                      </span>
                    </div>
                    <div
                      className="h-3 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--color-surface-soft, #F1F5F9)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${totalPct}%`,
                          background:
                            "linear-gradient(90deg, var(--color-altus-red-deep), var(--color-altus-red))",
                          opacity: 0.35,
                        }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${approvedPct}%`,
                            background:
                              "linear-gradient(90deg, var(--color-altus-red-deep), var(--color-altus-red))",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
