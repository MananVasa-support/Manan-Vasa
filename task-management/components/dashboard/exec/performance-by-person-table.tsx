"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Users, ArrowLeftRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useReducedMotion } from "@/lib/motion-utils";
import {
  SectionPagination,
  usePagedRows,
  CollapsibleSection,
  DASHBOARD_CARD_PADDED,
} from "@/components/dashboard/section-chrome";
import type { PunctualityPerson } from "@/lib/types";

/** People per page. 8 keeps the card about as tall as the heatmap beside it. */
const PAGE = 8;

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

/**
 * THE COLUMN SCHEMA — label, alignment, and the value each column sorts on,
 * in one list.
 *
 * SPREAD_COLS above is spread INTO this rather than duplicated: the header, the
 * desktop cells and the sort comparator all have to agree about which bracket
 * is which, and the comment on SPREAD_COLS already records what happened last
 * time two of those were maintained separately (numbers under the wrong
 * heading). A second hand-written list of the same four keys would be the same
 * bug waiting to happen, one file older.
 */
type SortKey = "person" | "rate" | keyof PunctualityPerson["lateSpread"] | "late";
type SortDir = "desc" | "asc";
type SortState = { key: SortKey; dir: SortDir } | null;

const SORT_COLS: {
  key: SortKey;
  label: string;
  center: boolean;
  /** What this column orders by. Strings compare by locale, numbers by value. */
  value: (p: PunctualityPerson) => number | string;
}[] = [
  { key: "person", label: "Person", center: false, value: (p) => p.employeeName.toLowerCase() },
  { key: "rate", label: "On-time rate", center: false, value: (p) => p.rate },
  ...SPREAD_COLS.map((c) => ({
    key: c.key as SortKey,
    label: c.label,
    center: true,
    value: (p: PunctualityPerson) => p.lateSpread[c.key],
  })),
  { key: "late", label: "Late", center: true, value: (p: PunctualityPerson) => p.late },
];

/**
 * One header cell: label, sort arrow, and the three-step cycle.
 *
 * DESC FIRST on every column, including Person. On a count column that is
 * plainly right — the reader is asking "who has the most" — and making the name
 * column cycle A-Z first purely because it is text would mean two columns
 * behaving differently under the same click. The arrow says which way it went.
 *
 * The arrow only occupies space when the column is active or hovered, so a row
 * of seven headings is not a row of seven arrows competing with the labels.
 */
function SortHeader({
  col,
  sort,
  onSort,
}: {
  col: (typeof SORT_COLS)[number];
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === col.key;
  const dir = active ? sort!.dir : null;
  return (
    <button
      type="button"
      onClick={() => onSort(col.key)}
      aria-label={
        active
          ? `${col.label}, sorted ${dir === "asc" ? "ascending" : "descending"}. Activate to ${
              dir === "asc" ? "clear the sort" : "sort ascending"
            }.`
          : `Sort by ${col.label}, descending`
      }
      className={`group inline-flex cursor-pointer items-center gap-1 transition-colors ${
        col.center ? "w-full justify-center" : ""
      } ${active ? "font-bold text-slate-900" : "hover:text-slate-700"}`}
    >
      {col.label}
      <span
        aria-hidden
        className={`text-[8px] leading-none transition-opacity ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
        }`}
      >
        {dir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
}

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
  // null = the default burden rank. Third click on a column returns here.
  const [sort, setSort] = React.useState<SortState>(null);
  // Orientation. A rendering choice over rows already in hand — never refetches.
  const [isTransposed, setIsTransposed] = React.useState(false);

  const cycleSort = React.useCallback((key: SortKey) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "desc" };
      if (cur.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }, []);

  // Privacy: admins all rows; non-admin only their own (null → none).
  const scoped = isAdmin ? people : people.filter((p) => p.employeeId === meId);
  // HEAVIEST OVERDUE BURDEN FIRST — this section is read as "who is behind",
  // so the count of late deliveries leads, not raw throughput. Ties break on the
  // worse on-time rate, then on volume, so of two people with 4 late each the
  // one who is late a larger share of the time surfaces first.
  const rows = React.useMemo(() => {
    const base = [...scoped].sort(
      (a, b) => b.late - a.late || a.rate - b.rate || b.done - a.done,
    );
    if (!sort) return base;
    const col = SORT_COLS.find((c) => c.key === sort.key);
    if (!col) return base;
    const dir = sort.dir === "desc" ? -1 : 1;
    // Sorting the ALREADY burden-ranked array, and Array.prototype.sort is
    // stable — so ties inside a chosen column keep the default ordering
    // underneath instead of landing in whatever order the input happened to be.
    return base.sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      return cmp * dir;
    });
  }, [scoped, sort]);

  // PAGED, 8 to a page, with the pager in the section header.
  //
  // This had been switched to "render every row inside a 520px scroller", which
  // left `SectionPagination` and `usePagedRows` imported and unused — and put
  // the roster behind an inner scrollbar nested inside the page's own. The
  // pager is the control the header slot was built for: it reads "1–8 of 14"
  // beside the fold button, and the card is exactly as tall as one page.
  const paged = usePagedRows(rows, PAGE);
  const visible = paged.visible;

  // Re-sorting reshuffles who is on which page, so staying on page 3 would show
  // an arbitrary slice of the new order. usePagedRows only CLAMPS (for a list
  // that shrank); it has no reason to reset, so the reset belongs here.
  const setPage = paged.setPage;
  React.useEffect(() => {
    setPage(1);
  }, [sort, setPage]);

  // Header ABOVE the card — see components/dashboard/section-header.tsx. The
  // pager rides along in the actions slot because its page state lives here,
  // with the rows it pages; the fold control sits to its right.
  return (
    <CollapsibleSection
      label="Overdue tasks by person"
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
      /* Pager LEFT of the fold control — CollapsibleSection always appends the
         collapse toggle after whatever a section passes here, so the minimize
         button stays the rightmost thing on every section of the dashboard.
         The people-count readout stays for the single-page case, where
         SectionPagination renders nothing at all. */
      actions={
        <>
          {paged.pageCount <= 1 && (
            <span className="text-[12px] font-semibold text-ink-subtle">
              {rows.length} {rows.length === 1 ? "person" : "people"}
            </span>
          )}
          <SectionPagination
            page={paged.page}
            pageCount={paged.pageCount}
            onPage={paged.setPage}
            total={paged.total}
            pageSize={PAGE}
            label="Overdue tasks by person"
          />
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setIsTransposed((v) => !v)}
              aria-pressed={isTransposed}
              title={isTransposed ? "Back to people as rows" : "Transpose: metrics as rows"}
              className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold shadow-2xs transition-colors hover:bg-slate-50 ${
                isTransposed ? "text-altus-red" : "text-slate-700"
              }`}
            >
              <ArrowLeftRight className="size-3.5" strokeWidth={2.6} aria-hidden />
              Transpose
            </button>
          )}
        </>
      }
    >
    {/* THE SHARED CARD. This was the dashboard's one remaining bespoke shell:
        a 155deg gradient ground, a red-tinted 54px drop shadow, an 8px backdrop
        blur and two aurora spans, on `rounded-section p-7`. Stacked between the
        flat white cards above and below it, it read as a different surface
        rather than a peer — which is the whole reason the section stack looked
        uneven. The aurora spans and the two --kpi-tone vars that fed them go
        with it; nothing else referenced them. */}
    <section
      className={`wg-rise relative overflow-hidden ${DASHBOARD_CARD_PADDED}`}
      aria-label="Overdue tasks by person"
    >
      <div className="relative">
        {rows.length === 0 ? (
          <p className="text-[13.5px] font-semibold text-ink-subtle">
            No delivered tasks to break down in this range.
          </p>
        ) : (
          <>
            {/* ── Transposed: metrics down, people across ── */}
            {isTransposed && (
              <TransposedPerformance
                people={visible}
                resolveAvatar={resolveAvatar}
              />
            )}

            {/* ── Desktop table ── */}
            <div className={isTransposed ? "hidden" : "max-md:hidden"}>
              <div
                className="grid items-center gap-3 px-3 pb-2.5 text-[12px] font-black uppercase tracking-[0.08em] text-ink-subtle"
                style={{ gridTemplateColumns: COLS }}
              >
                {SORT_COLS.map((c) => (
                  <SortHeader key={c.key} col={c} sort={sort} onSort={cycleSort} />
                ))}
              </div>
              {/* 520px, not unbounded: the whole roster is reachable by
                  scrolling without the card growing down the page. */}
              {/* space-y-4 rhythm, matching the other card interiors. No
                  max-height and no inner scroller: the page size bounds the
                  card now, so the rows scroll with the page like everything
                  else instead of trapping a second scrollbar inside a card. */}
              <ul className="flex flex-col gap-4">
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
            <ul className={`flex flex-col gap-4 ${isTransposed ? "hidden" : "md:hidden"}`}>
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

/**
 * TRANSPOSED — metrics down the side, people across the top.
 *
 * Reads the SAME people the standard view is showing (the current page), so
 * the pager still governs how many columns appear and the two orientations can
 * never disagree about a number.
 *
 * The metric column is frozen with `sticky left-0`: with a column per person
 * the grid scrolls sideways, and a row label that scrolls out of view leaves a
 * line of bare numbers meaning nothing. `kanban-scroll` is the project's
 * existing thin-scrollbar class (globals.css) — reused rather than inventing a
 * second one. The scroll box sits INSIDE the card's padding with its own
 * radius, so a sideways scroll never runs under the card's border.
 */
function TransposedPerformance({
  people,
  resolveAvatar,
}: {
  people: PunctualityPerson[];
  resolveAvatar: (employeeId: string) => string | null;
}) {
  const metrics: {
    key: string;
    label: string;
    render: (p: PunctualityPerson) => React.ReactNode;
  }[] = [
    {
      key: "rate",
      label: "On-Time Rate",
      render: (p) => (
        <span
          className="text-[15px] font-black tabular-nums"
          style={{ color: rateColor(p.rate) }}
        >
          {p.rate}%
        </span>
      ),
    },
    ...SPREAD_COLS.map((c) => ({
      key: c.key,
      label: `${c.label} Days`,
      render: (p: PunctualityPerson) => <SpreadCell value={p.lateSpread[c.key]} />,
    })),
    {
      key: "late",
      label: "Total Late",
      render: (p: PunctualityPerson) => (
        <span
          className="text-[15px] font-black tabular-nums"
          style={{ color: p.late > 0 ? RED : "var(--color-ink-subtle)" }}
        >
          {p.late}
        </span>
      ),
    },
  ];

  const stickyCell =
    "sticky left-0 z-10 bg-white px-3 py-2.5 text-left text-[12.5px] font-bold text-ink-strong";

  return (
    <div className="kanban-scroll overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="border-b border-hairline">
            <th
              className={`${stickyCell} z-20 text-[11px] uppercase tracking-[0.08em] text-ink-subtle`}
              style={{ background: "#f9fafb" }}
            >
              Metric
            </th>
            {people.map((p) => (
              <th key={p.employeeId} className="px-3 py-2.5" style={{ background: "#f9fafb" }}>
                <span className="inline-flex flex-col items-center gap-1">
                  <Avatar
                    name={p.employeeName}
                    avatarUrl={resolveAvatar(p.employeeId)}
                    size={26}
                  />
                  <span
                    className="max-w-[14ch] truncate text-[11.5px] font-bold text-ink-strong"
                    title={p.employeeName}
                  >
                    {p.employeeName}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.key} className="border-b border-hairline last:border-b-0">
              <td className={stickyCell}>{m.label}</td>
              {people.map((p) => (
                <td key={p.employeeId} className="px-3 py-2.5 text-center">
                  {m.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
