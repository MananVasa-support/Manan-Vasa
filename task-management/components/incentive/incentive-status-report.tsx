"use client";

import * as React from "react";
import {
  Layers,
  Search,
  CircleDollarSign,
  BadgeCheck,
  Wallet,
  Crosshair,
} from "lucide-react";
import { formatInr } from "@/lib/format";
import type {
  IncentiveStatusReport,
  IncentiveStatusRow,
} from "@/lib/queries/incentive-status-report";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

/** The three status bases, in ledger order (client-partial → client-full → we-paid). */
type Basis = "booked" | "accrued" | "paid";

const BASIS_META: Record<
  Basis,
  { label: string; sub: string; accent: string; icon: typeof Wallet }
> = {
  booked: {
    label: "Booked",
    sub: "client paid partial",
    accent: "#0EA5E9",
    icon: CircleDollarSign,
  },
  accrued: {
    label: "Accrued",
    sub: "client paid in full",
    accent: "#7C3AED",
    icon: BadgeCheck,
  },
  paid: {
    label: "Paid",
    sub: "paid to employee",
    accent: GREEN,
    icon: Wallet,
  },
};

/* Attainment threshold colors: green ≥100, amber ≥60, red below — matches Targets tab. */
function attainTone(pct: number | null): { color: string; bg: string } {
  if (pct == null) return { color: "var(--color-ink-subtle)", bg: "var(--color-hairline)" };
  if (pct >= 100) return { color: GREEN_DEEP, bg: GREEN };
  if (pct >= 60) return { color: "#B45309", bg: "#F59E0B" };
  return { color: "var(--color-red-deep)", bg: "var(--color-altus-red)" };
}

function pctLabel(pct: number | null): string {
  return pct == null ? "—" : `${pct.toFixed(0)}%`;
}

type SortKey = "name" | "target" | "booked" | "accrued" | "paid";

export function IncentiveStatusReportView({
  data,
  year,
}: {
  data: IncentiveStatusReport;
  year: number;
}) {
  const { rows, totals } = data;
  const [q, setQ] = React.useState("");
  const [basis, setBasis] = React.useState<Basis>("paid");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "paid",
    dir: "desc",
  });

  const actualFor = React.useCallback(
    (r: IncentiveStatusRow): number => r[basis],
    [basis],
  );
  const pctFor = React.useCallback(
    (r: IncentiveStatusRow): number | null =>
      basis === "booked" ? r.bookedPct : basis === "accrued" ? r.accruedPct : r.paidPct,
    [basis],
  );

  const visible = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? rows.filter((r) => r.empName.toLowerCase().includes(needle))
      : rows.slice();
    base.sort((a, b) => {
      const va = sort.key === "name" ? a.empName.toLowerCase() : a[sort.key];
      const vb = sort.key === "name" ? b.empName.toLowerCase() : b[sort.key];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return base;
  }, [rows, q, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }

  const withTargets = rows.filter((r) => r.target > 0).length;
  const activeMeta = BASIS_META[basis];

  return (
    <div className="space-y-5">
      {/* Summary cards — Target + one card per status basis */}
      <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <SummaryCard
          icon={<Crosshair size={17} strokeWidth={2.4} />}
          accent="#334155"
          label="Total target"
          value={formatInr(totals.target)}
          caption={`${withTargets} ${withTargets === 1 ? "person has" : "people have"} a ${year} target`}
          delay={0}
        />
        <StatusSummaryCard basis="booked" total={totals} delay={50} />
        <StatusSummaryCard basis="accrued" total={totals} delay={100} />
        <StatusSummaryCard basis="paid" total={totals} delay={150} />
      </div>

      <section
        className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-4"
        style={{
          boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
          animationDelay: "200ms",
        }}
      >
        <header className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-grid size-9 place-items-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${GREEN} 10%, transparent)`, color: GREEN_DEEP }}
            >
              <Layers size={18} strokeWidth={2.3} />
            </span>
            <div>
              <h2
                className="text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 21,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                Booked · Accrued · Paid
              </h2>
              <p className="text-[13px] font-medium text-ink-subtle">
                Target compared to each status — attainment on{" "}
                <span className="font-bold" style={{ color: activeMeta.accent }}>
                  {activeMeta.label}
                </span>{" "}
                · {year}
              </p>
            </div>
          </div>
          <label
            className="flex h-10 w-full max-w-[260px] items-center gap-2 rounded-xl bg-surface-card px-3.5"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
          >
            <Search size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search person…"
              aria-label="Search people"
              className="w-full bg-transparent text-[14px] font-semibold text-ink-strong outline-none placeholder:text-ink-subtle"
            />
          </label>
        </header>

        {/* Basis selector — chooses which status the attainment bar/ring reflects */}
        <div
          role="tablist"
          aria-label="Attainment basis"
          className="mb-4 inline-flex flex-wrap items-center gap-1 rounded-xl p-1"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
        >
          {(Object.keys(BASIS_META) as Basis[]).map((b) => {
            const m = BASIS_META[b];
            const isActive = b === basis;
            const Icon = m.icon;
            return (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setBasis(b)}
                className="wg-btn inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors"
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 800 : 600,
                  color: isActive ? "#fff" : "var(--color-ink-soft)",
                  background: isActive
                    ? `linear-gradient(135deg, color-mix(in srgb, ${m.accent} 88%, #000 4%), ${m.accent})`
                    : "transparent",
                  boxShadow: isActive ? "inset 0 1px 0 rgba(255,255,255,0.25)" : "none",
                }}
              >
                <Icon size={14} strokeWidth={2.4} />
                {m.label}
              </button>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No targets or incentives this year yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <SortTh label="Person" k="name" sort={sort} onSort={toggleSort} />
                  <SortTh label="Target" k="target" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Booked" k="booked" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Accrued" k="accrued" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Paid" k="paid" sort={sort} onSort={toggleSort} align="right" />
                  <th
                    className="pb-2 pl-3 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
                    style={{ fontSize: 11, textAlign: "left" }}
                  >
                    {activeMeta.label} attainment
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-[14px] font-semibold text-ink-subtle"
                    >
                      No people match “{q}”.
                    </td>
                  </tr>
                )}
                {visible.map((r) => {
                  const p = pctFor(r);
                  const tone = attainTone(p);
                  const barPct = p == null ? 0 : Math.min(100, p);
                  return (
                    <tr
                      key={r.empName}
                      className="border-t group transition-colors hover:bg-[color-mix(in_srgb,#16a34a_3%,transparent)]"
                      style={{ borderColor: "var(--color-hairline)" }}
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <EmployeeAvatar name={r.empName} size="sm" />
                          <span className="font-bold text-ink-strong" style={{ fontSize: 14 }}>
                            {r.empName}
                          </span>
                        </div>
                      </td>
                      <Td align="right">{r.target > 0 ? formatInr(r.target) : "—"}</Td>
                      <Td align="right" tone={basis === "booked" ? BASIS_META.booked.accent : undefined}>
                        {r.booked > 0 ? formatInr(r.booked) : "—"}
                      </Td>
                      <Td align="right" tone={basis === "accrued" ? BASIS_META.accrued.accent : undefined}>
                        {r.accrued > 0 ? formatInr(r.accrued) : "—"}
                      </Td>
                      <Td align="right" bold tone={basis === "paid" ? BASIS_META.paid.accent : undefined}>
                        {r.paid > 0 ? formatInr(r.paid) : "—"}
                      </Td>
                      <td className="py-2.5 pl-3 min-w-[220px]">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="tabular-nums font-black shrink-0"
                            style={{ fontSize: 12.5, width: 42, color: tone.color, textAlign: "right" }}
                          >
                            {pctLabel(p)}
                          </span>
                          <div
                            className="flex-1 h-2.5 rounded-full overflow-hidden"
                            style={{ background: "var(--color-hairline)" }}
                          >
                            <span
                              className="block h-full rounded-full transition-all"
                              style={{ width: `${Math.max(2, barPct)}%`, background: tone.bg }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <td
                    className="py-3 font-black uppercase tracking-[0.04em] text-ink-strong"
                    style={{ fontSize: 13 }}
                  >
                    Total
                  </td>
                  <Td align="right" bold>
                    {formatInr(totals.target)}
                  </Td>
                  <Td align="right" bold>
                    {formatInr(totals.booked)}
                  </Td>
                  <Td align="right" bold>
                    {formatInr(totals.accrued)}
                  </Td>
                  <Td align="right" bold>
                    {formatInr(totals.paid)}
                  </Td>
                  <td className="py-3 pl-3">
                    <span
                      className="tabular-nums font-black"
                      style={{
                        fontSize: 13,
                        color: attainTone(
                          basis === "booked"
                            ? totals.bookedPct
                            : basis === "accrued"
                              ? totals.accruedPct
                              : totals.paidPct,
                        ).color,
                      }}
                    >
                      {pctLabel(
                        basis === "booked"
                          ? totals.bookedPct
                          : basis === "accrued"
                            ? totals.accruedPct
                            : totals.paidPct,
                      )}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusSummaryCard({
  basis,
  total,
  delay,
}: {
  basis: Basis;
  total: IncentiveStatusReport["totals"];
  delay: number;
}) {
  const m = BASIS_META[basis];
  const value = total[basis];
  const pct =
    basis === "booked" ? total.bookedPct : basis === "accrued" ? total.accruedPct : total.paidPct;
  const Icon = m.icon;
  return (
    <SummaryCard
      icon={<Icon size={17} strokeWidth={2.4} />}
      accent={m.accent}
      label={m.label}
      value={formatInr(value)}
      caption={
        pct == null
          ? m.sub
          : `${pctLabel(pct)} of target · ${m.sub}`
      }
      progress={pct != null ? Math.min(pct / 100, 1) : null}
      delay={delay}
    />
  );
}

function SummaryCard({
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

type Sort = { key: SortKey; dir: "asc" | "desc" };

function SortTh({
  label,
  k,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  return (
    <th
      className="pb-2 whitespace-nowrap"
      style={{ textAlign: align }}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${
          active ? "text-ink-strong" : "text-ink-subtle hover:text-ink-soft"
        }`}
      >
        {label}
        {active && <span style={{ color: GREEN_DEEP }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function Td({
  children,
  align = "left",
  bold = false,
  tone,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
  tone?: string;
}) {
  return (
    <td
      className={`py-2.5 tabular-nums whitespace-nowrap ${bold ? "font-black" : "font-semibold"}`}
      style={{
        fontSize: 14,
        textAlign: align,
        color: tone ?? (bold ? "var(--color-ink-strong)" : "var(--color-ink-soft)"),
      }}
    >
      {children}
    </td>
  );
}
