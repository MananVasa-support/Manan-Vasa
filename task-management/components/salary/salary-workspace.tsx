"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  Building2,
  ChevronsUpDown,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  Users,
} from "lucide-react";
import { SalaryBreakupTable, type SalaryRow } from "@/components/salary/salary-breakup-table";

/* Employees-module identity — matches the Attendance + salary pages. */
const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const ALL = "__all";

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

/**
 * Salary workspace — a single COMPANY selector drives BOTH the KPI cards and the
 * breakup table. Pick "Altus Corp" and every headline (headcount, payable, final
 * payment, advances, PT) recomputes for that entity, and the table filters to it.
 * Replaces the old separate per-company card grid with one live, filterable view.
 */
export function SalaryWorkspace({
  rows,
  canMarkPaid = false,
  canEditNote = false,
}: {
  rows: SalaryRow[];
  canMarkPaid?: boolean;
  canEditNote?: boolean;
}) {
  const [company, setCompany] = useState<string>(ALL);

  const companies = useMemo(
    () =>
      [...new Set(rows.map((r) => r.companyName?.trim()).filter((c): c is string => Boolean(c)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [rows],
  );

  // If the selected company vanishes (month change), fall back to All.
  const active = company !== ALL && companies.includes(company) ? company : ALL;

  const shown = useMemo(
    () => (active === ALL ? rows : rows.filter((r) => (r.companyName?.trim() ?? "") === active)),
    [rows, active],
  );

  const sum = (pick: (r: SalaryRow) => string | null) =>
    shown.reduce((s, r) => s + Number(pick(r) ?? 0), 0);
  const totalPayable = sum((r) => r.payableAfterPt);
  const totalFinal = sum((r) => r.finalPayment);
  const totalAdvance = sum((r) => r.advance);
  const totalPt = sum((r) => r.pt);

  const scopeLabel = active === ALL ? "all companies" : active;

  return (
    <>
      {/* ── Header row: title + the COMPANY selector that scopes everything ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 size={15} strokeWidth={2.6} style={{ color: GREEN_DEEP }} />
          <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Payroll totals
          </h2>
          {companies.length > 1 && (
            <span className="text-[12px] font-medium text-ink-subtle">· {scopeLabel}</span>
          )}
        </div>

        {companies.length > 1 && (
          <label className="inline-flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
              Company
            </span>
            <div className="relative">
              <select
                value={active}
                onChange={(e) => setCompany(e.target.value)}
                aria-label="Scope payroll totals + table by company"
                className="appearance-none rounded-lg border border-hairline bg-surface-card py-2 pl-3.5 pr-9 text-[13.5px] font-semibold text-ink-strong transition-colors hover:border-hairline-strong focus-visible:outline-none focus-visible:ring-2"
                style={{ "--tw-ring-color": GREEN } as React.CSSProperties}
              >
                <option value={ALL}>All companies</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronsUpDown
                size={14}
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
            </div>
          </label>
        )}
      </div>

      {/* ── KPI strip — recomputes with the company scope ── */}
      <section
        aria-label="Payroll totals"
        className="mb-5 grid grid-cols-5 gap-3.5 max-xl:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1"
      >
        <KpiCard
          icon={<Users size={17} strokeWidth={2.4} />}
          accent="#334155"
          label="Headcount"
          value={String(shown.length)}
          caption={active === ALL ? "on this month's sheet" : `paid from ${active}`}
        />
        <KpiCard
          icon={<Banknote size={17} strokeWidth={2.4} />}
          accent={GREEN}
          label="Payable after PT"
          value={inr(totalPayable)}
          caption="gross payable this month"
        />
        <KpiCard
          icon={<FileSpreadsheet size={17} strokeWidth={2.4} />}
          accent={GREEN_DEEP}
          label="Final payment"
          value={inr(totalFinal)}
          caption="after advances & dues"
        />
        <KpiCard
          icon={<HandCoins size={17} strokeWidth={2.4} />}
          accent="var(--color-altus-red)"
          label="Advances"
          value={inr(totalAdvance)}
          caption="recovered this month"
        />
        <KpiCard
          icon={<Landmark size={17} strokeWidth={2.4} />}
          accent="var(--color-altus-red)"
          label="Professional tax"
          value={inr(totalPt)}
          caption="statutory deduction"
        />
      </section>

      <SalaryBreakupTable rows={shown} canMarkPaid={canMarkPaid} canEditNote={canEditNote} hideCompanyFilter />
    </>
  );
}

/* ── KPI card — same construction as the Attendance stat cards ── */
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
      className="rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
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
