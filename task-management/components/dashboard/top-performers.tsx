"use client";
import * as React from "react";
import { ChevronRight, Inbox, Trophy } from "lucide-react";
import type { TopPerformer } from "@/lib/types";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { useCountUp } from "@/lib/use-count-up";
import { Avatar } from "@/components/ui/avatar";
import { DashboardSectionHeader } from "./section-header";
import { CollapseToggle, CollapsibleBody } from "./section-chrome";
import { PerformerTaskDrawer } from "./performer-task-drawer";

/**
 * Top Performers — a full-width leaderboard: one uniform row per person, ranks
 * 1 through N sharing the same structure, width, and metrics.
 *
 * MEDAL STYLING KEYS OFF THE TRUE GLOBAL RANK, never the row's position in this
 * (possibly search-filtered) list. Filter to one person sitting 7th and they
 * keep a neutral rank chip — a gold badge claiming #1 would be a lie the filter
 * told.
 *
 * Clicking anything opens the completed-task drawer for that person.
 */

/**
 * Podium treatment per TRUE rank — an inline pill badge and a matching avatar
 * ring, nothing more. Rank 4+ falls through to no badge at all, so the row
 * itself is identical either way.
 */
const PODIUM = {
  1: {
    medal: "🥇",
    label: "1st",
    ring: "ring-amber-300",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
  },
  2: {
    medal: "🥈",
    label: "2nd",
    ring: "ring-slate-300",
    chip: "border-slate-200 bg-slate-50 text-slate-700",
  },
  3: {
    medal: "🥉",
    label: "3rd",
    ring: "ring-orange-300",
    chip: "border-orange-200 bg-orange-50 text-orange-700",
  },
} as const;

type PodiumRank = keyof typeof PODIUM;
const podiumFor = (rank: number) =>
  (PODIUM as Record<number, (typeof PODIUM)[PodiumRank] | undefined>)[rank];

/**
 * Metric formatters that survive a STALE PAYLOAD.
 *
 * `onTimeRate` / `avgTurnaroundDays` were added to `TopPerformer` after this
 * dashboard's response was already being cached, so Next's Data Cache can serve
 * a payload where they are `undefined` rather than `null` — for the whole
 * revalidate window after a deploy. A `=== null` check passes `undefined`
 * straight through to the template, which is what rendered "undefined%" and
 * "undefinedd". Loose `== null` catches both, and "N/A" is the honest reading:
 * not measured, as distinct from measured at zero.
 */
function fmtRate(v: number | null | undefined): string {
  return v == null ? "N/A" : `${v}%`;
}

/**
 * The on-time figure, with the fraction it came from.
 *
 * `datedCompletions` is the guard, not `doneCount`: a person can complete nine
 * tasks that carry no due date, and those are UNMEASURABLE, not late. Showing
 * 0% there would read as "never on time" about someone who was never scored.
 * When there is something to measure, the fraction is printed beside the
 * percentage so 0% is visibly "0 of 4", not a mystery.
 */
function onTimeParts(p: TopPerformer): { text: string; detail: string | null } {
  if (!p.datedCompletions) return { text: "N/A", detail: null };
  return {
    text: fmtRate(p.onTimeRate),
    detail: `${p.completedOnTime}/${p.datedCompletions}`,
  };
}
function fmtDays(v: number | null | undefined): string {
  return v == null ? "N/A" : `${v}d`;
}

export function TopPerformersSection({
  performers,
  avatarById = {},
}: {
  performers: TopPerformer[];
  avatarById?: Record<string, string | null>;
}) {
  const [open, setOpen] = React.useState(true);
  const [drill, setDrill] = React.useState<TopPerformer | null>(null);

  // FilterBar section search. Ranks are NOT recomputed — `performers` arrives
  // already ordered, so a match keeps the position it actually holds.
  const sectionQuery = useSectionSearch();
  const visible = React.useMemo(
    () =>
      sectionQuery
        ? performers.filter((p) =>
            matchesSearch(sectionQuery, p.employeeName, p.department ?? ""),
          )
        : performers,
    [performers, sectionQuery],
  );

  // Bars are relative to the leaderboard's own leader, so the top row is always
  // a full bar and the rest read as a share of it.
  const maxDone = Math.max(...visible.map((p) => p.doneCount), 1);

  return (
    <section
      className="flex w-full max-w-none flex-col"
      /* Delay cut from 500ms: it staggered against this section's position in
         one long scroll, but it now mounts when its tab is clicked. */
      style={{ opacity: 0, animation: "fadeUp 400ms ease-out 100ms forwards" }}
    >
      <DashboardSectionHeader
        className="mb-3"
        icon={
          <span
            aria-hidden
            className="inline-flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"
          >
            <Trophy size={20} strokeWidth={2.2} />
          </span>
        }
        title="Top Performers"
        subtitle="Ranked by completed tasks — click any member to view their completed task list."
        actions={
          <CollapseToggle
            expanded={open}
            onToggle={() => setOpen((v) => !v)}
            label="Top performers"
          />
        }
      />

      <CollapsibleBody expanded={open}>
        <div className="wms-card w-full max-w-none rounded-2xl bg-white p-6 shadow-xs hover:shadow-sm max-md:p-4">
          {/* One list, one row shape. Ranks 1-3 used to sit in oversized podium
              cards above this list; they now share the same full-width row as
              everyone else and are marked by a medal pill instead. */}
          {visible.length === 0 ? (
            <EmptyState />
          ) : (
            <ol className="w-full">
              {visible.map((p, i) => (
                <LeaderRow
                  key={p.employeeId}
                  performer={p}
                  stagger={i}
                  maxDone={maxDone}
                  avatarUrl={avatarById[p.employeeId] ?? null}
                  onOpen={() => setDrill(p)}
                />
              ))}
            </ol>
          )}
        </div>
      </CollapsibleBody>

      <PerformerTaskDrawer
        open={drill !== null}
        employeeId={drill?.employeeId ?? ""}
        employeeName={drill?.employeeName ?? ""}
        onClose={() => setDrill(null)}
      />
    </section>
  );
}

/* ── Leaderboard row — identical for every rank ─────────────────────────── */

function LeaderRow({
  performer,
  stagger,
  maxDone,
  avatarUrl,
  onOpen,
}: {
  performer: TopPerformer;
  /** Position in the rendered list — only used to stagger the count-up. */
  stagger: number;
  maxDone: number;
  avatarUrl?: string | null;
  onOpen: () => void;
}) {
  const medal = podiumFor(performer.rank);
  const animated = useCountUp(performer.doneCount, 900 + stagger * 120);
  const onTime = onTimeParts(performer);
  const pct = Math.round((performer.doneCount / maxDone) * 100);

  return (
    <li className="mb-3 last:mb-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${performer.employeeName}'s completed tasks — rank ${performer.rank}, ${performer.doneCount} completed`}
        className="group flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
      >
        {/* Left — rank · avatar · name · medal / department pills */}
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold tabular-nums text-slate-700">
            {performer.rank}
          </span>
          <Avatar
            name={performer.employeeName}
            avatarUrl={avatarUrl}
            size={36}
            className={medal ? `ring-2 ring-offset-2 ${medal.ring}` : undefined}
          />
          <span className="min-w-0">
            <span
              className="block truncate text-[13.5px] font-bold text-slate-900"
              title={performer.employeeName}
            >
              {performer.employeeName}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {medal && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${medal.chip}`}
                >
                  <span aria-hidden>{medal.medal}</span>
                  {medal.label}
                </span>
              )}
              {performer.department && (
                <span className="inline-block max-w-[18ch] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {performer.department}
                </span>
              )}
            </span>
          </span>
        </span>

        {/* Centre — the same metric line and bar on every row. The bar drops on
            small screens; the counts stay, since they are the row's point. */}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-2 text-[12px] font-bold">
            <span className="tabular-nums text-slate-700">
              {animated.toLocaleString("en-IN")} Completed
            </span>
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <span className="text-emerald-600">
              {onTime.text} On Time
              {onTime.detail && (
                <span className="ml-1 font-semibold text-slate-400">({onTime.detail})</span>
              )}
            </span>
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <span className="text-slate-500">{fmtDays(performer.avgTurnaroundDays)} avg</span>
          </span>
          <span className="hidden h-1.5 w-full overflow-hidden rounded-full bg-slate-100 md:block">
            <span
              className="block h-full rounded-full bg-slate-300 transition-all"
              style={{ width: `${pct}%` }}
            />
          </span>
        </span>

        {/* Right — SLA (on-time) percentage + chevron */}
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold tabular-nums text-emerald-700">
            {onTime.text}
          </span>
          <ChevronRight
            size={16}
            strokeWidth={2.6}
            className="text-slate-400 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </button>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Inbox size={22} strokeWidth={2.2} />
      </span>
      <p className="text-[14px] font-bold text-slate-700">No completed tasks yet</p>
      <p className="max-w-[280px] text-[12.5px] text-slate-500">
        Once tasks are completed in this window, the leaderboard fills in.
      </p>
    </div>
  );
}
