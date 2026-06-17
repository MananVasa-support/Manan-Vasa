import * as React from "react";
import { Wallet, BadgeIndianRupee, FolderKanban, Hourglass, Trophy } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { IncentiveDashboard as DashboardData } from "@/lib/queries/incentives";
import { IncentiveMonthlyChart } from "./incentive-monthly-chart";
import { IncentiveNameChart } from "./incentive-name-chart";

/* ─────────────────────────── small UI atoms ─────────────────────────── */

function Panel({
  title,
  description,
  tone = "slate",
  children,
}: {
  title: string;
  description?: string;
  tone?: "slate" | "red" | "green" | "blue";
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <header className="flex items-start gap-3 mb-5">
        <span
          aria-hidden
          className="mt-1 h-7 w-[3px] shrink-0 rounded-full"
          style={{
            background: `linear-gradient(180deg, var(--color-${tone}), var(--color-${tone}-deep))`,
          }}
        />
        <div className="min-w-0">
          <h2 className="text-display-lg text-ink-strong">{title}</h2>
          {description && (
            <p className="text-body-lg text-ink-subtle mt-0.5">{description}</p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="pb-2 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 11, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  bold = false,
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`py-2.5 tabular-nums whitespace-nowrap ${
        bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"
      }`}
      style={{ fontSize: 14, textAlign: align, ...style }}
    >
      {children}
    </td>
  );
}

/* ─────────────────────────── metric cards ─────────────────────────── */

function MetricCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone: "slate" | "red" | "blue" | "amber";
  icon: typeof Wallet;
}) {
  return (
    <div
      className="relative block bg-surface-card rounded-section overflow-hidden"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        padding: "16px 18px 15px",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 5,
          background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
        }}
      />
      <span
        aria-hidden
        className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-xl"
        style={{
          background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
          color: `var(--color-${tone}-deep)`,
        }}
      >
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span
        className="uppercase font-black tracking-[0.08em] leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 12,
          color: `var(--color-${tone}-deep)`,
        }}
      >
        {label}
      </span>
      <span
        className="block mt-2 leading-[0.9] tracking-[-0.035em] tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(26px, 2vw, 36px)",
        }}
      >
        {value}
      </span>
      {sub && (
        <span className="block mt-2 font-bold leading-tight" style={{ fontSize: 12 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────── main view ─────────────────────────── */

export function IncentiveDashboard({ data }: { data: DashboardData }) {
  const { consolidated, permanent, project, perEmployee, perIncentiveName, monthly, leaderboard } =
    data;

  // NOTE: per-employee × per-month figures are not exposed by getIncentiveDashboard
  // (it returns a company-wide `monthly` series + per-employee YTD totals). We render
  // the exact per-employee Permanent / Project / YTD / Paid / Unpaid columns and keep
  // the month breakdown in the company-wide Monthly chart above, rather than inventing
  // per-person monthly splits the summary can't support.

  const empTotal = perEmployee.reduce((s, r) => s + r.total, 0);
  const empPaid = perEmployee.reduce((s, r) => s + r.paid, 0);
  const empUnpaid = perEmployee.reduce((s, r) => s + r.unpaid, 0);

  const nameApproved = perIncentiveName.reduce((s, r) => s + r.approved, 0);
  const namePaid = perIncentiveName.reduce((s, r) => s + r.paid, 0);
  const nameUnpaid = perIncentiveName.reduce((s, r) => s + r.unpaid, 0);
  // Project roll-up row (project ledger isn't split by name in the summary).
  const projectRow = project.approved > 0 || project.paid > 0;

  const leaderTotal = leaderboard.reduce((s, r) => s + r.total, 0);
  const podium = leaderboard.slice(0, 3);

  return (
    <div className="space-y-7">
      {/* Consolidated YTD metric cards */}
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <MetricCard
          label="CONSOLIDATED"
          value={formatInr(consolidated.approved)}
          tone="slate"
          icon={Wallet}
          sub={
            <span style={{ color: "var(--color-ink-soft)" }}>Permanent + project YTD</span>
          }
        />
        <MetricCard
          label="PERMANENT"
          value={formatInr(permanent.approved)}
          tone="red"
          icon={BadgeIndianRupee}
          sub={<span style={{ color: "var(--color-ink-soft)" }}>Ledger incentives</span>}
        />
        <MetricCard
          label="PROJECT"
          value={formatInr(project.approved)}
          tone="blue"
          icon={FolderKanban}
          sub={<span style={{ color: "var(--color-ink-soft)" }}>Project-based incentives</span>}
        />
        <MetricCard
          label="UNPAID"
          value={formatInr(consolidated.unpaid)}
          tone="amber"
          icon={Hourglass}
          sub={
            <span style={{ color: "var(--color-green-deep)" }}>
              {formatInr(consolidated.paid)} paid
            </span>
          }
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        <Panel title="Monthly Incentive" description="Permanent vs project per month" tone="red">
          <IncentiveMonthlyChart rows={monthly} />
        </Panel>
        <Panel
          title="Incentive Mix"
          description="Permanent incentives by name"
          tone="blue"
        >
          <IncentiveNameChart rows={perIncentiveName} />
        </Panel>
      </div>

      {/* Leaderboard */}
      <Panel title="Leaderboard" description="Top earners by YTD incentive" tone="red">
        {leaderboard.length === 0 ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No earners this year yet.
          </p>
        ) : (
          <>
            {podium.length >= 2 && (
              <div className="mb-6 grid grid-cols-3 gap-3 items-end max-sm:grid-cols-1">
                {orderPodium(podium).map(({ row, rank }) => (
                  <PodiumCard
                    key={row.name}
                    rank={rank}
                    name={row.name}
                    total={row.total}
                  />
                ))}
              </div>
            )}
            <ol className="space-y-2.5">
              {leaderboard.map((row, i) => {
                const share = leaderTotal > 0 ? (row.total / leaderTotal) * 100 : 0;
                return (
                  <li key={row.name} className="flex items-center gap-3">
                    <span
                      className="tabular-nums font-black text-ink-subtle w-6 text-right shrink-0"
                      style={{ fontSize: 15 }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className="truncate font-bold text-ink-strong"
                          style={{ fontSize: 15 }}
                        >
                          {row.name}
                        </span>
                        <span
                          className="tabular-nums font-bold text-ink-strong shrink-0"
                          style={{ fontSize: 15 }}
                        >
                          {formatInr(row.total)}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--color-hairline)" }}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(2, share)}%`,
                            background:
                              "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))",
                          }}
                        />
                      </div>
                    </div>
                    <span
                      className="tabular-nums font-semibold text-ink-subtle w-12 text-right shrink-0"
                      style={{ fontSize: 13 }}
                    >
                      {share.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Panel>

      {/* Employee-wise YTD table */}
      <Panel
        title="Employee-wise YTD"
        description="Permanent + project totals per employee"
        tone="slate"
      >
        {perEmployee.length === 0 ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No employee incentives this year.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th align="right">Permanent</Th>
                  <Th align="right">Project</Th>
                  <Th align="right">YTD Total</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Unpaid</Th>
                </tr>
              </thead>
              <tbody>
                {perEmployee.map((r) => (
                  <tr key={r.name} className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                    <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>
                      {r.name}
                    </td>
                    <Td align="right">{formatInr(r.permanent)}</Td>
                    <Td align="right">{formatInr(r.project)}</Td>
                    <Td align="right" bold>
                      {formatInr(r.total)}
                    </Td>
                    <Td align="right" style={{ color: "var(--color-green-deep)" }}>
                      {formatInr(r.paid)}
                    </Td>
                    <Td align="right" style={{ color: r.unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>
                      {formatInr(r.unpaid)}
                    </Td>
                  </tr>
                ))}
                <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <td
                    className="py-2.5 font-black uppercase tracking-[0.04em] text-ink-strong"
                    style={{ fontSize: 13 }}
                  >
                    Total
                  </td>
                  <Td align="right" bold>{formatInr(permanent.approved)}</Td>
                  <Td align="right" bold>{formatInr(project.approved)}</Td>
                  <Td align="right" bold>{formatInr(empTotal)}</Td>
                  <Td align="right" bold style={{ color: "var(--color-green-deep)" }}>
                    {formatInr(empPaid)}
                  </Td>
                  <Td align="right" bold style={{ color: "var(--color-red-deep)" }}>
                    {formatInr(empUnpaid)}
                  </Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Incentive-name YTD table */}
      <Panel
        title="Incentive-name YTD"
        description="Permanent ledger by incentive, with the project roll-up"
        tone="blue"
      >
        {perIncentiveName.length === 0 && !projectRow ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No incentives this year.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Incentive</Th>
                  <Th align="right">Count</Th>
                  <Th align="right">YTD</Th>
                  <Th align="right">Paid</Th>
                  <Th align="right">Unpaid</Th>
                </tr>
              </thead>
              <tbody>
                {perIncentiveName.map((r) => (
                  <tr key={r.name} className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                    <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>
                      {r.name}
                    </td>
                    <Td align="right">{r.count}</Td>
                    <Td align="right" bold>{formatInr(r.approved)}</Td>
                    <Td align="right" style={{ color: "var(--color-green-deep)" }}>
                      {formatInr(r.paid)}
                    </Td>
                    <Td align="right" style={{ color: r.unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>
                      {formatInr(r.unpaid)}
                    </Td>
                  </tr>
                ))}
                {projectRow && (
                  <tr className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                    <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>
                      Project Based Incentive
                    </td>
                    <Td align="right">—</Td>
                    <Td align="right" bold>{formatInr(project.approved)}</Td>
                    <Td align="right" style={{ color: "var(--color-green-deep)" }}>
                      {formatInr(project.paid)}
                    </Td>
                    <Td align="right" style={{ color: project.unpaid > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>
                      {formatInr(project.unpaid)}
                    </Td>
                  </tr>
                )}
                <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <td
                    className="py-2.5 font-black uppercase tracking-[0.04em] text-ink-strong"
                    style={{ fontSize: 13 }}
                  >
                    Total
                  </td>
                  <Td align="right">—</Td>
                  <Td align="right" bold>{formatInr(nameApproved + project.approved)}</Td>
                  <Td align="right" bold style={{ color: "var(--color-green-deep)" }}>
                    {formatInr(namePaid + project.paid)}
                  </Td>
                  <Td align="right" bold style={{ color: "var(--color-red-deep)" }}>
                    {formatInr(nameUnpaid + project.unpaid)}
                  </Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ─────────────────────────── podium ─────────────────────────── */

function orderPodium(
  podium: DashboardData["leaderboard"],
): { row: DashboardData["leaderboard"][number]; rank: number }[] {
  // Visual order: 2nd, 1st, 3rd (so #1 sits centre + tallest).
  const out: { row: DashboardData["leaderboard"][number]; rank: number }[] = [];
  if (podium[1]) out.push({ row: podium[1], rank: 2 });
  if (podium[0]) out.push({ row: podium[0], rank: 1 });
  if (podium[2]) out.push({ row: podium[2], rank: 3 });
  return out;
}

const PODIUM_TONE: Record<number, { ring: string; medal: string }> = {
  1: { ring: "var(--color-altus-red)", medal: "#D4AF37" },
  2: { ring: "var(--color-hairline-strong)", medal: "#9CA3AF" },
  3: { ring: "var(--color-hairline-strong)", medal: "#B45309" },
};

function PodiumCard({ rank, name, total }: { rank: number; name: string; total: number }) {
  const tone = PODIUM_TONE[rank]!;
  const isFirst = rank === 1;
  return (
    <div
      className="rounded-section border bg-surface-card flex flex-col items-center text-center"
      style={{
        borderColor: tone.ring,
        borderWidth: isFirst ? 2 : 1,
        padding: isFirst ? "22px 16px" : "16px 14px",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full font-black text-white"
        style={{
          background: tone.medal,
          width: isFirst ? 40 : 32,
          height: isFirst ? 40 : 32,
          fontSize: isFirst ? 18 : 15,
        }}
      >
        {rank}
      </span>
      <span
        className="mt-2.5 font-bold text-ink-strong truncate max-w-full"
        style={{ fontSize: isFirst ? 17 : 15 }}
      >
        {name}
      </span>
      <span
        className="mt-1 tabular-nums font-black text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: isFirst ? 22 : 18,
        }}
      >
        {formatInr(total)}
      </span>
      <Trophy
        size={isFirst ? 18 : 15}
        strokeWidth={2.2}
        className="mt-1.5"
        style={{ color: tone.medal }}
        aria-hidden
      />
    </div>
  );
}
