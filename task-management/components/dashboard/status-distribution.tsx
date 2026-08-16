"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { PieChart, LayoutGrid } from "lucide-react";
import { PENDING_STATUSES, isDeprecatedStatus } from "@/db/enums";
import type {
  StatusDistributionPayload,
  StatusDistribution,
} from "@/lib/types";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import { useCountUp } from "@/lib/use-count-up";
import {
  STATUS_LABELS_FALLBACK,
  STATUS_TONES_FALLBACK,
} from "@/lib/format";
import { CollapseToggle, CollapsibleBody } from "./section-chrome";
import { DashboardSectionHeader } from "./section-header";

type Tone = StatusColorToken;

/**
 * EXACT per-status colour system. `fill` paints the card's top accent, its
 * inner progress bar, and its segment of the proportion ribbon — one source, so
 * a status is the same colour everywhere it appears.
 *
 * `ink` is the text that sits ON that fill (the in-segment % label). Four fills
 * are too light for white text — amber-400, orange-300, sky-300 and the white
 * "Not Read" tier — so those carry dark ink rather than relying on a shared
 * "light tones" guess.
 *
 * `border` is set only for the white tier, which would otherwise be invisible
 * against the card and the ribbon's track.
 *
 * Statuses beyond the eleven named in the palette are mapped to their nearest
 * sibling rather than left uncoloured:
 *   • `need_help` shares Need Info's pink — the app's own scheme has always
 *     grouped the two ("Need Info/Need Help", lib/format.ts).
 *   • `follow_up_1/2/3` share Follow Up's ice blue; they are the granular
 *     variants that collapsed back into `follow_up`.
 *   • `transferred` shares Cancelled's grey — both are terminal exits.
 */
interface StatusPaint {
  fill: string;
  ink: string;
  border?: string;
}

const STATUS_PAINT: Record<TaskStatus, StatusPaint> = {
  done:         { fill: "#10b981", ink: "#ffffff" },                          // emerald-500
  not_approved: { fill: "#dc2626", ink: "#ffffff" },                          // red-600
  approved:     { fill: "#9333ea", ink: "#ffffff" },                          // purple-600
  need_info:    { fill: "#ec4899", ink: "#ffffff" },                          // pink-500
  need_help:    { fill: "#ec4899", ink: "#ffffff" },                          // pink-500 (see note)
  not_started:  { fill: "#fbbf24", ink: "#1f2937" },                          // amber-400
  dont_know:    { fill: "#f9fafb", ink: "#1f2937", border: "#d1d5db" },       // "Not Read"
  initiated:    { fill: "#fdba74", ink: "#1f2937" },                          // orange-300
  on_hold:      { fill: "#f97316", ink: "#ffffff" },                          // orange-500
  follow_up:    { fill: "#7dd3fc", ink: "#1f2937" },                          // sky-300
  follow_up_1:  { fill: "#7dd3fc", ink: "#1f2937" },
  follow_up_2:  { fill: "#7dd3fc", ink: "#1f2937" },
  follow_up_3:  { fill: "#7dd3fc", ink: "#1f2937" },
  cancelled:    { fill: "#9ca3af", ink: "#ffffff" },                          // gray-400
  transferred:  { fill: "#9ca3af", ink: "#ffffff" },                          // gray-400
};

/** The summary tiles are not statuses, so they carry their own paint. */
const SUMMARY_PAINT = {
  pending: { fill: "#2563eb", ink: "#ffffff" },                               // blue-600
  notApproved: { fill: "#dc2626", ink: "#ffffff" },                           // red-600
  archived: { fill: "#9ca3af", ink: "#ffffff" },                              // gray-400
} as const;

export function StatusDistributionChart({
  data,
  labels,
  tones,
  isAdmin,
}: {
  data: StatusDistributionPayload;
  labels?: Record<TaskStatus, string>;
  tones?: Record<TaskStatus, Tone>;
  isAdmin: boolean;
}) {
  // Unfolded by default — this panel IS the overview, so it opens showing the
  // ribbon; the toggle is there to fold it away when you want the space.
  const [open, setOpen] = React.useState(true);
  // Shared hover: set by a ribbon segment, read by the matching card (and vice
  // versa), so pointing at either highlights both.
  const [hovered, setHovered] = React.useState<TaskStatus | null>(null);
  const resolvedLabels = labels ?? STATUS_LABELS_FALLBACK;
  const resolvedTones = (tones ?? STATUS_TONES_FALLBACK) as Record<
    TaskStatus,
    Tone
  >;
  // Drop retired statuses (transferred / cancelled / follow_up_1-3) — those
  // tasks are migrated/archived now and shouldn't get their own tiles.
  const rows = [...data.rows]
    .filter((r) => !isDeprecatedStatus(r.status))
    .sort((a, b) => b.count - a.count);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const denom = data.denominator;
  // Defensive: Next's Data Cache can serve a payload cached before `summary`
  // existed (up to the 60s revalidate window right after a deploy). Fall back
  // to zeros so the card renders instead of throwing on `summary.pending`.
  const summary = data.summary ?? { pending: 0, notApproved: 0, archived: 0 };

  if (rows.length === 0) {
    return (
      <section>
        <Header isAdmin={isAdmin} />
        <div
          className="rounded-section bg-surface-card border border-hairline p-8"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p className="text-body-lg text-ink-subtle">
            No data for the current filter.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="w-full max-w-none"
      style={{ opacity: 0, animation: "fadeUp 500ms ease-out 500ms forwards" }}
    >
      <Header
        isAdmin={isAdmin}
        actions={
          <CollapseToggle
            expanded={open}
            onToggle={() => setOpen((v) => !v)}
            label="Status Distribution"
          />
        }
      />

      <div className="wms-card w-full max-w-none rounded-2xl bg-white p-6 shadow-xs hover:shadow-sm max-md:p-4">
      {/* Ribbon, legend cards and summary fold together, so the card collapses
          to nothing while the header above it stays put. */}
      <CollapsibleBody expanded={open}>

      {/* Proportional ribbon — one seamless bar, each segment sized to its
          share of the total. Hovering a segment raises a fast tooltip AND
          highlights the matching card below (shared `hovered` state), so the
          ribbon and the grid read as one control rather than two views of the
          same numbers. Segments stay non-navigating: a 6px sliver can't be a
          reliable click target, so the cards own the click. */}
      <div
        className="relative mt-6 flex h-4 w-full overflow-hidden rounded-lg bg-gray-100"
        role="img"
        aria-label={`Tasks by status: ${rows
          .map((r) => `${resolvedLabels[r.status]} ${r.count}`)
          .join(", ")}`}
      >
        {rows.map((r, i) => {
          const paint = STATUS_PAINT[r.status];
          const widthPct = totalCount > 0 ? (r.count / totalCount) * 100 : 0;
          if (widthPct === 0) return null;
          const pct = denom > 0 ? (r.count / denom) * 100 : widthPct;
          const isHot = hovered === r.status;
          // No in-segment % label any more: at h-4 the bar is 16px tall and the
          // old 15px text did not fit. The tooltip carries the exact figure and
          // every card below prints its own share, so nothing is lost.
          return (
            <div
              key={r.status}
              title={`${resolvedLabels[r.status]}: ${r.count} tasks (${pct.toFixed(1)}%)`}
              onMouseEnter={() => setHovered(r.status)}
              onMouseLeave={() => setHovered(null)}
              className="flex h-full cursor-default items-center justify-center transition-[filter,opacity] duration-150"
              style={{
                width: `${widthPct}%`,
                minWidth: 6,
                background: paint.fill,
                // The white "Not Read" tier needs an outline or it reads as a
                // gap in the ribbon rather than a segment.
                boxShadow: [
                  paint.border ? `inset 0 0 0 1px ${paint.border}` : "",
                  i < rows.length - 1 ? "inset -1px 0 0 rgba(255,255,255,0.6)" : "",
                ]
                  .filter(Boolean)
                  .join(", "),
                // Dim the others rather than brighten the hovered one: the
                // contrast lands the same way and the colours stay truthful.
                opacity: hovered && !isHot ? 0.45 : 1,
                filter: isHot ? "brightness(1.06)" : undefined,
                animation: `barGrow 900ms cubic-bezier(.2,.8,.2,1) ${300 + i * 70}ms backwards`,
                transformOrigin: "left",
              }}
            />
          );
        })}
      </div>

      {/* Legend grid — one continuous grid of status tiles followed by the
          pending / not-approved / archived summary tiles (same design), so the
          cards flow without odd mid-grid gaps. 3 cols desktop, 2 tablet, 1 mobile. */}
      {/* Six across at full width — the section no longer shares a row, so the
          eleven-odd cards fit two rows instead of four cramped ones. */}
      <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {rows.map((r, i) => (
          <StatTile
            key={r.status}
            row={r}
            index={i}
            denom={denom}
            label={resolvedLabels[r.status]}
            paint={STATUS_PAINT[r.status]}
            highlighted={hovered === r.status}
            onHover={(on) => setHovered(on ? r.status : null)}
          />
        ))}
        <SummaryTile
          label="Pending"
          value={summary.pending}
          paint={SUMMARY_PAINT.pending}
          denom={denom}
          index={rows.length}
          href={`/tasks?status=${PENDING_STATUSES.join(",")}` as Route}
        />
        <SummaryTile
          label="Not approved"
          value={summary.notApproved}
          paint={SUMMARY_PAINT.notApproved}
          denom={denom}
          index={rows.length + 1}
          href={"/tasks?status=not_approved" as Route}
        />
        {/* Archived view is admin-only — hide the jump-to-archive tile from doers. */}
        {isAdmin && (
          <SummaryTile
            label="Archived"
            value={summary.archived}
            paint={SUMMARY_PAINT.archived}
            denom={denom}
            index={rows.length + 2}
            href={"/archived" as Route}
          />
        )}
      </ul>
      </CollapsibleBody>
      </div>
    </section>
  );
}

/**
 * Same visual language as StatTile (the 9 status cards) so the
 * pending/not-approved/archived row blends in seamlessly: coloured dot +
 * uppercase label, big count, share % of open work, and a bottom share bar.
 */
function SummaryTile({
  label,
  value,
  paint,
  denom,
  index,
  href,
}: {
  label: string;
  value: number;
  paint: StatusPaint;
  denom: number;
  index: number;
  href: Route;
}) {
  const animated = useCountUp(value, 900 + index * 70);
  const pct = denom > 0 ? (value / denom) * 100 : 0;
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
      >
        <span
          aria-hidden
          className="-mx-4 -mt-4 mb-3 block h-1"
          style={{ background: paint.fill }}
        />

        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: paint.fill }}
          />
          <span
            className="truncate font-bold uppercase tracking-[0.06em] text-gray-500"
            style={{ fontSize: 12 }}
          >
            {label}
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span
            className="font-black leading-none tabular-nums text-gray-900"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 34,
            }}
          >
            {animated}
          </span>
          <span
            className="ml-auto font-semibold tabular-nums text-gray-500"
            style={{ fontSize: 14 }}
          >
            {denom > 0 ? `${pct.toFixed(1)}%` : "—"}
          </span>
        </div>

        <div aria-hidden className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <span
            className="block h-full rounded-full transition-[filter] duration-150 group-hover:brightness-110"
            style={{
              width: `${Math.max(Math.min(pct, 100), pct > 0 ? 3 : 0)}%`,
              background: paint.fill,
              animation: `barGrow 900ms cubic-bezier(.2,.8,.2,1) ${400 + index * 70}ms backwards`,
              transformOrigin: "left",
            }}
          />
        </div>
      </Link>
    </li>
  );
}

/**
 * The section header. Rendered ABOVE the white card, never inside it — see
 * components/dashboard/section-header.tsx. `actions` carries the Kanban link
 * and (when given) the collapse toggle, so the whole header line lives here.
 */
function Header({ isAdmin, actions }: { isAdmin: boolean; actions?: React.ReactNode }) {
  return (
    <DashboardSectionHeader
      className="mb-3"
      eyebrow="Tasks · Distribution"
      eyebrowTone="muted"
      icon={
        <span
          aria-hidden
          className="inline-flex size-10 items-center justify-center rounded-xl"
          style={{
            background: "rgba(15, 23, 42, 0.05)",
            color: "var(--color-ink-strong)",
          }}
        >
          <PieChart size={20} strokeWidth={2.2} />
        </span>
      }
      title="Status Distribution"
      subtitle="Tasks by current status — hover the bar for detail, click a card to filter"
      actions={
        <>
          {/* Kanban is admin-only — doers don't see the jump-to-board link. */}
          {isAdmin && (
            <Link
              href={"/tasks/kanban" as Route}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold text-white transition-transform hover:-translate-y-0.5"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 4px 12px rgba(225, 6, 0, 0.25)",
              }}
            >
              <LayoutGrid size={15} strokeWidth={2.4} />
              View in Kanban
            </Link>
          )}
          {actions}
        </>
      }
    />
  );
}

function StatTile({
  row,
  index,
  denom,
  label,
  paint,
  highlighted,
  onHover,
}: {
  row: StatusDistribution;
  index: number;
  denom: number;
  label: string;
  paint: StatusPaint;
  /** True while the matching ribbon segment is hovered. */
  highlighted: boolean;
  onHover: (on: boolean) => void;
}) {
  const animated = useCountUp(row.count, 900 + index * 70);
  const pct = denom > 0 ? (row.count / denom) * 100 : 0;
  return (
    <li>
      <Link
        href={`/tasks?status=${row.status}` as Route}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className={`group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-white p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md ${
          highlighted ? "-translate-y-0.5 border-gray-300 shadow-md" : "border-gray-200"
        }`}
        style={
          // The status colour lives on a top accent rail rather than the whole
          // card, so eleven cards side by side stay readable.
          { boxShadow: highlighted ? `inset 0 3px 0 ${paint.fill}` : undefined }
        }
      >
        <span
          aria-hidden
          className="-mx-4 -mt-4 mb-3 block h-1"
          style={{ background: paint.fill }}
        />

        {/* Label row — colour chip + status name */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{
              background: paint.fill,
              boxShadow: paint.border ? `inset 0 0 0 1px ${paint.border}` : undefined,
            }}
          />
          <span
            className="truncate font-bold uppercase tracking-[0.06em] text-gray-500"
            style={{ fontSize: 12 }}
          >
            {label}
          </span>
        </div>

        {/* Count + share — single baseline row, % pinned right */}
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className="font-black leading-none tabular-nums text-gray-900"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 34,
            }}
          >
            {animated}
          </span>
          <span
            className="ml-auto font-semibold tabular-nums text-gray-500"
            style={{ fontSize: 14 }}
          >
            {denom > 0 ? `${pct.toFixed(1)}%` : "—"}
          </span>
        </div>

        {/* Share bar — the fill grows on hover, so the card confirms the
            pointer without moving any layout. */}
        <div aria-hidden className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <span
            className="block h-full rounded-full transition-[filter,transform] duration-150 group-hover:brightness-110"
            style={{
              width: `${Math.max(Math.min(pct, 100), pct > 0 ? 3 : 0)}%`,
              background: paint.fill,
              boxShadow: paint.border ? `inset 0 0 0 1px ${paint.border}` : undefined,
              animation: `barGrow 900ms cubic-bezier(.2,.8,.2,1) ${400 + index * 70}ms backwards`,
              transformOrigin: "left",
            }}
          />
        </div>
      </Link>
    </li>
  );
}
