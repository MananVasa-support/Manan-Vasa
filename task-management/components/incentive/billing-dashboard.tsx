import * as React from "react";
import { IndianRupee, CheckCircle2, Hourglass, ReceiptText, Trophy } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { BillingSummary } from "@/lib/billing/sheet";

/* ── atoms (match incentive-dashboard look) ── */

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
          style={{ background: `linear-gradient(180deg, var(--color-${tone}), var(--color-${tone}-deep))` }}
        />
        <div className="min-w-0">
          <h2 className="text-display-lg text-ink-strong">{title}</h2>
          {description && <p className="text-body-lg text-ink-subtle mt-0.5">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function MetricCard({
  label, value, sub, tone, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone: "slate" | "red" | "blue" | "amber" | "green";
  icon: typeof IndianRupee;
}) {
  return (
    <div
      className="relative block bg-surface-card rounded-section overflow-hidden"
      style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)", padding: "16px 18px 15px" }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 5, background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))` }} />
      <span aria-hidden className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`, color: `var(--color-${tone}-deep)` }}>
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span className="uppercase font-black tracking-[0.08em] leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 12, color: `var(--color-${tone}-deep)` }}>
        {label}
      </span>
      <span className="block mt-2 leading-[0.9] tracking-[-0.035em] tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 2vw, 36px)" }}>
        {value}
      </span>
      {sub && <span className="block mt-2 font-bold leading-tight" style={{ fontSize: 12 }}>{sub}</span>}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="pb-2 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap" style={{ fontSize: 11, textAlign: align }}>{children}</th>;
}
function Td({ children, align = "left", bold = false, style }: { children: React.ReactNode; align?: "left" | "right"; bold?: boolean; style?: React.CSSProperties }) {
  return <td className={`py-2.5 tabular-nums whitespace-nowrap ${bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"}`} style={{ fontSize: 14, textAlign: align, ...style }}>{children}</td>;
}

/* ── main view ── */

export function BillingDashboard({ data }: { data: BillingSummary & { error?: string } }) {
  const { totals, perSalesperson, monthly, deals } = data;

  if (data.error) {
    return (
      <div className="rounded-section border border-hairline bg-surface-card p-7" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <p className="font-bold text-ink-strong" style={{ fontSize: 16 }}>Couldn’t read the billing sheet</p>
        <p className="mt-1 font-semibold text-ink-subtle" style={{ fontSize: 14 }}>{data.error}</p>
      </div>
    );
  }

  if (totals.deals === 0) {
    return (
      <div className="rounded-section border border-hairline bg-surface-card p-10 text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <p className="font-bold text-ink-strong" style={{ fontSize: 16 }}>No billing this year</p>
        <p className="mt-1 font-semibold text-ink-subtle" style={{ fontSize: 14 }}>No sales-credited deals found in the Billing sheet for the selected year.</p>
      </div>
    );
  }

  const collectRate = totals.billed > 0 ? (totals.paid / totals.billed) * 100 : 0;
  const maxBilled = Math.max(...perSalesperson.map((p) => p.billed), 1);
  const maxMonth = Math.max(...monthly.map((m) => m.billed), 1);
  const podium = perSalesperson.slice(0, 3);

  return (
    <div className="space-y-7">
      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <MetricCard label="BILLING TOTAL" value={formatInr(totals.billed)} tone="red" icon={IndianRupee}
          sub={<span style={{ color: "var(--color-ink-soft)" }}>{totals.deals} deal{totals.deals === 1 ? "" : "s"} YTD</span>} />
        <MetricCard label="COLLECTED" value={formatInr(totals.paid)} tone="green" icon={CheckCircle2}
          sub={<span style={{ color: "var(--color-green-deep)" }}>{collectRate.toFixed(0)}% of billed</span>} />
        <MetricCard label="OUTSTANDING" value={formatInr(totals.outstanding)} tone="amber" icon={Hourglass}
          sub={<span style={{ color: "var(--color-ink-soft)" }}>Billed − collected</span>} />
        <MetricCard label="SALESPEOPLE" value={String(perSalesperson.length)} tone="slate" icon={ReceiptText}
          sub={<span style={{ color: "var(--color-ink-soft)" }}>Credited this year</span>} />
      </div>

      {/* Leaderboard by billing total */}
      <Panel title="Billing Leaderboard" description="Salespeople by billing total (YTD)" tone="red">
        {podium.length >= 2 && (
          <div className="mb-6 grid grid-cols-3 gap-3 items-end max-sm:grid-cols-1">
            {orderPodium(podium).map(({ row, rank }) => (
              <PodiumCard key={row.name} rank={rank} name={row.name} total={row.billed} deals={row.deals} />
            ))}
          </div>
        )}
        <ol className="space-y-2.5">
          {perSalesperson.map((p, i) => {
            const share = (p.billed / maxBilled) * 100;
            return (
              <li key={p.name} className="flex items-center gap-3">
                <span className="tabular-nums font-black text-ink-subtle w-6 text-right shrink-0" style={{ fontSize: 15 }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-bold text-ink-strong" style={{ fontSize: 15 }}>{p.name}</span>
                    <span className="tabular-nums font-bold text-ink-strong shrink-0" style={{ fontSize: 15 }}>{formatInr(p.billed)}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />
                  </div>
                </div>
                <span className="tabular-nums font-semibold text-ink-subtle w-12 text-right shrink-0" style={{ fontSize: 13 }}>{p.deals}d</span>
              </li>
            );
          })}
        </ol>
      </Panel>

      {/* Per-salesperson table */}
      <Panel title="By Salesperson" description="Billed, collected and outstanding per person" tone="slate">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Salesperson</Th>
                <Th align="right">Deals</Th>
                <Th align="right">Billed</Th>
                <Th align="right">Collected</Th>
                <Th align="right">Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {perSalesperson.map((p) => (
                <tr key={p.name} className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                  <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>{p.name}</td>
                  <Td align="right">{p.deals}</Td>
                  <Td align="right" bold>{formatInr(p.billed)}</Td>
                  <Td align="right" style={{ color: "var(--color-green-deep)" }}>{formatInr(p.paid)}</Td>
                  <Td align="right" style={{ color: p.outstanding > 0 ? "var(--color-red-deep)" : "var(--color-ink-subtle)" }}>{formatInr(p.outstanding)}</Td>
                </tr>
              ))}
              <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
                <td className="py-2.5 font-black uppercase tracking-[0.04em] text-ink-strong" style={{ fontSize: 13 }}>Total</td>
                <Td align="right" bold>{totals.deals}</Td>
                <Td align="right" bold>{formatInr(totals.billed)}</Td>
                <Td align="right" bold style={{ color: "var(--color-green-deep)" }}>{formatInr(totals.paid)}</Td>
                <Td align="right" bold style={{ color: "var(--color-red-deep)" }}>{formatInr(totals.outstanding)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Monthly billing */}
      {monthly.length > 0 && (
        <Panel title="Monthly Billing" description="Billing total per month" tone="blue">
          <div className="space-y-2.5">
            {monthly.map((m) => {
              const share = (m.billed / maxMonth) * 100;
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="font-semibold text-ink-subtle w-20 shrink-0" style={{ fontSize: 13 }}>{monthLabel(m.month)}</span>
                  <div className="flex-1 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: "linear-gradient(90deg, var(--color-blue), var(--color-blue-deep))" }} />
                  </div>
                  <span className="tabular-nums font-bold text-ink-strong w-28 text-right shrink-0" style={{ fontSize: 14 }}>{formatInr(m.billed)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Deal ledger */}
      <Panel title="Deals" description="Sales-credited deals, highest billed first" tone="green">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Salesperson</Th>
                <Th>Entity</Th>
                <Th align="right">Billed</Th>
                <Th align="right">Collected</Th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d, i) => (
                <tr key={`${d.client}-${i}`} className="border-t" style={{ borderColor: "var(--color-hairline)" }}>
                  <td className="py-2.5 font-semibold text-ink-strong" style={{ fontSize: 14 }}>{d.client || "—"}</td>
                  <td className="py-2.5 font-semibold text-ink-soft" style={{ fontSize: 14 }}>{d.salesperson}</td>
                  <td className="py-2.5 font-semibold text-ink-subtle" style={{ fontSize: 13 }}>{d.entity || "—"}</td>
                  <Td align="right" bold>{formatInr(d.billed)}</Td>
                  <Td align="right" style={{ color: "var(--color-green-deep)" }}>{formatInr(d.paid)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m)] ?? m} ${y?.slice(2)}`;
}

/* ── podium ── */

function orderPodium(podium: { name: string; billed: number; deals: number }[]) {
  const out: { row: { name: string; billed: number; deals: number }; rank: number }[] = [];
  if (podium[1]) out.push({ row: podium[1], rank: 2 });
  if (podium[0]) out.push({ row: podium[0], rank: 1 });
  if (podium[2]) out.push({ row: podium[2], rank: 3 });
  return out;
}

const PODIUM_TONE: Record<number, string> = { 1: "#D4AF37", 2: "#9CA3AF", 3: "#B45309" };

function PodiumCard({ rank, name, total, deals }: { rank: number; name: string; total: number; deals: number }) {
  const medal = PODIUM_TONE[rank]!;
  const isFirst = rank === 1;
  return (
    <div className="rounded-section border bg-surface-card flex flex-col items-center text-center"
      style={{ borderColor: isFirst ? "var(--color-altus-red)" : "var(--color-hairline-strong)", borderWidth: isFirst ? 2 : 1, padding: isFirst ? "22px 16px" : "16px 14px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <span className="inline-flex items-center justify-center rounded-full font-black text-white" style={{ background: medal, width: isFirst ? 40 : 32, height: isFirst ? 40 : 32, fontSize: isFirst ? 18 : 15 }}>{rank}</span>
      <span className="mt-2.5 font-bold text-ink-strong truncate max-w-full" style={{ fontSize: isFirst ? 17 : 15 }}>{name}</span>
      <span className="mt-1 tabular-nums font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: isFirst ? 22 : 18 }}>{formatInr(total)}</span>
      <span className="mt-1 font-semibold text-ink-subtle" style={{ fontSize: 12 }}>{deals} deal{deals === 1 ? "" : "s"}</span>
      <Trophy size={isFirst ? 18 : 15} strokeWidth={2.2} className="mt-1.5" style={{ color: medal }} aria-hidden />
    </div>
  );
}
