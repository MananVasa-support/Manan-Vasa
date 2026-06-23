"use client";

import * as React from "react";
import { Search, ArrowUp, ArrowDown, Info, X } from "lucide-react";
import type { DashboardRow, MonthSummary } from "@/lib/queries/attendance-status";
import { EmployeeDetailDialog } from "./employee-detail";

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

/** Cell-meaning palette. Each metric maps to a brand status token; zero values
 *  are rendered muted/de-emphasised so a grid full of "0"s stays readable. */
type Tone = "green" | "red" | "amber" | "blue" | "slate" | "teal" | "indigo" | "neutral";

const TONE: Record<Exclude<Tone, "neutral">, { fg: string; bg: string }> = {
  green: { fg: "var(--color-green-deep)", bg: "var(--color-green-bg)" },
  red: { fg: "var(--color-red-deep)", bg: "var(--color-red-bg)" },
  amber: { fg: "var(--color-amber-deep)", bg: "var(--color-amber-bg)" },
  blue: { fg: "var(--color-blue-deep)", bg: "var(--color-blue-bg)" },
  slate: { fg: "var(--color-slate-deep)", bg: "var(--color-slate-bg)" },
  teal: { fg: "var(--color-teal-deep)", bg: "var(--color-teal-bg)" },
  indigo: { fg: "var(--color-indigo-deep)", bg: "var(--color-indigo-bg)" },
};

/** A sortable metric column. `tone` drives the cell colouring; `chip` renders a
 *  tinted pill for meaningful (non-zero) counts. */
type SummaryKey = keyof MonthSummary;
interface Col {
  key: SummaryKey;
  label: string;
  short?: string;
  hint?: string;
  tone: Tone;
  chip?: boolean;
}

const COLS: Col[] = [
  { key: "present", label: "Present", tone: "green", chip: true },
  { key: "absent", label: "Absent", tone: "red", chip: true },
  { key: "halfDay", label: "Half-Day", short: "H/D", tone: "amber", chip: true },
  { key: "late", label: "Late", tone: "amber", chip: true },
  { key: "leftEarly", label: "Left-Early", tone: "amber" },
  { key: "lateWaived", label: "Late-Waived", short: "L·W", hint: "Late arrival waived by a full day worked", tone: "slate" },
  { key: "weeklyOff", label: "Weekly-Off", short: "W/O", hint: "Scheduled weekly day off", tone: "neutral" },
  { key: "holiday", label: "Holiday", tone: "indigo" },
  { key: "holidayPresent", label: "Holiday-Present", short: "HP", hint: "Worked on a holiday / weekly-off (extra pay)", tone: "green" },
  { key: "paidLeave", label: "Paid Leave", short: "PL", tone: "blue" },
  { key: "unpaidLeave", label: "Unpaid Leave", short: "LWP", hint: "Leave without pay", tone: "slate" },
  { key: "compOff", label: "Comp-Off", short: "CO", hint: "Redeemed comp-off day", tone: "teal" },
];

/** Legend entries — explain every cryptic code. */
const LEGEND: { label: string; tone: Tone; desc: string }[] = [
  { label: "Present", tone: "green", desc: "Full day worked" },
  { label: "Absent", tone: "red", desc: "No attendance recorded" },
  { label: "Half-Day", tone: "amber", desc: "Partial day worked" },
  { label: "Late / Left-Early", tone: "amber", desc: "Arrived late or left before close" },
  { label: "Late-Waived (L·W)", tone: "slate", desc: "Late, but waived by a full day worked" },
  { label: "Weekly-Off (W/O)", tone: "neutral", desc: "Scheduled weekly day off" },
  { label: "Holiday", tone: "indigo", desc: "Company holiday" },
  { label: "Holiday-Present (HP)", tone: "green", desc: "Worked a holiday / weekly-off → extra pay" },
  { label: "Paid Leave (PL)", tone: "blue", desc: "Approved leave, paid" },
  { label: "Unpaid Leave (LWP)", tone: "slate", desc: "Leave without pay" },
  { label: "Comp-Off (CO)", tone: "teal", desc: "Redeemed compensatory day off" },
];

type SortDir = "asc" | "desc";

/** Per-person attendance rate: present + half-day (½) + HP + paid leave, over
 *  the gradeable working days (present+absent+half+HP+leaves). Pure read of the
 *  already-loaded summary — no new query, no invented threshold. */
function attendanceRate(s: MonthSummary): number | null {
  const credited = s.present + s.halfDay * 0.5 + s.holidayPresent + s.paidLeave + s.compOff;
  const base =
    s.present + s.absent + s.halfDay + s.holidayPresent + s.paidLeave + s.unpaidLeave + s.compOff;
  if (base <= 0) return null;
  return Math.round((credited / base) * 100);
}

export function AttendanceDashboardTable({
  rows,
  year,
  month,
}: {
  rows: DashboardRow[];
  year: number;
  month: number;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<{ id: string; name: string } | null>(null);
  const [sortKey, setSortKey] = React.useState<SummaryKey | "name" | "rate" | "payableDays">("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [legendOpen, setLegendOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      if (sortKey === "rate") {
        const ra = attendanceRate(a.summary) ?? -1;
        const rb = attendanceRate(b.summary) ?? -1;
        return dir * (ra - rb);
      }
      const va = a.summary[sortKey as SummaryKey];
      const vb = b.summary[sortKey as SummaryKey];
      return dir * (va - vb);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // ── KPI strip — computed from the already-loaded rows (no new queries). ──
  const kpis = React.useMemo(() => {
    let present = 0,
      absent = 0,
      onLeave = 0,
      creditedSum = 0,
      baseSum = 0;
    for (const r of filtered) {
      const s = r.summary;
      present += s.present;
      absent += s.absent;
      onLeave += s.paidLeave + s.unpaidLeave;
      creditedSum += s.present + s.halfDay * 0.5 + s.holidayPresent + s.paidLeave + s.compOff;
      baseSum +=
        s.present + s.absent + s.halfDay + s.holidayPresent + s.paidLeave + s.unpaidLeave + s.compOff;
    }
    const rate = baseSum > 0 ? Math.round((creditedSum / baseSum) * 100) : null;
    return { people: filtered.length, present, absent, onLeave, rate };
  }, [filtered]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numbers default to descending (most-first); name defaults ascending.
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <section className="wg-rise space-y-5">
      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="People" value={kpis.people} />
        <Kpi label="Present days" value={kpis.present} tone="green" />
        <Kpi label="Absences" value={kpis.absent} tone={kpis.absent > 0 ? "red" : "neutral"} />
        <Kpi label="On leave" value={kpis.onLeave} tone={kpis.onLeave > 0 ? "blue" : "neutral"} />
        <Kpi
          label="Attendance %"
          value={kpis.rate == null ? "—" : `${kpis.rate}%`}
          tone={kpis.rate == null ? "neutral" : kpis.rate >= 90 ? "green" : kpis.rate >= 75 ? "amber" : "red"}
        />
      </div>

      <section
        className="rounded-section bg-surface-card border border-hairline p-7 max-md:p-4"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              strokeWidth={2.2}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by employee…"
              aria-label="Search employees"
              className={`w-full h-11 pl-10 pr-9 rounded-pill border border-hairline bg-surface-card text-[15px] text-ink-strong placeholder:text-ink-subtle transition-all focus:border-altus-red focus:ring-2 focus:ring-altus-red/25 ${FOCUS_RING}`}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">
              {sorted.length} {sorted.length === 1 ? "person" : "people"}
            </span>
            <button
              type="button"
              onClick={() => setLegendOpen((o) => !o)}
              aria-expanded={legendOpen}
              className={`inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card py-2 px-3 text-[13px] font-semibold text-ink-soft hover:text-ink-strong hover:border-hairline-strong transition-colors ${FOCUS_RING}`}
            >
              <Info size={14} strokeWidth={2.2} />
              Legend
            </button>
          </div>
        </div>

        {legendOpen && <Legend onClose={() => setLegendOpen(false)} />}

        {sorted.length === 0 ? (
          <p className="py-8 text-center font-semibold text-ink-subtle" style={{ fontSize: 14 }}>
            {rows.length === 0
              ? "No active employees for this month."
              : "No employees match your search."}
          </p>
        ) : (
          // SINGLE scroll container: both the header row (sticky top) and the
          // first column (sticky left) pin within THIS one overflow box. No
          // nested overflow ancestor between the sticky cells and this box.
          <div
            className="overflow-auto rounded-md border border-hairline"
            style={{ maxHeight: "70vh" }}
          >
            <table className="border-collapse" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <HeadCell
                    corner
                    sortable
                    active={sortKey === "name"}
                    dir={sortDir}
                    onSort={() => toggleSort("name")}
                    align="left"
                  >
                    Employee
                  </HeadCell>
                  <HeadCell
                    sortable
                    active={sortKey === "rate"}
                    dir={sortDir}
                    onSort={() => toggleSort("rate")}
                    align="left"
                    hint="Present + ½ half-days + HP + paid leave, over gradeable working days"
                  >
                    Rate
                  </HeadCell>
                  {COLS.map((c) => (
                    <HeadCell
                      key={c.key}
                      sortable
                      active={sortKey === c.key}
                      dir={sortDir}
                      onSort={() => toggleSort(c.key)}
                      hint={c.hint}
                      short={c.short}
                    >
                      {c.label}
                    </HeadCell>
                  ))}
                  <HeadCell
                    sortable
                    active={sortKey === "payableDays"}
                    dir={sortDir}
                    onSort={() => toggleSort("payableDays")}
                    hint="Total payable day-count for the month"
                  >
                    Payable
                  </HeadCell>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const s = r.summary;
                  const rate = attendanceRate(s);
                  const zebra = i % 2 === 1;
                  return (
                    <tr
                      key={r.employeeId}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected({ id: r.employeeId, name: r.name })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected({ id: r.employeeId, name: r.name });
                        }
                      }}
                      className={`group cursor-pointer transition-colors ${FOCUS_RING}`}
                    >
                      {/* Frozen employee column. */}
                      <td
                        className="sticky left-0 z-10 px-4 py-3 border-b border-hairline"
                        style={{
                          background: rowBg(zebra),
                          maxWidth: 220,
                        }}
                      >
                        <div className="font-semibold text-ink-strong text-[14px] truncate" title={r.name}>
                          {r.name}
                        </div>
                      </td>
                      {/* Attendance rate mini-bar. */}
                      <td
                        className="px-4 py-3 border-b border-hairline align-middle"
                        style={{ background: zebra ? "rgba(15,23,42,0.012)" : undefined, minWidth: 120 }}
                      >
                        <RateBar rate={rate} />
                      </td>
                      {COLS.map((c) => (
                        <MetricCell key={c.key} value={s[c.key]} tone={c.tone} chip={c.chip} zebra={zebra} />
                      ))}
                      <td
                        className="px-3 py-3 text-right font-black text-ink-strong tabular-nums whitespace-nowrap border-b border-hairline"
                        style={{ fontSize: 14, background: zebra ? "rgba(15,23,42,0.012)" : undefined }}
                      >
                        {s.payableDays}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EmployeeDetailDialog
        open={selected !== null}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
        employeeId={selected?.id ?? null}
        employeeName={selected?.name ?? ""}
        year={year}
        month={month}
      />
    </section>
  );
}

/** Row background — opaque so the sticky first column hides scrolled-under cells. */
function rowBg(zebra: boolean): string {
  return zebra ? "#fbfcfd" : "var(--color-surface-card)";
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}) {
  const fg = tone === "neutral" ? "var(--color-ink-strong)" : TONE[tone].fg;
  return (
    <div
      className="rounded-section bg-surface-card border border-hairline px-4 py-3.5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-subtle">{label}</div>
      <div className="mt-1 text-[26px] leading-none font-black tabular-nums" style={{ color: fg }}>
        {value}
      </div>
    </div>
  );
}

function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div className="mb-5 rounded-lg border border-hairline bg-surface-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-subtle">
          What the columns mean
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide legend"
          className={`size-7 inline-flex items-center justify-center rounded-full text-ink-subtle hover:text-ink-strong hover:bg-surface-track transition-colors ${FOCUS_RING}`}
        >
          <X size={15} strokeWidth={2.2} />
        </button>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
        {LEGEND.map((l) => {
          const sw = l.tone === "neutral" ? "var(--color-ink-subtle)" : TONE[l.tone].fg;
          return (
            <li key={l.label} className="flex items-start gap-2">
              <span
                className="mt-1 size-2.5 rounded-full shrink-0"
                style={{ background: sw }}
                aria-hidden
              />
              <span className="text-[13px] leading-snug">
                <span className="font-bold text-ink-strong">{l.label}</span>
                <span className="text-ink-muted"> — {l.desc}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RateBar({ rate }: { rate: number | null }) {
  if (rate == null) {
    return <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">—</span>;
  }
  const tone: Tone = rate >= 90 ? "green" : rate >= 75 ? "amber" : "red";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 rounded-full overflow-hidden"
        style={{ background: "var(--color-surface-track)", minWidth: 44 }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${rate}%`, background: TONE[tone].fg }}
        />
      </div>
      <span className="text-[13px] font-bold tabular-nums" style={{ color: TONE[tone].fg, minWidth: 34, textAlign: "right" }}>
        {rate}%
      </span>
    </div>
  );
}

/** A metric cell: zeros are de-emphasised (muted, no chip); meaningful counts
 *  are coloured by meaning, optionally as a tinted chip. */
function MetricCell({
  value,
  tone,
  chip,
  zebra,
}: {
  value: number;
  tone: Tone;
  chip?: boolean;
  zebra: boolean;
}) {
  const isZero = value === 0;
  const cellBg = zebra ? "rgba(15,23,42,0.012)" : undefined;
  let inner: React.ReactNode;
  if (isZero) {
    inner = <span className="text-ink-subtle/55 tabular-nums">0</span>;
  } else if (chip && tone !== "neutral") {
    inner = (
      <span
        className="inline-flex items-center justify-center rounded-full px-2 py-0.5 font-bold tabular-nums"
        style={{ fontSize: 12.5, background: TONE[tone].bg, color: TONE[tone].fg, minWidth: 26 }}
      >
        {value}
      </span>
    );
  } else {
    const fg = tone === "neutral" ? "var(--color-ink-soft)" : TONE[tone].fg;
    inner = (
      <span className="font-bold tabular-nums" style={{ color: fg }}>
        {value}
      </span>
    );
  }
  return (
    <td
      className="px-3 py-3 text-right whitespace-nowrap border-b border-hairline"
      style={{ fontSize: 14, background: cellBg }}
    >
      {inner}
    </td>
  );
}

function HeadCell({
  children,
  align = "right",
  corner = false,
  short,
  hint,
  sortable,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  corner?: boolean;
  short?: string;
  hint?: string;
  sortable?: boolean;
  active?: boolean;
  dir?: SortDir;
  onSort?: () => void;
}) {
  const base =
    "px-3 py-3 uppercase font-bold tracking-[0.05em] text-ink-subtle whitespace-nowrap border-b sticky top-0 z-20 bg-surface-card";
  const corner_ = corner ? " left-0 z-30 px-4" : "";
  const content = (
    <span
      className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      <span className="inline-flex items-center gap-1" title={hint}>
        {children}
        {short && (
          <span
            className="rounded px-1 py-0.5 text-[9px] font-bold tracking-wide"
            style={{ background: "var(--color-surface-track)", color: "var(--color-ink-subtle)" }}
          >
            {short}
          </span>
        )}
      </span>
      {sortable && (
        <span aria-hidden className="inline-flex w-3 justify-center" style={{ opacity: active ? 1 : 0.3 }}>
          {active && dir === "asc" ? (
            <ArrowUp size={12} strokeWidth={2.6} />
          ) : active && dir === "desc" ? (
            <ArrowDown size={12} strokeWidth={2.6} />
          ) : (
            <ArrowDown size={12} strokeWidth={2.6} />
          )}
        </span>
      )}
    </span>
  );
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`${base}${corner_}`}
      style={{ fontSize: 11, textAlign: align, borderColor: "var(--color-hairline-strong)" }}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={`inline-flex items-center w-full ${align === "right" ? "justify-end" : "justify-start"} uppercase tracking-[0.05em] text-ink-subtle hover:text-ink-strong transition-colors ${FOCUS_RING}`}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  );
}
