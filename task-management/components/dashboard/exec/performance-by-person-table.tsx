"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useReducedMotion } from "@/lib/motion-utils";
import type { PunctualityPerson } from "@/lib/types";

/* ────────────────────────────────────────────────────────────────────────
   PerformanceByPersonTable — V2 executive per-person delivery table.

   For every doer (busiest first): the Avatar character + name, their on-time
   rate as a bar + a `{late} late` count, and the late-spread broken into the
   2–3 / 4–7 / 8–14 / 15+ day buckets. Renders as a table on desktop and
   stacks to cards on mobile.

   Privacy: admins see all rows; a non-admin sees ONLY their own row
   (filtered to `meId`; null `meId` → none).

   Brand discipline (altus-premium-ui): rate thresholds green ≥80 / amber ≥60
   / red (matches punctuality-card); cream-glass surface + aurora wash,
   --font-display numbers with tabular-nums, .wg-rise entrance, motion/react
   staggered bar springs (reduced-motion-gated), Avatar character per row.
   ──────────────────────────────────────────────────────────────────────── */

const GREEN = "var(--color-green-deep)";
const AMBER = "var(--color-amber-deep)";
const RED = "var(--color-red-deep)";

/** On-time rate colour: green ≥80, amber ≥60, red below (project convention). */
function rateColor(rate: number): string {
  if (rate >= 80) return GREEN;
  if (rate >= 60) return AMBER;
  return RED;
}

const SPREAD_COLS: {
  key: keyof PunctualityPerson["lateSpread"];
  label: string;
}[] = [
  { key: "d2_3", label: "2–3" },
  { key: "d4_7", label: "4–7" },
  { key: "d8_14", label: "8–14" },
  { key: "d15", label: "15+" },
];

export interface PerformanceByPersonTableProps {
  people: PunctualityPerson[];
  isAdmin: boolean;
  meId: string | null;
  resolveAvatar: (employeeId: string) => string | null;
}

export function PerformanceByPersonTable({
  people,
  isAdmin,
  meId,
  resolveAvatar,
}: PerformanceByPersonTableProps) {
  const reduce = useReducedMotion() ?? false;

  // Privacy: admins all rows; non-admin only their own (null → none).
  const scoped = isAdmin ? people : people.filter((p) => p.employeeId === meId);
  // Busiest first.
  const rows = React.useMemo(
    () => [...scoped].sort((a, b) => b.done - a.done),
    [scoped],
  );

  return (
    <section
      className="wg-rise relative overflow-hidden rounded-section p-7 max-md:p-5"
      aria-label="Performance by person"
      style={{
        background:
          "linear-gradient(155deg, color-mix(in srgb, #ffffff 86%, transparent) 0%, color-mix(in srgb, var(--color-surface-card) 92%, transparent) 100%)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.05), 0 22px 54px -30px rgba(225,6,0,0.18), inset 0 1px 0 rgba(255,255,255,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        ["--kpi-tone" as string]: "color-mix(in srgb, var(--color-green) 60%, transparent)",
        ["--kpi-tone-deep" as string]:
          "color-mix(in srgb, var(--color-altus-red) 45%, transparent)",
      }}
    >
      <span aria-hidden className="kpi-aurora-primary" />
      <span aria-hidden className="kpi-aurora-secondary" />

      <div className="relative">
        {/* ── Header ── */}
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: "var(--color-altus-red)",
            }}
          >
            <Users size={18} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2
              className="leading-none text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 19,
                letterSpacing: "-0.02em",
              }}
            >
              Performance by person
            </h2>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-none text-ink-subtle">
              On-time rate &amp; late spread · busiest first
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-6 text-[13.5px] font-semibold text-ink-subtle">
            No delivered tasks to break down in this range.
          </p>
        ) : (
          <>
            {/* ── Desktop table ── */}
            <div className="mt-5 max-md:hidden">
              <div
                className="grid items-center gap-3 px-3 pb-2 text-[10px] font-black uppercase tracking-[0.1em] text-ink-subtle"
                style={{ gridTemplateColumns: COLS }}
              >
                <span>Person</span>
                <span>On-time rate</span>
                <span className="text-right">Late</span>
                {SPREAD_COLS.map((c) => (
                  <span key={c.key} className="text-center">
                    {c.label}
                  </span>
                ))}
              </div>
              <ul className="flex flex-col gap-1.5">
                {rows.map((p, i) => (
                  <PersonTableRow
                    key={p.employeeId}
                    person={p}
                    avatarUrl={resolveAvatar(p.employeeId)}
                    index={i}
                    reduce={reduce}
                  />
                ))}
              </ul>
            </div>

            {/* ── Mobile cards ── */}
            <ul className="mt-5 flex flex-col gap-2.5 md:hidden">
              {rows.map((p, i) => (
                <PersonCard
                  key={p.employeeId}
                  person={p}
                  avatarUrl={resolveAvatar(p.employeeId)}
                  index={i}
                  reduce={reduce}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

const COLS = "minmax(0,1.6fr) minmax(120px,2fr) 56px 44px 44px 48px 44px";

function RateBar({
  rate,
  reduce,
  delay,
}: {
  rate: number;
  reduce: boolean;
  delay: number;
}) {
  const color = rateColor(rate);
  return (
    <span
      className="relative block h-2.5 w-full overflow-hidden rounded-full"
      style={{ background: "color-mix(in srgb, var(--color-red-deep) 16%, transparent)" }}
    >
      <motion.span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color }}
        initial={reduce ? false : { width: 0 }}
        whileInView={reduce ? undefined : { width: `${rate}%` }}
        animate={reduce ? { width: `${rate}%` } : undefined}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />
    </span>
  );
}

/** A late-spread bucket cell — emphasised in red only when non-zero. */
function SpreadCell({ value, className }: { value: number; className?: string }) {
  const hot = value > 0;
  return (
    <span
      className={`tabular-nums font-black ${className ?? ""}`}
      style={{
        fontFamily: "var(--font-display), system-ui, sans-serif",
        fontSize: 14,
        color: hot ? RED : "color-mix(in srgb, var(--color-ink-subtle) 60%, transparent)",
      }}
    >
      {value}
    </span>
  );
}

function PersonTableRow({
  person,
  avatarUrl,
  index,
  reduce,
}: {
  person: PunctualityPerson;
  avatarUrl: string | null;
  index: number;
  reduce: boolean;
}) {
  const { lateSpread } = person;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      animate={reduce ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: reduce ? 0 : index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="grid items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        gridTemplateColumns: COLS,
        background: "color-mix(in srgb, var(--color-ink-strong) 2.5%, transparent)",
      }}
    >
      {/* Person */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={person.employeeName} avatarUrl={avatarUrl} size={32} />
        <div className="min-w-0">
          <p
            className="truncate text-[13.5px] font-bold text-ink-strong"
            title={person.employeeName}
          >
            {person.employeeName}
          </p>
          <p className="text-[11px] font-semibold tabular-nums text-ink-subtle">
            {person.done} done
          </p>
        </div>
      </div>

      {/* On-time rate (bar + %) */}
      <div className="flex items-center gap-2.5">
        <RateBar rate={person.rate} reduce={reduce} delay={reduce ? 0 : index * 0.04 + 0.1} />
        <span
          className="w-10 shrink-0 text-right text-[13px] font-black tabular-nums"
          style={{ color: rateColor(person.rate) }}
        >
          {person.rate}%
        </span>
      </div>

      {/* Late count */}
      <span
        className="text-right text-[13px] font-black tabular-nums"
        style={{ color: person.late > 0 ? RED : "var(--color-ink-subtle)" }}
      >
        {person.late}
      </span>

      {/* Late spread */}
      <span className="text-center">
        <SpreadCell value={lateSpread.d2_3} />
      </span>
      <span className="text-center">
        <SpreadCell value={lateSpread.d4_7} />
      </span>
      <span className="text-center">
        <SpreadCell value={lateSpread.d8_14} />
      </span>
      <span className="text-center">
        <SpreadCell value={lateSpread.d15} />
      </span>
    </motion.li>
  );
}

function PersonCard({
  person,
  avatarUrl,
  index,
  reduce,
}: {
  person: PunctualityPerson;
  avatarUrl: string | null;
  index: number;
  reduce: boolean;
}) {
  const { lateSpread } = person;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      animate={reduce ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: reduce ? 0 : index * 0.045, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border p-3.5"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background:
          "color-mix(in srgb, var(--color-ink-strong) 2.5%, var(--color-surface-card))",
      }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={person.employeeName} avatarUrl={avatarUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[14px] font-bold text-ink-strong"
            title={person.employeeName}
          >
            {person.employeeName}
          </p>
          <p className="text-[11.5px] font-semibold tabular-nums text-ink-subtle">
            {person.done} done · {person.late} late
          </p>
        </div>
        <span
          className="shrink-0 text-[18px] font-black tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            color: rateColor(person.rate),
          }}
        >
          {person.rate}%
        </span>
      </div>

      <div className="mt-2.5">
        <RateBar rate={person.rate} reduce={reduce} delay={reduce ? 0 : index * 0.045 + 0.1} />
      </div>

      {/* Late spread grid */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {SPREAD_COLS.map((c) => (
          <div
            key={c.key}
            className="rounded-lg px-2 py-1.5 text-center"
            style={{
              background: "color-mix(in srgb, var(--color-ink-strong) 4%, transparent)",
            }}
          >
            <p className="text-[9.5px] font-black uppercase tracking-[0.06em] text-ink-subtle">
              {c.label}
            </p>
            <div className="mt-0.5">
              <SpreadCell value={lateSpread[c.key]} />
            </div>
          </div>
        ))}
      </div>
    </motion.li>
  );
}
