"use client";
import * as React from "react";
import { ChevronRight, Crown, Inbox, Trophy } from "lucide-react";
import type { TopPerformer } from "@/lib/types";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { useCountUp } from "@/lib/use-count-up";
import { Avatar } from "@/components/ui/avatar";
import { DashboardSectionHeader } from "./section-header";
import { CollapseToggle, CollapsibleBody } from "./section-chrome";
import { PerformerTaskDrawer } from "./performer-task-drawer";

/**
 * Top Performers — a full-width leaderboard: a three-card podium over a
 * full-width list of the runners-up.
 *
 * MEDAL STYLING KEYS OFF THE TRUE GLOBAL RANK, never the row's position in this
 * (possibly search-filtered) list. Filter to one person sitting 7th and they
 * keep a neutral card — a gold card claiming #1 would be a lie the filter told.
 *
 * Clicking anything opens the completed-task drawer for that person.
 */

/** Podium treatment per TRUE rank. Rank 4+ falls through to the neutral row. */
const PODIUM = {
  1: {
    accent: "border-t-amber-400",
    ring: "ring-amber-400",
    glow: "0 10px 34px -10px rgba(251, 191, 36, 0.55)",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    label: "1st",
  },
  2: {
    accent: "border-t-slate-300",
    ring: "ring-slate-300",
    glow: "0 12px 32px -14px rgba(100, 116, 139, 0.35)",
    chip: "bg-slate-50 text-slate-700 border-slate-200",
    label: "2nd",
  },
  3: {
    accent: "border-t-amber-700",
    ring: "ring-amber-700",
    glow: "0 12px 32px -14px rgba(180, 83, 9, 0.35)",
    chip: "bg-orange-50 text-orange-700 border-orange-200",
    label: "3rd",
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

  const top3 = visible.slice(0, 3);
  const rest = visible.slice(3);
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
          {/* Full width now that the section is stacked rather than sharing a
              two-up row — the podium gets real room and ranks 4+ run edge to
              edge instead of wrapping in a half-width column. */}
          {visible.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* ── Podium ── */}
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                {top3.map((p, i) => (
                  <PodiumCard
                    key={p.employeeId}
                    performer={p}
                    stagger={i}
                    avatarUrl={avatarById[p.employeeId] ?? null}
                    onOpen={() => setDrill(p)}
                  />
                ))}
              </div>

              {/* ── Runners-up ── */}
              {rest.length > 0 && (
                <ol className="w-full space-y-2">
                  {rest.map((p) => (
                    <LeaderRow
                      key={p.employeeId}
                      performer={p}
                      maxDone={maxDone}
                      avatarUrl={avatarById[p.employeeId] ?? null}
                      onOpen={() => setDrill(p)}
                    />
                  ))}
                </ol>
              )}
            </>
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

/* ── Podium card ────────────────────────────────────────────────────────── */

function PodiumCard({
  performer,
  stagger,
  avatarUrl,
  onOpen,
}: {
  performer: TopPerformer;
  /** Position in the rendered list — only used to stagger the count-up. */
  stagger: number;
  avatarUrl?: string | null;
  onOpen: () => void;
}) {
  const medal = podiumFor(performer.rank);
  const animated = useCountUp(performer.doneCount, 900 + stagger * 120);
  const onTime = onTimeParts(performer);
  const isFirst = performer.rank === 1;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${performer.employeeName}'s completed tasks — rank ${performer.rank}, ${performer.doneCount} completed`}
      /* #1 sits physically above the other two: `scale-105` plus a warmer
         glow. The podium is a ranking, so the winner should be visibly first
         before the badge is even read. */
      className={`group relative block w-full cursor-pointer rounded-2xl border border-gray-200 border-t-4 bg-white p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        medal?.accent ?? "border-t-gray-300"
      } ${isFirst ? "z-10 scale-105 shadow-amber-100" : ""}`}
      style={medal ? { boxShadow: medal.glow } : undefined}
    >
      {/* Crown marks the TRUE #1 only. */}
      {performer.rank === 1 && (
        <span aria-hidden className="absolute right-4 top-4 text-amber-400 drop-shadow-sm">
          <Crown size={22} strokeWidth={2.4} fill="currentColor" />
        </span>
      )}

      <div className="flex items-center gap-3">
        <Avatar
          name={performer.employeeName}
          avatarUrl={avatarUrl}
          size={48}
          className={medal ? `ring-2 ring-offset-2 ${medal.ring}` : undefined}
        />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-gray-900" title={performer.employeeName}>
            {performer.employeeName}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${
                medal?.chip ?? "border-gray-200 bg-gray-50 text-gray-600"
              }`}
            >
              {medal?.label ?? `#${performer.rank}`}
            </span>
            {performer.department && (
              <span className="truncate rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10.5px] font-semibold text-gray-600">
                {performer.department}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Mini KPIs ── */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-3xl font-extrabold tabular-nums text-gray-900">
          {animated.toLocaleString("en-IN")}
          <span className="ml-1.5 text-xs font-bold uppercase tracking-wider text-gray-400">
            completed
          </span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-bold">
          <span className="text-emerald-600">
            {onTime.text} On Time
            {onTime.detail && (
              <span className="ml-1 font-semibold text-gray-400">({onTime.detail})</span>
            )}
          </span>
          <span className="text-gray-500">{fmtDays(performer.avgTurnaroundDays)} avg</span>
        </div>
      </div>
    </button>
  );
}

/* ── Runner-up row ──────────────────────────────────────────────────────── */

function LeaderRow({
  performer,
  maxDone,
  avatarUrl,
  onOpen,
}: {
  performer: TopPerformer;
  maxDone: number;
  avatarUrl?: string | null;
  onOpen: () => void;
}) {
  const pct = Math.round((performer.doneCount / maxDone) * 100);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${performer.employeeName}'s completed tasks — rank ${performer.rank}, ${performer.doneCount} completed`}
        className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm"
      >
        {/* Left — rank · avatar · name · department */}
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-bold tabular-nums text-gray-700">
            {performer.rank}
          </span>
          <Avatar name={performer.employeeName} avatarUrl={avatarUrl} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-bold text-gray-900" title={performer.employeeName}>
              {performer.employeeName}
            </span>
            {performer.department && (
              <span className="mt-0.5 inline-block max-w-[18ch] truncate rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                {performer.department}
              </span>
            )}
          </span>
        </span>

        {/* Centre — completion bar + on-time rate. Hidden on small screens,
            where the name and the count are what matter. */}
        <span className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
            <span
              className="block h-full rounded-full bg-gray-300 transition-all"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="w-24 shrink-0 text-right text-[12px] font-bold tabular-nums text-emerald-600">
            {performer.datedCompletions === 0
              ? "N/A"
              : `${performer.onTimeRate}% on time`}
          </span>
        </span>

        {/* Right — completed count + chevron */}
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold tabular-nums text-emerald-700">
            {performer.doneCount.toLocaleString("en-IN")}
          </span>
          <ChevronRight
            size={16}
            strokeWidth={2.6}
            className="text-gray-400 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </button>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Inbox size={22} strokeWidth={2.2} />
      </span>
      <p className="text-[14px] font-bold text-gray-700">No completed tasks yet</p>
      <p className="max-w-[280px] text-[12.5px] text-gray-500">
        Once tasks are completed in this window, the leaderboard fills in.
      </p>
    </div>
  );
}
