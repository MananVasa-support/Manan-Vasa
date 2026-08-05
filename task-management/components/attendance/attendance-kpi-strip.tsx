"use client";

import * as React from "react";
import { IndianRupee, AlarmClock, LogOut, PieChart, Clock, CalendarCheck } from "lucide-react";
import type { SelfAttendanceSummary } from "@/lib/queries/attendance-summary";
import type { AttendanceSummary } from "@/lib/attendance/summary";
import { WEEK_TARGET_MINUTES } from "@/lib/attendance/summary";
import { CardGrid } from "@/components/layout/card-grid";

/**
 * Attendance KPIs as one full-width scannable bar with a period toggle. Six
 * boxes: salary lost, late check-ins, early check-outs, half-days, total hours
 * vs the target (54h/week), and effective days worked. Colour-coded to warn.
 */
const PERIODS: { key: keyof SelfAttendanceSummary; label: string }[] = [
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "last3Months", label: "Last 3 Months" },
];

const WEEK_TARGET_HOURS = WEEK_TARGET_MINUTES / 60; // 54h/week
const PER_DAY_HOURS = 9; // a full day = 9h (54h ÷ 6 working days)

const GREEN = "#15803d";
const AMBER = "#b45309";
const RED = "#b91c1c";

interface Kpi {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone: string;
  warn?: boolean;
}

export function AttendanceKpiStrip({ data }: { data: SelfAttendanceSummary }) {
  const [period, setPeriod] = React.useState<keyof SelfAttendanceSummary>("thisWeek");
  const s: AttendanceSummary = data[period];
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  // Hours target: the fixed 54h goal for the week; 9h × working-days otherwise.
  const target =
    period === "thisWeek" ? WEEK_TARGET_HOURS : Math.max(0, Math.round(PER_DAY_HOURS * s.workingDays));
  const remaining = Math.max(0, Math.round((target - s.workedHours) * 10) / 10);
  const hoursTone = s.workedHours >= target ? GREEN : remaining > target * 0.5 ? RED : AMBER;

  const kpis: Kpi[] = [
    {
      icon: <IndianRupee size={16} strokeWidth={2.4} />,
      label: "Salary lost",
      value: s.salaryReduced > 0 ? inr(s.salaryReduced) : "₹0",
      warn: s.salaryReduced > 0,
      tone: s.salaryReduced > 0 ? RED : GREEN,
    },
    {
      icon: <AlarmClock size={16} strokeWidth={2.4} />,
      label: "Late check in",
      value: `${s.lateDays}`,
      warn: s.lateDays > 0,
      tone: AMBER,
    },
    {
      icon: <LogOut size={16} strokeWidth={2.4} />,
      label: "Early check out",
      value: `${s.earlyDays}`,
      warn: s.earlyDays > 0,
      tone: AMBER,
    },
    {
      icon: <PieChart size={16} strokeWidth={2.4} />,
      label: "Half days",
      value: `${s.halfDays}`,
      warn: s.halfDays > 0,
      tone: AMBER,
    },
    {
      icon: <Clock size={16} strokeWidth={2.4} />,
      label: "Total hours",
      value: `${s.workedHours}`,
      sub: `/ ${target}h`,
      hint: remaining > 0 ? `${remaining}h to go` : "Target met 🎉",
      tone: hoursTone,
    },
    {
      icon: <CalendarCheck size={16} strokeWidth={2.4} />,
      label: "Effective days worked",
      value: `${s.presentDays}`,
      sub: `of ${s.workingDays}`,
      tone: GREEN,
    },
  ];

  return (
    <section
      className="wg-rise w-full rounded-[20px] bg-surface-card p-3.5 max-md:p-3"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}
        >
          How am I doing
        </h2>
        <div className="inline-flex rounded-chip border border-hairline bg-surface-soft p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className="rounded-[9px] px-2.5 py-1 text-[11.5px] font-bold transition-colors"
              style={period === p.key ? { background: "linear-gradient(135deg,#E10600,#A80400)", color: "#fff" } : { color: "var(--color-ink-muted)" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Width-adaptive: all SIX across on a real screen, reflowing smoothly to
          5 → 4 → 3 → 2 as the effective width drops (zoom / OS scaling / snapped
          window) — no hard breakpoint jump that crams six into a tight column. */}
      <CardGrid min={150} gap="0.5rem">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="min-w-0 rounded-xl border p-2.5"
            style={{
              borderColor: k.warn ? `color-mix(in srgb, ${k.tone} 30%, transparent)` : "var(--color-hairline)",
              background: k.warn ? `color-mix(in srgb, ${k.tone} 5%, transparent)` : undefined,
            }}
          >
            <div className="flex items-start gap-1 text-[9.5px] font-bold uppercase leading-tight tracking-wide" style={{ color: k.tone }}>
              <span className="mt-px shrink-0">{k.icon}</span>
              <span className="min-w-0">{k.label}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-[19px] font-black tabular-nums text-ink-strong" style={{ letterSpacing: "-0.02em" }}>
                {k.value}
              </span>
              {k.sub && <span className="text-[11.5px] font-semibold text-ink-subtle">{k.sub}</span>}
            </div>
            {k.hint && (
              <div className="mt-1 text-[10px] font-bold leading-tight" style={{ color: k.tone }}>
                {k.hint}
              </div>
            )}
          </div>
        ))}
      </CardGrid>
    </section>
  );
}
