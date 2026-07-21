"use client";

import * as React from "react";
import { Wallet, CheckCircle2, Clock, CalendarDays, TrendingDown, Receipt, PiggyBank, ChevronRight } from "lucide-react";

export interface MySalaryMonth {
  month: string; // 'YYYY-MM'
  label: string; // 'July 2026'
  designation: string | null;
  companyName: string | null;
  monthlyCtc: number;
  payableAfterLeave: number;
  pt: number;
  advance: number;
  previousPending: number;
  finalPayment: number;
  salaryGiven: number | null;
  present: number;
  absent: number;
  halfDay: number;
  finalWorkingDays: number;
  daysInMonth: number;
  paid: boolean;
  remarks: string | null;
}

function inr(n: number): string {
  const whole = Number.isInteger(n);
  return (
    "₹" +
    n.toLocaleString("en-IN", whole ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

/**
 * My Salary — the employee's OWN self-service pay view. Read-only: hero net-pay
 * card for the selected month, an itemised earnings→deductions breakdown, an
 * attendance summary, and a month switcher over their history. Premium Altus
 * (brand red) styling; no other person's data is ever loaded.
 */
export function MySalaryView({ months }: { months: MySalaryMonth[] }) {
  const [sel, setSel] = React.useState(0);
  const m = months[sel];

  if (!m) {
    return (
      <div className="rounded-3xl border border-dashed border-hairline-strong bg-surface-card p-12 text-center">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: RED }}>
          <Wallet size={22} strokeWidth={2.2} />
        </span>
        <p className="text-[15px] font-semibold text-ink-muted">No salary records yet.</p>
        <p className="mt-1 text-[13px] text-ink-subtle">Your monthly salary will appear here once it's processed.</p>
      </div>
    );
  }

  const paidAmount = m.salaryGiven ?? m.finalPayment;
  const deductions = m.pt + m.advance;

  return (
    <div className="space-y-6">
      {/* Month switcher */}
      {months.length > 1 && (
        <div className="flex flex-wrap gap-1.5 rounded-full border border-hairline bg-surface-card p-1" style={{ width: "fit-content" }}>
          {months.map((mo, i) => {
            const active = i === sel;
            return (
              <button
                key={mo.month}
                type="button"
                onClick={() => setSel(i)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-all ${active ? "text-white" : "text-ink-soft hover:text-ink-strong"}`}
                style={active ? { background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 6px 16px -8px rgba(225,6,0,0.5)" } : undefined}
              >
                {mo.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Hero — net pay */}
      <div
        className="wg-rise relative isolate overflow-hidden rounded-3xl border border-hairline p-6 max-md:p-5"
        style={{
          background: "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card)), var(--color-surface-card) 72%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 14px 40px -26px rgba(225,6,0,0.45)",
        }}
      >
        <span aria-hidden className="kpi-aurora-primary" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: RED_DEEP }}>
              <Wallet size={14} strokeWidth={2.6} /> Net pay · {m.label}
            </div>
            <div className="mt-2 tabular-nums leading-none text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(40px, 6vw, 60px)" }}>
              {inr(m.finalPayment)}
            </div>
            {m.designation && (
              <p className="mt-2 text-[13.5px] font-semibold text-ink-muted">
                {m.designation}
                {m.companyName ? ` · ${m.companyName}` : ""}
              </p>
            )}
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-black"
            style={
              m.paid
                ? { background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }
                : { background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: RED_DEEP }
            }
          >
            {m.paid ? <CheckCircle2 size={15} strokeWidth={2.6} /> : <Clock size={15} strokeWidth={2.6} />}
            {m.paid ? `Paid · ${inr(paidAmount)}` : "Payment pending"}
          </span>
        </div>
      </div>

      {/* Breakdown + attendance */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Earnings → deductions */}
        <div className="wg-rise rounded-3xl border border-hairline bg-surface-card p-5" style={{ animationDelay: "60ms", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 26px -20px rgba(15,23,42,0.3)" }}>
          <h2 className="mb-4 flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.07em] text-ink-muted">
            <Receipt size={15} className="text-altus-red" /> How it's calculated
          </h2>
          <div className="space-y-0.5">
            <Line label="Monthly CTC" value={inr(m.monthlyCtc)} />
            <Line label="Payable (after leave/attendance)" value={inr(m.payableAfterLeave)} muted />
            {m.pt > 0 && <Line label="Professional tax (PT)" value={`− ${inr(m.pt)}`} deduct Icon={TrendingDown} />}
            {m.advance > 0 && <Line label="Advance adjusted" value={`− ${inr(m.advance)}`} deduct Icon={TrendingDown} />}
            {m.previousPending !== 0 && (
              <Line label="Previous pending" value={`${m.previousPending > 0 ? "+ " : "− "}${inr(Math.abs(m.previousPending))}`} Icon={PiggyBank} />
            )}
            <div className="my-2 border-t border-dashed border-hairline-strong" />
            <div className="flex items-center justify-between rounded-xl px-3 py-3" style={{ background: "color-mix(in srgb, var(--color-altus-red) 6%, transparent)" }}>
              <span className="text-[14px] font-black text-ink-strong">Final payment</span>
              <span className="text-[18px] font-black tabular-nums" style={{ color: RED_DEEP }}>{inr(m.finalPayment)}</span>
            </div>
          </div>
          {deductions > 0 && (
            <p className="mt-3 text-[12px] text-ink-subtle">Total deductions this month: <span className="font-bold text-ink-soft">{inr(deductions)}</span>.</p>
          )}
        </div>

        {/* Attendance summary */}
        <div className="wg-rise rounded-3xl border border-hairline bg-surface-card p-5" style={{ animationDelay: "100ms", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 26px -20px rgba(15,23,42,0.3)" }}>
          <h2 className="mb-4 flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.07em] text-ink-muted">
            <CalendarDays size={15} className="text-altus-red" /> Attendance
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Present" value={m.present} tone="var(--color-green-deep)" />
            <Stat label="Half days" value={m.halfDay} tone="#b45309" />
            <Stat label="Absent" value={m.absent} tone="var(--color-altus-red)" />
            <Stat label="Working days" value={m.finalWorkingDays} tone="var(--color-ink-strong)" />
          </div>
          <p className="mt-4 text-[12px] text-ink-subtle">
            Out of <span className="font-bold text-ink-soft">{m.daysInMonth}</span> days in {m.label}.
          </p>
        </div>
      </div>

      {m.remarks && (
        <div className="rounded-2xl border border-hairline bg-surface-card p-4 text-[13.5px] text-ink-soft" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
          <span className="font-bold text-ink-strong">Note: </span>
          {m.remarks}
        </div>
      )}

      {/* History quick list */}
      {months.length > 1 && (
        <div className="rounded-3xl border border-hairline bg-surface-card p-2" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 26px -20px rgba(15,23,42,0.3)" }}>
          <p className="px-3 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">History</p>
          {months.map((mo, i) => (
            <button
              key={mo.month}
              type="button"
              onClick={() => setSel(i)}
              className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition-colors ${i === sel ? "bg-[color-mix(in_srgb,var(--color-altus-red)_6%,transparent)]" : "hover:bg-black/[0.03]"}`}
            >
              <span className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg" style={{ background: mo.paid ? "color-mix(in srgb, var(--color-green) 12%, transparent)" : "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: mo.paid ? "var(--color-green-deep)" : RED_DEEP }}>
                  {mo.paid ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                </span>
                <span className="text-[14px] font-bold text-ink-strong">{mo.label}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-black tabular-nums text-ink-strong">{inr(mo.finalPayment)}</span>
                <ChevronRight size={16} className="text-ink-subtle" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  muted,
  deduct,
  Icon,
}: {
  label: string;
  value: string;
  muted?: boolean;
  deduct?: boolean;
  Icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className={`inline-flex items-center gap-1.5 text-[13.5px] ${muted ? "text-ink-muted" : "text-ink-soft"} font-semibold`}>
        {Icon && <Icon size={13} className={deduct ? "text-altus-red" : "text-ink-subtle"} />}
        {label}
      </span>
      <span className={`text-[14px] font-bold tabular-nums ${deduct ? "text-altus-red" : "text-ink-strong"}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-hairline p-3" style={{ background: "color-mix(in srgb, var(--color-surface-soft) 60%, var(--color-surface-card))" }}>
      <p className="text-[10.5px] font-black uppercase tracking-[0.07em] text-ink-muted">{label}</p>
      <p className="mt-1 text-[24px] font-black leading-none tabular-nums" style={{ color: tone, fontFamily: "var(--font-display), system-ui, sans-serif" }}>
        {value % 1 === 0 ? value : value.toFixed(1)}
      </p>
    </div>
  );
}
