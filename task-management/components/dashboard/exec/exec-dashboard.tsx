"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Users } from "lucide-react";

import { OnTimeGauge } from "@/components/dashboard/exec/on-time-gauge";
import { ManagerInitiatorTable } from "@/components/dashboard/exec/manager-initiator-table";
import { NotApprovedSidebar } from "@/components/dashboard/exec/not-approved-sidebar";
import { PerformanceByPersonTable } from "@/components/dashboard/exec/performance-by-person-table";
import { ManagerDrilldown } from "@/components/dashboard/exec/manager-drilldown";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { CollapseToggle } from "@/components/dashboard/section-chrome";
import { useReducedMotion } from "@/lib/motion-utils";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import type {
  DoneOnTime,
  InitiatorBoard,
  NotApprovedAging,
} from "@/lib/types";

/* ────────────────────────────────────────────────────────────────────────
   ExecDashboard — the V2 "control room" container.

   The single client island that assembles the executive surface: it owns the
   `3-day ⇄ 7-day` initiator window, the open-manager drill-down modal, and the
   avatar resolver passed to every child. It composes Task 7–10 viz over a calm
   aurora/gradient-mesh backdrop with staggered entrances.

   Privacy (mirrors the shipped sections): admins see all manager cards; a
   non-admin sees ONLY their own (filtered to `meId`; null meId → none). The
   children apply the same rule to their own rosters.

   Brand discipline (altus-premium-ui): cream canvas, Altus-red tokens +
   color-mix tints, --font-display headings with tabular-nums, the .wg-rise
   staggered entrance, motion/react springs — all reduced-motion-gated. Add
   zero new load-path queries; the drill-down fetches on demand only.
   ──────────────────────────────────────────────────────────────────────── */

type WindowKey = "d3" | "d7";

export interface ExecDashboardProps {
  doneOnTime: DoneOnTime;
  initiator: { d3: InitiatorBoard; d7: InitiatorBoard };
  notApprovedAging: NotApprovedAging;
  avatarById: Record<string, string | null>;
  isAdmin: boolean;
  meId: string | null;
}

/* ────────────────────────────────────────────────────────────────────────
   The control room used to be ONE card holding, in order: the summary row
   (on-time gauge + attention sidebar), the delegation scorecard, and the
   performance table. The dashboard now interleaves other sections between
   those three (Status by Employee and the Aging Heatmap sit between Overdue
   Tasks and the Delegation Scorecard), so a single card can no longer express
   the order.

   Rather than duplicate the window state, the privacy filter and the search
   filter into three components, `ExecDashboard` became a PROVIDER: it still
   takes exactly the same props and does exactly the same derivation, then
   hands it to three placeable sections through context. Page order is now
   whatever order those sections are written in.
   ──────────────────────────────────────────────────────────────────────── */

type ExecCtxValue = {
  rise: (delay: number) => Record<string, unknown>;
  resolveAvatar: (employeeId: string) => string | null;
  windowKey: WindowKey;
  setWindowKey: (k: WindowKey) => void;
  board: InitiatorBoard;
  managers: InitiatorBoard["managers"];
  doneOnTimeView: DoneOnTime;
  notApprovedAgingView: NotApprovedAging;
  peopleRows: DoneOnTime["revised"]["byPerson"];
  nothingAtAll: boolean;
  isAdmin: boolean;
  meId: string | null;
  setOpenManagerId: (id: string | null) => void;
};

const ExecCtx = React.createContext<ExecCtxValue | null>(null);

function useExec(): ExecCtxValue {
  const ctx = React.useContext(ExecCtx);
  if (!ctx) {
    throw new Error(
      "Exec dashboard sections must be rendered inside <ExecDashboard>.",
    );
  }
  return ctx;
}

/* The `ExecCard` shell that used to wrap each exec section is gone. Every one
   of these sections renders a card of its own (the overdue table, the manager
   scorecard table, the two summary panels), so the shell was a white box around
   a white box — and once section headings moved OUTSIDE their cards it would
   have put them straight back inside one. */

export function ExecDashboard({
  doneOnTime,
  initiator,
  notApprovedAging,
  avatarById,
  isAdmin,
  meId,
  children,
}: ExecDashboardProps & { children: React.ReactNode }) {
  const reduce = useReducedMotion() ?? false;

  const [windowKey, setWindowKey] = React.useState<WindowKey>("d7");
  const [openManagerId, setOpenManagerId] = React.useState<string | null>(null);

  const resolveAvatar = React.useCallback(
    (employeeId: string): string | null => avatarById[employeeId] ?? null,
    [avatarById],
  );

  const board = initiator[windowKey];

  // FilterBar section search — narrows the delivery + delegation panels to the
  // people whose names match. Applied AFTER the privacy filter below so search
  // can never widen what a non-admin is allowed to see.
  const sectionQuery = useSectionSearch();

  // Privacy: admins see every manager card; a non-admin sees only their own
  // (filtered to meId; a null meId resolves to none).
  const managers = React.useMemo(() => {
    const visible = isAdmin
      ? board.managers
      : board.managers.filter((m) => m.managerId === meId);
    if (!sectionQuery) return visible;
    // A manager stays if their own name matches OR one of their reports does,
    // so searching a report surfaces the card that actually contains them.
    return visible.filter(
      (m) =>
        matchesSearch(sectionQuery, m.managerName) ||
        m.perReport.some((r) => matchesSearch(sectionQuery, r.employeeName)),
    );
  }, [board.managers, isAdmin, meId, sectionQuery]);

  // Delivery panels are keyed by person, so filter their `byPerson` rows. The
  // headline totals are left alone on purpose — they describe the whole team,
  // and recomputing them from a text search would misreport the org's numbers.
  const doneOnTimeView = React.useMemo(() => {
    if (!sectionQuery) return doneOnTime;
    const narrow = (b: typeof doneOnTime.revised) => ({
      ...b,
      byPerson: b.byPerson.filter((p) => matchesSearch(sectionQuery, p.employeeName)),
    });
    return { original: narrow(doneOnTime.original), revised: narrow(doneOnTime.revised) };
  }, [doneOnTime, sectionQuery]);

  const notApprovedAgingView = React.useMemo(() => {
    if (!sectionQuery) return notApprovedAging;
    return {
      ...notApprovedAging,
      byPerson: notApprovedAging.byPerson.filter((p) =>
        matchesSearch(sectionQuery, p.employeeName),
      ),
    };
  }, [notApprovedAging, sectionQuery]);

  const windowDays: 3 | 7 = windowKey === "d3" ? 3 : 7;

  // Global empty state: nothing to show anywhere on the surface. Reads the
  // FILTERED views, so a search matching nobody collapses to the same calm
  // empty state instead of a page of zeroed-out panels.
  const peopleRows = doneOnTimeView.revised.byPerson;
  const nothingAtAll =
    managers.length === 0 &&
    (sectionQuery
      ? peopleRows.length === 0 && notApprovedAgingView.byPerson.length === 0
      : doneOnTime.revised.dated === 0 &&
        doneOnTime.original.dated === 0 &&
        notApprovedAging.total === 0 &&
        peopleRows.length === 0);

  // Staggered entrance helper (reduced-motion-gated → final state, no anim).
  const rise = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
        };

  const ctx: ExecCtxValue = {
    rise,
    resolveAvatar,
    windowKey,
    setWindowKey,
    board,
    managers,
    doneOnTimeView,
    notApprovedAgingView,
    peopleRows,
    nothingAtAll,
    isAdmin,
    meId,
    setOpenManagerId,
  };

  return (
    <ExecCtx.Provider value={ctx}>
      {children}

      {/* Summary: ONE full-width column at every breakpoint. These were two
          half-width panels side-by-side, which left "Delivered on time" a
          narrow well around a fixed-width gauge while "Attention Required"
          filled its column — the two read as different weights. Stacked
          full-bleed, both cards get the same structural width. */}
      <style>{`
        .exec-summary-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      `}</style>

      {/* Drill-down modal — rendered ONCE for the whole surface (not per
          section); fetches on demand only. */}
      <ManagerDrilldown
        managerId={openManagerId}
        windowDays={windowDays}
        onClose={() => setOpenManagerId(null)}
      />
    </ExecCtx.Provider>
  );
}

/**
 * OVERDUE TASKS — the per-person table (formerly "Performance by Person").
 * Also carries the global empty state, exactly as it did when this was the
 * last block of the single card.
 */
export function ExecOverdueSection() {
  const { rise, peopleRows, isAdmin, meId, resolveAvatar, nothingAtAll } = useExec();
  // No <ExecCard> wrapper: PerformanceByPersonTable is itself a card, and its
  // section header now sits ABOVE that card. Keeping the outer frame would put
  // the header back inside a white box — the thing this layout removes.
  return nothingAtAll ? (
    <motion.div {...rise(0)}>
      <GlobalEmptyState />
    </motion.div>
  ) : (
    <motion.div {...rise(0)}>
      <PerformanceByPersonTable
        people={peopleRows}
        isAdmin={isAdmin}
        meId={meId}
        resolveAvatar={resolveAvatar}
      />
    </motion.div>
  );
}

/**
 * DELEGATION SCORECARD — manager initiation breakdown (% of target, target
 * ratio, per-report rows).
 *
 * The masthead and the 3-day ⇄ 7-day toggle live HERE because the window only
 * ever drove this section: `board`/`managers` and the drill-down's
 * `windowDays`. The gauge and the attention list are window-independent.
 */
export function ExecDelegationSection() {
  const { rise, board, windowKey, setWindowKey, managers, resolveAvatar, setOpenManagerId } =
    useExec();
  // ONE header for this section. It used to carry two: an "Executive Control
  // Room / Delivery & Delegation" masthead in the card, and the scorecard title
  // above the table. Both said the same thing at two different sizes, so they
  // are merged here — eyebrow, title and the target line that was the
  // masthead's subtitle — and the card below holds only the table.
  return (
    <motion.section {...rise(0)} aria-label="Managers initiation scorecards">
      <ManagerRail
        managers={managers}
        resolveAvatar={resolveAvatar}
        onOpenDrilldown={setOpenManagerId}
        workingDays={board.workingDays}
        windowToggle={<WindowToggle value={windowKey} onChange={setWindowKey} />}
      />
    </motion.section>
  );
}

/** DELIVERED ON TIME & ATTENTION REQUIRED — the summary row. */
export function ExecSummarySection() {
  const { rise, doneOnTimeView, notApprovedAgingView, isAdmin, meId, resolveAvatar } =
    useExec();
  // Two cards side by side, each carrying its own header ABOVE its own white
  // box. No <ExecCard> frame — it would put both headers back inside a card.
  return (
    <motion.div {...rise(0)} className="exec-summary-grid grid gap-6 max-md:gap-4">
      <OnTimeGauge data={doneOnTimeView} />
      <NotApprovedSidebar
        data={notApprovedAgingView}
        isAdmin={isAdmin}
        meId={meId}
        resolveAvatar={resolveAvatar}
      />
    </motion.div>
  );
}

/* ─────────────────── Window toggle (3-day ⇄ 7-day) ─────────────────────── */

function WindowToggle({
  value,
  onChange,
}: {
  value: WindowKey;
  onChange: (k: WindowKey) => void;
}) {
  const options: { id: WindowKey; label: string }[] = [
    { id: "d3", label: "3-day" },
    { id: "d7", label: "7-day" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Initiator window"
      className="inline-flex shrink-0 items-center gap-1 rounded-chip border p-1"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background: "color-mix(in srgb, var(--color-surface-card) 88%, transparent)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      {options.map((o) => {
        const isActive = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(o.id)}
            className="rounded-pill px-5 py-2 font-bold transition-all duration-200 max-md:flex-1"
            style={{
              fontSize: 13.5,
              background: isActive
                ? "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))"
                : "transparent",
              color: isActive ? "#ffffff" : "var(--color-ink-muted)",
              boxShadow: isActive ? "0 6px 16px -6px rgba(168,4,0,0.55)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────── Horizontally-scrollable manager rail ──────────────── */

function ManagerRail({
  managers,
  resolveAvatar,
  onOpenDrilldown,
  workingDays,
  windowToggle,
}: {
  managers: InitiatorBoard["managers"];
  resolveAvatar: (employeeId: string) => string | null;
  onOpenDrilldown: (managerId: string) => void;
  workingDays: number;
  /** The 3-day ⇄ 7-day switch, rendered in the section header's action slot. */
  windowToggle?: React.ReactNode;
}) {
  // No pager: the whole leaderboard lives in one scroll container, so "who is
  // behind?" is answered by scrolling one list instead of hunting across pages.
  // Minimised collapses the body to the header row — a way to park this section
  // without losing your place further down the dashboard.
  const [minimized, setMinimized] = React.useState(false);

  if (managers.length === 0) {
    return (
      <section
        className="wg-rise relative flex min-h-[220px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-section p-7 text-center max-md:p-5"
        aria-label="Manager initiation scorecards"
        style={{
          // Opaque white — the old gradient was semi-transparent, so the page
          // wash bled through and tinted this panel.
          background: "#ffffff",
          border: "1px dashed var(--color-hairline-strong)",
        }}
      >
        <span
          className="inline-flex size-12 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--color-ink-subtle) 12%, transparent)",
            color: "var(--color-ink-subtle)",
          }}
        >
          <Users size={22} strokeWidth={2.2} />
        </span>
        <p className="text-[14px] font-bold text-ink-soft">
          No managers with direct reports yet
        </p>
        <p className="max-w-[260px] text-[12.5px] font-semibold text-ink-subtle">
          Assign reporting lines in Admin → Employees to see initiation scorecards.
        </p>
      </section>
    );
  }

  return (
    <section className="relative min-w-0" aria-label="Manager initiation scorecards">
      {/* The section's only header, above the table's white box. It absorbed
          the "Delivery & Delegation" masthead that used to sit in the card
          above it — same eyebrow, same target line, one heading. */}
      <DashboardSectionHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Users size={12} strokeWidth={2.8} />
            Managers · Initiation Scorecards
            <span
              className="rounded-pill px-1.5 py-0.5 font-bold tabular-nums"
              style={{
                fontSize: 10,
                background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
              }}
            >
              {managers.length}
            </span>
          </span>
        }
        title="Who is delegating, and how much"
        subtitle={
          <>
            Target ={" "}
            <span className="font-semibold tabular-nums text-gray-900">
              3 × {workingDays}
            </span>{" "}
            working {workingDays === 1 ? "day" : "days"} per direct report
          </>
        }
        actions={
          <>
            {windowToggle}
            {/* Was a bespoke button here; swapped for the shared control so
                every section's fold toggle looks and behaves identically. */}
            <CollapseToggle
              expanded={!minimized}
              onToggle={() => setMinimized((v) => !v)}
              label="the manager scorecards"
            />
          </>
        }
      />

      {/* One row per manager instead of one tile each: delegation is a
          leaderboard question, and a table puts every manager's channel split on
          the same axis so they can be read against each other at a glance. Rows
          expand in place to the per-report breakdown. */}
      <ManagerInitiatorTable
        managers={managers}
        resolveAvatar={resolveAvatar}
        onOpenDrilldown={onOpenDrilldown}
        minimized={minimized}
      />
    </section>
  );
}

/* ───────────────────────────── Global empty state ─────────────────────── */

function GlobalEmptyState() {
  return (
    <section
      className="wg-rise relative flex flex-col items-center justify-center gap-2.5 overflow-hidden rounded-section p-12 text-center max-md:p-8"
      style={{
        // Opaque white — see the sibling empty state above.
        background: "#ffffff",
        border: "1px dashed var(--color-hairline-strong)",
      }}
    >
      <span
        className="inline-flex size-14 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-altus-red) 11%, transparent)",
          color: "var(--color-altus-red)",
        }}
      >
        <Users size={26} strokeWidth={2.2} />
      </span>
      <h2
        className="text-ink-strong"
        style={{
          fontFamily: "var(--font-serif), serif",
          fontWeight: 700,
          fontSize: 21,
          letterSpacing: "-0.01em",
        }}
      >
        No managers with direct reports yet
      </h2>
      <p className="max-w-[360px] text-[13.5px] font-semibold text-ink-subtle">
        Assign reporting lines in Admin → Employees, and delivery &amp;
        delegation analytics will appear here.
      </p>
    </section>
  );
}
