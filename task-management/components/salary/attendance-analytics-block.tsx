import { HandCoins, Clock, Sunrise, LogOut, ScrollText } from "lucide-react";
import {
  headlineRatios,
  type AttendanceAnalytics,
  type AdjustmentRemark,
} from "@/lib/queries/salary-attendance-analytics";
import {
  fmtPct,
  fmtRatio,
  type AttendanceMetrics,
  type Ratio,
} from "@/lib/salary/attendance-metrics";

// WS-5 Salary — presentational attendance-analytics block (server component,
// no client state). Renders the discipline matrix (X/N + %) across
// this-month · last-3-months · fiscal-YTD, plus accountant ex-gratia / deduction
// remarks. On-brand Altus tokens only.

const GREEN = "var(--color-green-deep)";
const RED = "var(--color-altus-red)";

/* A metric row: label + which direction is "good" (drives the accent). */
interface Metric {
  key: keyof ReturnType<typeof headlineRatios>;
  label: string;
  icon: React.ReactNode;
  /** true → higher % is GOOD (green); false → higher % is a concern (red). */
  goodHigh: boolean;
}

const METRICS: Metric[] = [
  { key: "late", label: "Days late", icon: <Clock size={15} strokeWidth={2.4} />, goodHigh: false },
  { key: "lateWaived", label: "Late waived", icon: <Clock size={15} strokeWidth={2.4} />, goodHigh: true },
  { key: "startedEarly", label: "Started on-time / early", icon: <Sunrise size={15} strokeWidth={2.4} />, goodHigh: true },
  { key: "leftEarly", label: "Left early", icon: <LogOut size={15} strokeWidth={2.4} />, goodHigh: false },
];

export function AttendanceAnalyticsBlock({ data }: { data: AttendanceAnalytics }) {
  const cols: { label: string; sub: string; m: AttendanceMetrics }[] = [
    { label: "This month", sub: "selected", m: data.thisMonth },
    { label: "Last 3 months", sub: "rolling", m: data.last3Months },
    { label: "Year to date", sub: data.fyLabel, m: data.ytd },
  ];

  return (
    <section
      aria-label="Attendance analytics"
      className="wg-rise admin-panel overflow-hidden px-0 py-0"
      style={{ animationDelay: "80ms" }}
    >
      {/* Header */}
      <div className="flex items-end justify-between gap-4 px-6 pt-5 pb-4 max-md:px-4">
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white"
            style={{ background: `linear-gradient(135deg, var(--color-green), ${GREEN})` }}
          >
            <Clock size={12} strokeWidth={2.6} /> Attendance discipline
          </span>
          <h2
            className="mt-2.5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(20px, 2vw, 27px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
            }}
          >
            {data.employeeName}
          </h2>
          <p
            className="mt-1 text-ink-subtle"
            style={{
              fontFamily: "var(--font-serif), system-ui, sans-serif",
              fontStyle: "italic",
              fontSize: 14.5,
            }}
          >
            where discipline matters.
          </p>
        </div>
      </div>

      {/* Discipline matrix */}
      <div className="overflow-x-auto px-6 pb-5 max-md:px-4">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr>
              <th className="w-[38%] pb-2 pr-3 text-left align-bottom">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
                  Metric
                </span>
              </th>
              {cols.map((c) => (
                <th key={c.label} className="pb-2 px-2 text-right align-bottom">
                  <div className="text-[12.5px] font-bold text-ink-strong">{c.label}</div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                    {c.sub}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => (
              <tr
                key={metric.key}
                className="border-t"
                style={{ borderColor: "var(--color-hairline)" }}
              >
                <td className="py-3 pr-3">
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-soft">
                    <span className="text-ink-subtle">{metric.icon}</span>
                    {metric.label}
                  </span>
                </td>
                {cols.map((c) => {
                  const r = headlineRatios(c.m)[metric.key];
                  return (
                    <td key={c.label} className="py-3 px-2 text-right">
                      <RatioCell r={r} goodHigh={metric.goodHigh} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Accountant remarks */}
      <div
        className="grid grid-cols-2 gap-px max-sm:grid-cols-1"
        style={{ background: "var(--color-hairline)", borderTop: "1px solid var(--color-hairline)" }}
      >
        <RemarkColumn
          title="Ex-gratia remarks"
          icon={<HandCoins size={14} strokeWidth={2.4} />}
          accent={GREEN}
          remarks={data.exGratiaRemarks}
          emptyText="No ex-gratia added this month."
        />
        <RemarkColumn
          title="Deduction remarks"
          icon={<ScrollText size={14} strokeWidth={2.4} />}
          accent={RED}
          remarks={data.deductionRemarks}
          emptyText="No disciplinary deductions this month."
        />
      </div>
    </section>
  );
}

/* One "X/N" + "%" cell, tinted by whether the % is good or a concern. */
function RatioCell({ r, goodHigh }: { r: Ratio; goodHigh: boolean }) {
  const active = r.n > 0 && r.x > 0;
  const accent = !active ? "var(--color-ink-subtle)" : goodHigh ? GREEN : RED;
  return (
    <div className="inline-flex flex-col items-end">
      <span
        className="tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 16,
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {fmtRatio(r)}
      </span>
      <span
        className="mt-0.5 rounded-pill px-1.5 py-[1px] text-[11px] font-bold tabular-nums"
        style={{
          color: accent,
          background: active
            ? `color-mix(in srgb, ${accent} 12%, transparent)`
            : "transparent",
        }}
      >
        {fmtPct(r)}
      </span>
    </div>
  );
}

function RemarkColumn({
  title,
  icon,
  accent,
  remarks,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  remarks: AdjustmentRemark[];
  emptyText: string;
}) {
  return (
    <div className="bg-surface-card px-6 py-4 max-md:px-4">
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-6 place-items-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {title}
        </span>
      </div>
      {remarks.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-subtle">{emptyText}</p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-2">
          {remarks.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className="mt-[2px] shrink-0 rounded-pill px-2 py-[1px] text-[11px] font-bold tabular-nums text-white"
                style={{ background: accent }}
              >
                {r.kind === "ex_gratia" ? "+" : "−"}
                {formatDays(r.days)}d
              </span>
              <span className="text-[13px] leading-snug text-ink-soft">{r.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
