"use client";
import * as React from "react";
import { ChevronRight, Crown, Inbox, Trophy } from "lucide-react";
import type { TopPerformer } from "@/lib/types";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { useCountUp } from "@/lib/use-count-up";
import { Avatar } from "@/components/ui/avatar";
import { DashboardSectionHeader } from "./section-header";
import { CollapseToggle, CollapsibleBody, DASHBOARD_CARD_PADDED } from "./section-chrome";
import { PerformerTaskDrawer } from "./performer-task-drawer";

/**
 * Top Performers — a two-column leaderboard: the podium (ranks 1-3) stacked
 * down the left, the runners-up (4+) as a list down the right.
 *
 * MEDAL STYLING KEYS OFF THE TRUE GLOBAL RANK, never the row's position in this
 * (possibly search-filtered) list. Filter to one person sitting 7th and they
 * keep a neutral chip — a gold badge claiming #1 would be a lie the filter
 * told. This is also why the split is `slice(0, 3)` on the FILTERED list but
 * every badge reads `performer.rank`: the columns describe position in what is
 * shown, the badges describe position in the standings.
 *
 * Clicking any card or row opens that person's completed-task drawer.
 */

/**
 * Podium treatment per TRUE rank — the medal pill, and the ring around the
 * avatar. Rank 4+ falls through to no badge at all.
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
 * ONE HOVER RECIPE, shared by the podium cards and the list rows so the two
 * columns respond identically to the pointer.
 *
 * No `dark:` variant: this app has no dark theme and none is configured in
 * globals.css, so `dark:hover:bg-slate-800/50` would darken the hover state
 * for anyone whose OS is in dark mode while the card under it stayed white and
 * its type stayed dark ink. Same reasoning as the note on DASHBOARD_CARD in
 * section-chrome.tsx.
 */
const ROW_HOVER =
  "cursor-pointer rounded-xl transition-colors hover:bg-slate-50 hover:border-slate-300";

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

  const podium = visible.slice(0, 3);
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
        <div className={`w-full max-w-none ${DASHBOARD_CARD_PADDED}`}>
          {visible.length === 0 ? (
            <EmptyState />
          ) : (
            /* 5 / 7 in twelfths — the same grid vocabulary as Delivered on
               Time, so the two sections' gutters line up down the page. The
               podium takes the narrower half: three cards carry less content
               per row than a list of six does. One column below `lg`, where
               a side-by-side split would leave neither half legible. */
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* ── LEFT — the podium, stacked ──────────────────────────── */}
              <div className="flex flex-col gap-3 lg:col-span-5">
                {podium.map((p, i) => (
                  <PodiumCard
                    key={p.employeeId}
                    performer={p}
                    stagger={i}
                    avatarUrl={avatarById[p.employeeId] ?? null}
                    onOpen={() => setDrill(p)}
                  />
                ))}
              </div>

              {/* ── RIGHT — everyone else, as a list ────────────────────── */}
              <div className="flex min-w-0 flex-col lg:col-span-7">
                {rest.length === 0 ? (
                  /* Reachable two ways: a roster of three or fewer, or a
                     search that matched only podium names. Saying so beats an
                     empty half-grid that reads as a failed render. */
                  <p className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-[12.5px] font-semibold text-slate-500">
                    No one outside the top three
                    {sectionQuery ? " matches this search." : " yet."}
                  </p>
                ) : (
                  <ol className="w-full">
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
              </div>
            </div>
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

/* ── Podium card (ranks 1-3) ────────────────────────────────────────────── */

function PodiumCard({
  performer,
  stagger,
  avatarUrl,
  onOpen,
}: {
  performer: TopPerformer;
  /** Position in the rendered column — only used to stagger the count-up. */
  stagger: number;
  avatarUrl?: string | null;
  onOpen: () => void;
}) {
  const medal = podiumFor(performer.rank);
  const animated = useCountUp(performer.doneCount, 900 + stagger * 120);
  const onTime = onTimeParts(performer);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${performer.employeeName}'s completed tasks — rank ${performer.rank}, ${performer.doneCount} completed`}
      className={`group relative block w-full border border-slate-200 bg-white p-4 text-left ${ROW_HOVER}`}
    >
      {/* Crown marks the TRUE #1 only — not whoever happens to sit at the top
          of a filtered column. */}
      {performer.rank === 1 && (
        <span aria-hidden className="absolute right-4 top-4 text-amber-400">
          <Crown size={20} strokeWidth={2.4} fill="currentColor" />
        </span>
      )}

      <span className="flex items-center gap-3">
        <Avatar
          name={performer.employeeName}
          avatarUrl={avatarUrl}
          size={44}
          className={medal ? `ring-2 ring-offset-2 ${medal.ring}` : undefined}
        />
        <span className="min-w-0">
          <span
            className="block truncate text-[14px] font-bold text-slate-900"
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
              <span className="inline-block max-w-[16ch] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {performer.department}
              </span>
            )}
          </span>
        </span>
      </span>

      {/* The card's numbers. Same three figures the list rows carry, so a
          podium card and a row below it can be read against each other. */}
      <span className="mt-3 flex items-baseline gap-2 border-t border-slate-100 pt-3">
        <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">
          {animated.toLocaleString("en-IN")}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          completed
        </span>
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] font-bold">
        <span className="text-emerald-600">
          {onTime.text} on time
          {onTime.detail && (
            <span className="ml-1 font-semibold text-slate-400">({onTime.detail})</span>
          )}
        </span>
        <span aria-hidden className="text-slate-300">
          ·
        </span>
        <span className="text-slate-500">{fmtDays(performer.avgTurnaroundDays)} avg</span>
      </span>
    </button>
  );
}

/* ── Runner-up row (rank 4+) ────────────────────────────────────────────── */

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
  const onTime = onTimeParts(performer);

  return (
    <li className="mb-3 last:mb-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${performer.employeeName}'s completed tasks — rank ${performer.rank}, ${performer.doneCount} completed`}
        className={`group flex w-full items-center justify-between gap-4 border border-slate-200 bg-white p-4 text-left ${ROW_HOVER}`}
      >
        {/* Left — rank · avatar · name · department */}
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold tabular-nums text-slate-700">
            {performer.rank}
          </span>
          <Avatar name={performer.employeeName} avatarUrl={avatarUrl} size={32} />
          <span className="min-w-0">
            <span
              className="block truncate text-[13.5px] font-bold text-slate-900"
              title={performer.employeeName}
            >
              {performer.employeeName}
            </span>
            {performer.department && (
              <span className="mt-0.5 inline-block max-w-[16ch] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {performer.department}
              </span>
            )}
          </span>
        </span>

        {/* Centre — completion bar + on-time rate. Hidden on small screens,
            where the name and the count are what matter. */}
        <span className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-slate-300 transition-all"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="w-24 shrink-0 text-right text-[12px] font-bold tabular-nums text-emerald-600">
            {onTime.text === "N/A" ? "N/A" : `${onTime.text} on time`}
          </span>
        </span>

        {/* Right — completed count + the drill-down chevron */}
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold tabular-nums text-emerald-700">
            {performer.doneCount.toLocaleString("en-IN")}
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
