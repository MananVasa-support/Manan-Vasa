"use client";

import * as React from "react";
import { CalendarCheck, AlarmClock, LogOut, PieChart, Clock, IndianRupee } from "lucide-react";
import type { SelfAttendanceSummary } from "@/lib/queries/attendance-summary";
import type { AttendanceSummary } from "@/lib/attendance/summary";

/**
 * Attendance KPIs as one scannable strip with a period toggle — replaces the
 * three stacked scorecards. Present X/Y, late, early, half-days, avg hrs/day and
 * the ₹ salary reduced (the number that matters). Colour-coded to warn.
 */
const PERIODS: { key: keyof SelfAttendanceSummary; label: string; sub: string }[] = [
  { key: "thisWeek", label: "This Week", sub: "Mon → today" },
  { key: "thisMonth", label: "This Month", sub: "to date" },
  { key: "lastMonth", label: "Last Month", sub: "final" },
];

const GREEN = "#15803d";
const AMBER = "#b45309";
const RED = "#b91c1c";

export function AttendanceKpiStrip({ data }: { data: SelfAttendanceSummary }) {
  const [period, setPeriod] = React.useState<keyof SelfAttendanceSummary>("thisWeek");
  const s: AttendanceSummary = data[period];
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  const kpis = [
    { icon: <CalendarCheck size={16} strokeWidth={2.4} />, label: "Present", value: `${s.presentDays}`, sub: `of ${s.workingDays}`, tone: GREEN },
    { icon: <AlarmClock size={16} strokeWidth={2.4} />, label: "Late", value: `${s.lateDays}`, warn: s.lateDays > 0, tone: AMBER },
    { icon: <LogOut size={16} strokeWidth={2.4} />, label: "Early leave", value: `${s.earlyDays}`, warn: s.earlyDays > 0, tone: AMBER },
    { icon: <PieChart size={16} strokeWidth={2.4} />, label: "Half-days", value: `${s.halfDays}`, warn: s.halfDays > 0, tone: AMBER },
    { icon: <Clock size={16} strokeWidth={2.4} />, label: "Avg hrs/day", value: `${s.avgHoursPerDay}`, tone: "var(--color-ink-strong)" as string },
    { icon: <IndianRupee size={16} strokeWidth={2.4} />, label: "Reduced", value: s.salaryReduced > 0 ? inr(s.salaryReduced) : "₹0", warn: s.salaryReduced > 0, tone: s.salaryReduced > 0 ? RED : GREEN },
  ];

  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-5 max-md:p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 19, letterSpacing: "-0.02em" }}>
            How am I doing
          </h2>
          <p className="text-[12.5px] font-medium text-ink-subtle">Present, late, early &amp; the salary it costs</p>
        </div>
        <div className="inline-flex rounded-chip border border-hairline bg-surface-soft p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className="rounded-[10px] px-3 py-1.5 text-[12px] font-bold transition-colors"
              style={period === p.key ? { background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff" } : { color: "var(--color-ink-muted)" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border p-3.5"
            style={{ borderColor: k.warn ? `color-mix(in srgb, ${k.tone} 30%, transparent)` : "var(--color-hairline)", background: k.warn ? `color-mix(in srgb, ${k.tone} 5%, transparent)` : undefined }}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: k.tone }}>
              {k.icon}
              {k.label}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-[24px] font-black tabular-nums text-ink-strong" style={{ letterSpacing: "-0.02em" }}>{k.value}</span>
              {k.sub && <span className="text-[12px] font-semibold text-ink-subtle">{k.sub}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
