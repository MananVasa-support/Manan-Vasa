"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Sparkles, ChevronLeft, ChevronRight, Users } from "lucide-react";

import { OnTimeGauge } from "@/components/dashboard/exec/on-time-gauge";
import { ManagerInitiatorCard } from "@/components/dashboard/exec/manager-initiator-card";
import { NotApprovedSidebar } from "@/components/dashboard/exec/not-approved-sidebar";
import { PerformanceByPersonTable } from "@/components/dashboard/exec/performance-by-person-table";
import { ManagerDrilldown } from "@/components/dashboard/exec/manager-drilldown";
import { useReducedMotion } from "@/lib/motion-utils";
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

export function ExecDashboard({
  doneOnTime,
  initiator,
  notApprovedAging,
  avatarById,
  isAdmin,
  meId,
}: ExecDashboardProps) {
  const reduce = useReducedMotion() ?? false;

  const [windowKey, setWindowKey] = React.useState<WindowKey>("d7");
  const [openManagerId, setOpenManagerId] = React.useState<string | null>(null);

  const resolveAvatar = React.useCallback(
    (employeeId: string): string | null => avatarById[employeeId] ?? null,
    [avatarById],
  );

  const board = initiator[windowKey];

  // Privacy: admins see every manager card; a non-admin sees only their own
  // (filtered to meId; a null meId resolves to none).
  const managers = React.useMemo(
    () =>
      isAdmin
        ? board.managers
        : board.managers.filter((m) => m.managerId === meId),
    [board.managers, isAdmin, meId],
  );

  const windowDays: 3 | 7 = windowKey === "d3" ? 3 : 7;

  // Global empty state: nothing to show anywhere on the surface.
  const peopleRows = doneOnTime.revised.byPerson;
  const nothingAtAll =
    managers.length === 0 &&
    doneOnTime.revised.dated === 0 &&
    doneOnTime.original.dated === 0 &&
    notApprovedAging.total === 0 &&
    peopleRows.length === 0;

  // Staggered entrance helper (reduced-motion-gated → final state, no anim).
  const rise = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div
      className="relative isolate overflow-hidden rounded-section"
      style={{
        background:
          "linear-gradient(160deg, #FBF7F0 0%, #F4EEE3 56%, #F1E9DB 100%)",
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      {/* ── Aurora / gradient-mesh backdrop (GPU-only, decorative) ── */}
      <span aria-hidden className="kpi-strip-mesh" />
      <span aria-hidden className="kpi-strip-grain" />

      <div className="relative z-[2] flex flex-col gap-7 p-8 max-md:gap-5 max-md:p-4">
        {/* ── Masthead + window toggle ── */}
        <motion.header
          {...rise(0)}
          className="flex items-end justify-between gap-5 max-md:flex-col max-md:items-stretch max-md:gap-4"
        >
          <div className="min-w-0">
            <p
              className="inline-flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.18em]"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              <Sparkles size={13} strokeWidth={2.6} />
              Executive Control Room
            </p>
            <h1
              className="mt-1 leading-none text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 30,
                letterSpacing: "-0.03em",
              }}
            >
              Delivery &amp; Delegation
            </h1>
            <p className="mt-2 text-[13px] font-semibold text-ink-subtle">
              Target ={" "}
              <span className="tabular-nums font-black text-ink-soft">
                3 × {board.workingDays}
              </span>{" "}
              working {board.workingDays === 1 ? "day" : "days"} × direct reports
            </p>
          </div>

          <WindowToggle value={windowKey} onChange={setWindowKey} />
        </motion.header>

        {/* ── TOP region: gauge · manager cards rail · attention sidebar ── */}
        <motion.div
          {...rise(0.08)}
          className="grid gap-6 max-md:gap-4"
          style={{ gridTemplateColumns: "minmax(0,1fr)" }}
        >
          <div className="exec-top-grid grid gap-6 max-md:gap-4">
            {/* LEFT — gauge */}
            <OnTimeGauge data={doneOnTime} />

            {/* CENTER — horizontally-scrollable, snap-able manager rail */}
            <ManagerRail
              managers={managers}
              resolveAvatar={resolveAvatar}
              onOpenDrilldown={setOpenManagerId}
              workingDays={board.workingDays}
            />

            {/* RIGHT — attention-required sidebar */}
            <NotApprovedSidebar
              data={notApprovedAging}
              isAdmin={isAdmin}
              meId={meId}
              resolveAvatar={resolveAvatar}
            />
          </div>
        </motion.div>

        {/* ── Global empty state (only when truly nothing to show) ── */}
        {nothingAtAll ? (
          <motion.div {...rise(0.16)}>
            <GlobalEmptyState />
          </motion.div>
        ) : (
          /* ── BELOW: full-width performance-by-person table ── */
          <motion.div {...rise(0.16)}>
            <PerformanceByPersonTable
              people={peopleRows}
              isAdmin={isAdmin}
              meId={meId}
              resolveAvatar={resolveAvatar}
            />
          </motion.div>
        )}
      </div>

      {/* Top region: side-by-side on wide screens, stacks on mobile. */}
      <style>{`
        .exec-top-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 1100px) {
          .exec-top-grid {
            grid-template-columns: minmax(320px, 0.95fr) minmax(0, 1.5fr) minmax(300px, 0.95fr);
            align-items: start;
          }
        }
      `}</style>

      {/* Drill-down modal — rendered once; fetches on demand only. */}
      <ManagerDrilldown
        managerId={openManagerId}
        windowDays={windowDays}
        onClose={() => setOpenManagerId(null)}
      />
    </div>
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
}: {
  managers: InitiatorBoard["managers"];
  resolveAvatar: (employeeId: string) => string | null;
  onOpenDrilldown: (managerId: string) => void;
  workingDays: number;
}) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  function nudge(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(420, el.clientWidth * 0.9), behavior: "smooth" });
  }

  if (managers.length === 0) {
    return (
      <section
        className="wg-rise relative flex min-h-[220px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-section p-7 text-center max-md:p-5"
        aria-label="Manager initiation scorecards"
        style={{
          background:
            "linear-gradient(155deg, color-mix(in srgb, #ffffff 80%, transparent) 0%, color-mix(in srgb, var(--color-surface-card) 90%, transparent) 100%)",
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
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <p className="text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          Managers · initiation scorecards
          <span className="ml-2 font-bold tabular-nums text-ink-subtle/80">
            {managers.length}
          </span>
        </p>
        {managers.length > 1 && (
          <div className="flex items-center gap-1.5 max-md:hidden">
            <RailArrow dir={-1} onClick={() => nudge(-1)} />
            <RailArrow dir={1} onClick={() => nudge(1)} />
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        className="exec-rail flex gap-4 overflow-x-auto pb-2"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {managers.map((m) => (
          <div
            key={m.managerId}
            className="shrink-0"
            style={{
              scrollSnapAlign: "start",
              // Single card fills the rail; multiple cards become a snap rail.
              width: managers.length === 1 ? "100%" : "min(420px, 86vw)",
            }}
          >
            <ManagerInitiatorCard
              scorecard={m}
              avatarUrl={resolveAvatar(m.managerId)}
              resolveAvatar={resolveAvatar}
              onOpenDrilldown={onOpenDrilldown}
            />
          </div>
        ))}
      </div>

      <p className="mt-1 px-1 text-[11px] font-semibold text-ink-subtle">
        Target ={" "}
        <span className="tabular-nums font-black">3 × {workingDays}</span> per
        direct report
      </p>

      <style>{`
        .exec-rail { scrollbar-width: thin; }
        .exec-rail::-webkit-scrollbar { height: 8px; }
        .exec-rail::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--color-altus-red) 22%, transparent);
          border-radius: 999px;
        }
        .exec-rail::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </section>
  );
}

function RailArrow({
  dir,
  onClick,
}: {
  dir: -1 | 1;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === -1 ? "Scroll managers left" : "Scroll managers right"}
      className="wg-btn grid size-8 place-items-center rounded-full border"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background: "var(--color-surface-card)",
        color: "var(--color-ink-soft)",
      }}
    >
      {dir === -1 ? (
        <ChevronLeft size={16} strokeWidth={2.6} />
      ) : (
        <ChevronRight size={16} strokeWidth={2.6} />
      )}
    </button>
  );
}

/* ───────────────────────────── Global empty state ─────────────────────── */

function GlobalEmptyState() {
  return (
    <section
      className="wg-rise relative flex flex-col items-center justify-center gap-2.5 overflow-hidden rounded-section p-12 text-center max-md:p-8"
      style={{
        background:
          "linear-gradient(155deg, color-mix(in srgb, #ffffff 84%, transparent) 0%, color-mix(in srgb, var(--color-surface-card) 92%, transparent) 100%)",
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
