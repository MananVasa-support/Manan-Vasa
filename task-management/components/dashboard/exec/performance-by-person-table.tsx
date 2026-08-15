"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useReducedMotion } from "@/lib/motion-utils";
import {
  SectionPagination,
  usePagedRows,
  CollapsibleSection,
} from "@/components/dashboard/section-chrome";
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

/** WORST-FIRST: 15+ leads, 2–3 trails, and the total Late count sits after
 *  them all. The eye lands on the most damaging bracket first instead of
 *  reading up to it.
 *
 *  This list is the SINGLE source of order — the header, the desktop cells,
 *  the mobile cards and the tooltip all map it. The desktop row used to
 *  hardcode its four cells ascending while the header mapped this array, so
 *  reversing the array alone would have put every number under the wrong
 *  heading. */
const SPREAD_COLS: {
  key: keyof PunctualityPerson["lateSpread"];
  label: string;
}[] = [
  { key: "d15", label: "15+" },
  { key: "d8_14", label: "8–14" },
  { key: "d4_7", label: "4–7" },
  { key: "d2_3", label: "2–3" },
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
  // HEAVIEST OVERDUE BURDEN FIRST — this section is read as "who is behind",
  // so the count of late deliveries leads, not raw throughput. Ties break on the
  // worse on-time rate, then on volume, so of two people with 4 late each the
  // one who is late a larger share of the time surfaces first.
  const rows = React.useMemo(
    () =>
      [...scoped].sort(
        (a, b) => b.late - a.late || a.rate - b.rate || b.done - a.done,
      ),
    [scoped],
  );

  // Paged 8 at a time via the shared top-right pager (was a "Show all"
  // expander, which made the card grow without bound on a big roster).
  const PAGE = 8;
  const paged = usePagedRows(rows, PAGE);
  const visible = paged.visible;

  // Header ABOVE the card — see components/dashboard/section-header.tsx. The
  // pager rides along in the actions slot because its page state lives here,
  // with the rows it pages; the fold control sits to its right.
  return (
    <CollapsibleSection
      label="Overdue tasks by person"
      eyebrow="Delivery · Overdue"
      icon={
        <span
          className="inline-flex size-9 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          <Users size={18} strokeWidth={2.4} />
        </span>
      }
      title="Overdue Tasks by Person"
      subtitle="On-time rate & late spread · heaviest overdue burden first"
      actions={
        <SectionPagination
          page={paged.page}
          pageCount={paged.pageCount}
          onPage={paged.setPage}
          total={paged.total}
          pageSize={PAGE}
          label="Overdue tasks by person"
        />
      }
    >
    <section
      className="wg-rise relative overflow-hidden rounded-section p-7 max-md:p-5"
      aria-label="Overdue tasks by person"
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
        {rows.length === 0 ? (
          <p className="text-[13.5px] font-semibold text-ink-subtle">
            No delivered tasks to break down in this range.
          </p>
        ) : (
          <>
            {/* ── Desktop table ── */}
            <div className="max-md:hidden">
              <div
                className="grid items-center gap-3 px-3 pb-2.5 text-[12px] font-black uppercase tracking-[0.08em] text-ink-subtle"
                style={{ gridTemplateColumns: COLS }}
              >
                <span>Person</span>
                <span>On-time rate</span>
                {SPREAD_COLS.map((c) => (
                  <span key={c.key} className="text-center">
                    {c.label}
                  </span>
                ))}
                <span className="text-center">Late</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                <AnimatePresence initial={false}>
                  {visible.map((p, i) => (
                    <PersonTableRow
                      key={p.employeeId}
                      person={p}
                      avatarUrl={resolveAvatar(p.employeeId)}
                      index={i}
                      reduce={reduce}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </div>

            {/* ── Mobile cards ── */}
            <ul className="flex flex-col gap-2.5 md:hidden">
              <AnimatePresence initial={false}>
                {visible.map((p, i) => (
                  <PersonCard
                    key={p.employeeId}
                    person={p}
                    avatarUrl={resolveAvatar(p.employeeId)}
                    index={i}
                    reduce={reduce}
                  />
                ))}
              </AnimatePresence>
            </ul>

          </>
        )}
      </div>
    </section>
    </CollapsibleSection>
  );
}

// Person · rate · [15+ · 8–14 · 4–7 · 2–3] · Late.
// The four bracket tracks are now equal (they hold the same kind of number and
// sit under equal-weight headings); Late keeps the wider track since it's the
// sum and runs to more digits. The old string front-loaded 56px for Late back
// when it came third.
const COLS = "minmax(0,1.6fr) minmax(120px,2fr) 50px 50px 50px 50px 56px";

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

/**
 * Hover breakdown behind the On-Time Rate percentage: how many delivered tasks
 * the rate is computed from, the on-time/late split, and the late spread. The
 * bar alone says "72%" without saying 72% *of what* — 72% of 4 tasks and 72% of
 * 90 are very different signals.
 */
function OnTimeRateTooltip({
  person,
  children,
}: {
  person: PunctualityPerson;
  children: React.ReactNode;
}) {
  // Use the field rather than re-deriving `done - late`. They agree today
  // (done is defined as onTime + late), but if that ever stops being true the
  // tooltip should report what the transform actually counted.
  const onTime = person.onTime;
  const spread = person.lateSpread;
  const row = "flex items-baseline justify-between gap-6";

  const pct = (n: number) =>
    person.done > 0 ? `${Math.round((n / person.done) * 100)}%` : "—";

  // The four brackets sum to ≤ `late`: lateSpread starts at 2 days, so tasks
  // that slipped by a single day land in no bracket. Surfacing the residual
  // keeps the breakdown adding up to the Late total instead of quietly
  // losing rows.
  const bracketed = spread.d2_3 + spread.d4_7 + spread.d8_14 + spread.d15;
  const oneDay = Math.max(0, person.late - bracketed);
  return (
    <Tooltip.Provider delayDuration={220}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={8}
            collisionPadding={12}
            className="z-[90]"
            style={{
              minWidth: 232,
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 14,
              boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
              padding: 14,
            }}
          >
            <p className="text-[14px] font-black text-ink-strong">{person.employeeName}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-ink-subtle">
              On-time rate ·{" "}
              <span className="tabular-nums font-black" style={{ color: rateColor(person.rate) }}>
                {person.rate}%
              </span>
            </p>

            <div className="mt-3 flex flex-col gap-1.5 border-t border-hairline pt-3 text-[12.5px] font-semibold text-ink-soft">
              <div className={row}>
                <span>Delivered</span>
                <span className="tabular-nums font-black text-ink-strong">{person.done}</span>
              </div>
              <div className={row}>
                <span>On time</span>
                <span className="tabular-nums font-black" style={{ color: GREEN }}>
                  {onTime}
                  <span className="ml-1.5 text-[11.5px] font-bold opacity-70">{pct(onTime)}</span>
                </span>
              </div>
              <div className={row}>
                <span>Late</span>
                <span className="tabular-nums font-black" style={{ color: person.late > 0 ? RED : "var(--color-ink-subtle)" }}>
                  {person.late}
                  <span className="ml-1.5 text-[11.5px] font-bold opacity-70">{pct(person.late)}</span>
                </span>
              </div>
            </div>

            {person.late > 0 && (
              <div className="mt-3 border-t border-hairline pt-3">
                <p className="text-[10.5px] font-black uppercase tracking-[0.1em] text-ink-subtle">
                  Late by
                </p>
                <div className="mt-1.5 flex flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
                  {SPREAD_COLS.map((c) => (
                    <div key={c.key} className={row}>
                      <span>{c.label} days</span>
                      <span className="tabular-nums font-black text-ink-strong">{spread[c.key]}</span>
                    </div>
                  ))}
                  {/* The residual — late, but by less than the smallest
                      bracket. Without it these rows silently sum to less than
                      the Late total above. */}
                  {oneDay > 0 && (
                    <div className={row}>
                      <span>1 day</span>
                      <span className="tabular-nums font-black text-ink-strong">{oneDay}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <Tooltip.Arrow style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
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
        fontSize: 16,
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
      exit={reduce ? undefined : { opacity: 0, y: -4 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: reduce ? 0 : index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="grid items-center gap-3 rounded-xl px-3 py-3"
      style={{
        gridTemplateColumns: COLS,
        background: "color-mix(in srgb, var(--color-ink-strong) 2.5%, transparent)",
      }}
    >
      {/* Person */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={person.employeeName} avatarUrl={avatarUrl} size={36} />
        <div className="min-w-0">
          <p
            className="truncate text-[15.5px] font-bold text-ink-strong"
            title={person.employeeName}
          >
            {person.employeeName}
          </p>
          <p className="text-[12.5px] font-semibold tabular-nums text-ink-subtle">
            {person.done} done
          </p>
        </div>
      </div>

      {/* On-time rate (bar + %) — hover for the numbers behind the percentage. */}
      <OnTimeRateTooltip person={person}>
        <div className="flex cursor-help items-center gap-2.5">
          <RateBar rate={person.rate} reduce={reduce} delay={reduce ? 0 : index * 0.04 + 0.1} />
          <span
            className="w-12 shrink-0 text-right text-[15.5px] font-black tabular-nums"
            style={{ color: rateColor(person.rate) }}
          >
            {person.rate}%
          </span>
        </div>
      </OnTimeRateTooltip>

      {/* Late spread — mapped from SPREAD_COLS (not hardcoded) so each number
          always sits under its own heading, whatever order that array is in. */}
      {SPREAD_COLS.map((c) => (
        <span key={c.key} className="text-center">
          <SpreadCell value={lateSpread[c.key]} />
        </span>
      ))}

      {/* Total late — last, after the brackets that make it up. Centred to
          match the columns it follows. */}
      <span
        className="text-center text-[15.5px] font-black tabular-nums"
        style={{ color: person.late > 0 ? RED : "var(--color-ink-subtle)" }}
      >
        {person.late}
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
      exit={reduce ? undefined : { opacity: 0, y: -4 }}
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
            className="truncate text-[16px] font-bold text-ink-strong"
            title={person.employeeName}
          >
            {person.employeeName}
          </p>
          <p className="text-[13px] font-semibold tabular-nums text-ink-subtle">
            {person.done} done · {person.late} late
          </p>
        </div>
        <span
          className="shrink-0 text-[22px] font-black tabular-nums leading-none"
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
            <p className="text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">
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
