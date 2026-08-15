"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { AttainmentRing } from "@/components/dashboard/exec/viz/attainment-ring";
import type { InitiatorScorecard } from "@/lib/types";

/* ────────────────────────────────────────────────────────────────────────
   ManagerInitiatorTable — the same initiation scorecards as
   ManagerInitiatorCard, laid out as a comparison TABLE rather than a grid of
   tiles.

   Why a table: the card grid showed one manager per tile, so comparing two
   managers meant reading two separate blocks and holding the numbers in your
   head. Delegation is a leaderboard question — "who is behind?" — and a table
   answers it by putting every manager's channel split on the same axis.

   Each row expands in place to the per-report breakdown, so the drill-down that
   used to be a second card region is now a nested table under its own manager.
   Clicking the row (but not the expander, and not the open-drilldown control)
   opens the full drill-down modal, matching the card's behaviour.
   ──────────────────────────────────────────────────────────────────────── */

/* Project threshold convention: green ≥100 · amber ≥60 · red below. */
const GREEN = "var(--color-green-deep)";
const AMBER = "var(--color-amber-deep)";
const RED = "var(--color-altus-red)";

function attainColor(pct: number): string {
  if (pct >= 100) return GREEN;
  if (pct >= 60) return AMBER;
  return RED;
}

/** Numeric channel cell — tabular so columns align down the table. */
function Num({ value, hero = false }: { value: number; hero?: boolean }) {
  return (
    <span
      className="tabular-nums leading-none"
      style={{
        fontFamily: "var(--font-display), system-ui, sans-serif",
        fontWeight: hero ? 900 : 700,
        fontSize: hero ? 17 : 15,
        color: hero
          ? "var(--color-ink-strong)"
          : value === 0
            ? "var(--color-ink-subtle)"
            : "var(--color-ink)",
      }}
    >
      {value}
    </span>
  );
}

const HEAD_CELL =
  "px-3 py-2.5 text-[10.5px] font-black uppercase tracking-[0.09em] whitespace-nowrap";

/* Outer header cells stay pinned while the body scrolls. The background lives
   on the cell rather than the row because a sticky <th> paints on its own — a
   <tr> background would let rows show through as they slide under. */
const STICKY_HEAD_CELL = `${HEAD_CELL} sticky top-0 z-10`;
const STICKY_HEAD_BG = {
  background: "color-mix(in srgb, var(--color-ink-strong) 3%, #ffffff)",
  color: "var(--color-ink-soft)",
} as const;

export function ManagerInitiatorTable({
  managers,
  resolveAvatar,
  onOpenDrilldown,
  minimized = false,
}: {
  managers: InitiatorScorecard[];
  resolveAvatar: (employeeId: string) => string | null;
  onOpenDrilldown: (managerId: string) => void;
  /** Collapse the body so only the column headers remain. */
  minimized?: boolean;
}) {
  // Which rows are expanded. A Set (not a single id) so several managers can be
  // compared with their breakdowns open at once — the whole point of the table.
  const [openRows, setOpenRows] = React.useState<ReadonlySet<string>>(new Set());
  const toggle = React.useCallback((id: string) => {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  return (
    <div
      className={`overflow-x-auto rounded-section border bg-surface-card ${
        minimized ? "" : "max-h-[380px] overflow-y-auto"
      }`}
      style={{ borderColor: "var(--color-hairline)" }}
    >
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className={`${STICKY_HEAD_CELL} text-left`} style={STICKY_HEAD_BG}>
              Manager / Initiator
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              % of Target
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Target Ratio
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Direct
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Counterpart
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Founder
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Total
            </th>
            <th className={`${STICKY_HEAD_CELL} text-right`} style={STICKY_HEAD_BG}>
              Breakdown
            </th>
          </tr>
        </thead>

        <tbody>
          {(minimized ? [] : managers).map((m) => {
            const open = openRows.has(m.managerId);
            const hitCount = m.perReport.filter((r) => r.hit).length;
            const tone = attainColor(m.attainmentPct);

            return (
              <React.Fragment key={m.managerId}>
                <tr
                  onClick={() => onOpenDrilldown(m.managerId)}
                  className="task-row cursor-pointer border-t transition-colors"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  {/* Manager: avatar · name · direct-report count */}
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar
                        name={m.managerName}
                        avatarUrl={resolveAvatar(m.managerId)}
                        size={34}
                      />
                      <span className="min-w-0">
                        <span
                          className="block truncate text-[13.5px] font-bold"
                          style={{ color: "var(--color-ink-strong)" }}
                          title={m.managerName}
                        >
                          {m.managerName}
                        </span>
                        <span
                          className="block text-[11.5px] font-semibold tabular-nums"
                          style={{ color: "var(--color-ink-subtle)" }}
                        >
                          {m.directReports}{" "}
                          {m.directReports === 1 ? "direct report" : "direct reports"}
                        </span>
                      </span>
                      <ArrowUpRight
                        size={14}
                        strokeWidth={2.6}
                        aria-hidden
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ color: "var(--color-altus-red)" }}
                      />
                    </span>
                  </td>

                  {/* % of target — the ring carries the same colour thresholds. */}
                  <td className="px-3 py-2.5">
                    <span className="flex items-center justify-center">
                      <AttainmentRing value={m.actual} max={m.target} size={54} />
                    </span>
                  </td>

                  {/* actual / target */}
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className="inline-flex items-baseline gap-1 tabular-nums"
                      style={{
                        fontFamily: "var(--font-display), system-ui, sans-serif",
                      }}
                    >
                      <span style={{ fontWeight: 900, fontSize: 16, color: tone }}>
                        {m.actual}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: "var(--color-ink-subtle)",
                        }}
                      >
                        / {m.target}
                      </span>
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-center">
                    <Num value={m.toDirectReports} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Num value={m.toCounterparts} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Num value={m.toFounderMgmt} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Num value={m.totalInitiated} hero />
                  </td>

                  {/* Expander. stopPropagation so opening the breakdown never
                      also fires the row's open-drilldown click. */}
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(m.managerId);
                      }}
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} per-report breakdown for ${m.managerName}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-black whitespace-nowrap transition-colors"
                      style={{
                        borderColor: "var(--color-hairline-strong)",
                        background:
                          "color-mix(in srgb, var(--color-altus-red) 4%, var(--color-surface-card))",
                        color: "var(--color-ink-strong)",
                      }}
                    >
                      <span className="max-lg:hidden">Show Per-Report Breakdown</span>
                      <span className="lg:hidden">Breakdown</span>
                      <span
                        className="font-bold tabular-nums"
                        style={{ color: "var(--color-ink-subtle)" }}
                      >
                        {hitCount}/{m.perReport.length} on goal
                      </span>
                      <ChevronDown
                        size={15}
                        strokeWidth={2.6}
                        className="transition-transform duration-300"
                        style={{
                          color: "var(--color-altus-red)",
                          transform: open ? "rotate(180deg)" : "none",
                        }}
                      />
                    </button>
                  </td>
                </tr>

                {/* Nested per-report table, in its own full-width row so the
                    manager columns above keep their alignment. Only mounted
                    while open — a closed row costs nothing. */}
                {open && (
                  <tr style={{ borderColor: "var(--color-hairline)" }}>
                    <td
                      colSpan={8}
                      className="px-3 pb-3 pt-0"
                      style={{
                        background:
                          "color-mix(in srgb, var(--color-ink-strong) 2.5%, transparent)",
                      }}
                    >
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {m.perReport.length === 0 ? (
                          <p
                            className="py-3 text-[12.5px] font-semibold"
                            style={{ color: "var(--color-ink-subtle)" }}
                          >
                            No direct reports in this window.
                          </p>
                        ) : (
                          <table className="min-w-full border-collapse">
                            <thead>
                              <tr style={{ color: "var(--color-ink-subtle)" }}>
                                <th className={`${HEAD_CELL} text-left`}>Report</th>
                                <th className={`${HEAD_CELL} text-center`}>Given</th>
                                <th className={`${HEAD_CELL} text-center`}>Goal</th>
                                <th className={`${HEAD_CELL} text-left`}>Progress</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.perReport.map((r) => {
                                const pct =
                                  r.goal > 0
                                    ? Math.min(100, (r.given / r.goal) * 100)
                                    : r.given > 0
                                      ? 100
                                      : 0;
                                const bar = r.hit ? GREEN : pct >= 60 ? AMBER : RED;
                                return (
                                  <tr key={r.employeeId}>
                                    <td className="px-3 py-1.5">
                                      <span className="flex items-center gap-2.5">
                                        <Avatar
                                          name={r.employeeName}
                                          avatarUrl={resolveAvatar(r.employeeId)}
                                          size={26}
                                        />
                                        <span
                                          className="truncate text-[12.5px] font-bold"
                                          style={{ color: "var(--color-ink-strong)" }}
                                          title={r.employeeName}
                                        >
                                          {r.employeeName}
                                        </span>
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      <Num value={r.given} />
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      <Num value={r.goal} />
                                    </td>
                                    <td className="px-3 py-1.5" style={{ minWidth: 140 }}>
                                      <span
                                        className="block h-1.5 w-full overflow-hidden rounded-full"
                                        style={{
                                          background:
                                            "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)",
                                        }}
                                      >
                                        <span
                                          className="block h-full rounded-full"
                                          style={{ width: `${pct}%`, background: bar }}
                                        />
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </motion.div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
