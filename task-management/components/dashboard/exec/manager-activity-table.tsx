"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, Loader2, Maximize2, Minimize2, Users } from "lucide-react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { getManagerActivityBoard } from "@/app/(app)/dashboard/manager-activity-actions";
import {
  ACTIVITY_TARGETS,
  type ActivitySplit,
  type ManagerActivityBoard,
  type ManagerActivityRow,
  type MemberActivityRow,
} from "@/lib/queries/manager-activity-board";

/* ────────────────────────────────────────────────────────────────────────
   ManagerActivityTable — one row per manager across the three activity
   families (weekly goals, WMS tasks, daily commitments), each expanding to a
   per-member breakdown of DELEGATE (A) / COUNTERPART (B) / G.T.

   Sits beside the initiation scorecards and deliberately borrows their frame:
   the same white card, the same 600px scroll box, the same fullscreen control.
   The two answer different questions off the same hierarchy — "who is
   delegating tasks" vs "what is everyone actually carrying" — so reading them
   as one surface matters more than either one's own styling.

   A and B partition every item (see manager-activity-board.ts), so G.T. is a
   real total and the manager row is a plain sum of its members. No cell is a
   percentage of another cell; every number here is a count.
   ──────────────────────────────────────────────────────────────────────── */

/* Project threshold convention: green >=100 · amber >=60 · red below. */
const GREEN = "var(--color-green-deep)";
const AMBER = "var(--color-amber-deep)";
const RED = "var(--color-altus-red)";

function attainColor(actual: number, target: number): string {
  const pct = target > 0 ? (actual / target) * 100 : actual > 0 ? 100 : 0;
  if (pct >= 100) return GREEN;
  if (pct >= 60) return AMBER;
  return RED;
}

/** The three families, in the column order the header declares them. */
const FAMILIES = [
  { key: "goals", label: "WKM Goals", target: ACTIVITY_TARGETS.goals, type: "goals" },
  { key: "tasks", label: "WMS Tasks", target: ACTIVITY_TARGETS.tasks, type: "tasks" },
  {
    key: "commitments",
    label: "Daily Commitments",
    target: ACTIVITY_TARGETS.commitments,
    type: "commitments",
  },
] as const;

type FamilyKey = (typeof FAMILIES)[number]["key"];

/** Periods the board can be read over. */
const PERIODS = [
  { id: 3, label: "Last 3 Days" },
  { id: 7, label: "Last 7 Days" },
] as const;

/** Numeric cell — tabular so the columns align down the whole table. */
function Num({ value, hero = false }: { value: number; hero?: boolean }) {
  return (
    <span
      className="tabular-nums leading-none"
      style={{
        fontFamily: "var(--font-display), system-ui, sans-serif",
        fontWeight: hero ? 900 : 700,
        fontSize: hero ? 17 : 14,
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

/**
 * A count that links into the tasks table, pre-filtered to the manager, the
 * member and the family that was clicked.
 *
 * A zero renders inert. Offering a click that lands on an empty list is worse
 * than not offering one — the reader learns nothing and loses their place.
 */
function CountLink({
  value,
  managerId,
  doerId,
  type,
  label,
  hero = false,
}: {
  value: number;
  managerId: string;
  doerId: string;
  type: FamilyKey;
  label: string;
  hero?: boolean;
}) {
  if (value === 0) return <Num value={0} hero={hero} />;
  const href = `/tasks?manager=${managerId}&doer=${doerId}&type=${type}` as Route;
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      title={label}
      className="inline-block rounded-md px-1.5 py-0.5 transition-colors hover:bg-gray-100"
    >
      <Num value={value} hero={hero} />
    </Link>
  );
}

const HEAD_CELL =
  "px-2 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-gray-500";

/** One manager's row plus its expandable member breakdown. */
function ManagerRow({
  row,
  resolveAvatar,
}: {
  row: ManagerActivityRow;
  resolveAvatar: (id: string) => string | null;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <tr className="border-b border-gray-100 transition-colors hover:bg-gray-50/80">
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-2.5">
            <Avatar name={row.managerName} avatarUrl={resolveAvatar(row.managerId)} size={30} />
            <span className="min-w-0">
              <span
                className="block truncate text-[13.5px] font-bold"
                style={{ color: "var(--color-ink-strong)" }}
                title={row.managerName}
              >
                {row.managerName}
              </span>
              <span className="block text-[11px] font-semibold text-ink-subtle">
                {row.directReports} direct {row.directReports === 1 ? "report" : "reports"}
              </span>
            </span>
          </span>
        </td>

        {FAMILIES.map((f) => {
          const actual = row[f.key];
          return (
            <td key={f.key} className="px-2 py-2.5 text-center">
              <CountLink
                value={actual}
                managerId={row.managerId}
                doerId={row.managerId}
                type={f.key}
                label={`Open ${f.label} for ${row.managerName}'s team`}
              />
              {/* Target is a flat baseline, not a computed figure -- the colour
                  is the only thing carrying attainment, so it has to be on the
                  denominator where the eye already is. */}
              <span
                className="ml-1 text-[11px] font-bold tabular-nums"
                style={{ color: attainColor(actual, f.target) }}
              >
                /{f.target}
              </span>
            </td>
          );
        })}

        <td className="px-2 py-2.5 text-center">
          <Num value={row.total} hero />
        </td>

        <td className="px-2 py-2.5 text-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} the breakdown for ${row.managerName}`}
            title={open ? "Hide breakdown" : "Show breakdown"}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-bold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            Breakdown
            <ChevronDown
              size={13}
              strokeWidth={2.6}
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </button>
        </td>
      </tr>

      {open && (
        <tr>
          {/* One cell spanning the parent row: the nested table has its own
              column rhythm (nine narrow numeric columns), and forcing it into
              the parent's six would squeeze both. */}
          <td colSpan={FAMILIES.length + 3} className="bg-gray-50/60 px-3 py-3">
            <MemberBreakdown
              members={row.members}
              managerId={row.managerId}
              resolveAvatar={resolveAvatar}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** Self first, then every direct report, each split A / B / G.T. per family. */
function MemberBreakdown({
  members,
  managerId,
  resolveAvatar,
}: {
  members: MemberActivityRow[];
  managerId: string;
  resolveAvatar: (id: string) => string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full border-collapse">
        <thead>
          {/* Two header rows: the family spans its three sub-columns, so "A"
              and "B" are never read without knowing what they are counting. */}
          <tr className="border-b border-gray-100">
            <th className={`${HEAD_CELL} text-left`} rowSpan={2}>
              Member
            </th>
            {FAMILIES.map((f) => (
              <th key={f.key} className={`${HEAD_CELL} border-l border-gray-100 text-center`} colSpan={3}>
                {f.label}
              </th>
            ))}
            <th className={`${HEAD_CELL} border-l border-gray-100 text-center`} rowSpan={2}>
              Total
            </th>
          </tr>
          <tr className="border-b border-gray-200">
            {FAMILIES.map((f) => (
              <React.Fragment key={f.key}>
                <th className={`${HEAD_CELL} border-l border-gray-100 text-center`} title="Delegated by this manager">
                  A
                </th>
                <th className={`${HEAD_CELL} text-center`} title="Originated by anyone else">
                  B
                </th>
                <th className={`${HEAD_CELL} text-center`}>G.T.</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((mem) => (
            <tr key={mem.employeeId} className="border-b border-gray-100 last:border-b-0">
              <td className="px-3 py-1.5">
                <span className="flex items-center gap-2.5">
                  <Avatar
                    name={mem.employeeName}
                    avatarUrl={resolveAvatar(mem.employeeId)}
                    size={24}
                  />
                  <span
                    className="truncate text-[12.5px] font-bold"
                    style={{ color: "var(--color-ink-strong)" }}
                    title={mem.employeeName}
                  >
                    {mem.isSelf ? "Self" : mem.employeeName}
                  </span>
                  {mem.isSelf && (
                    <span className="shrink-0 rounded-pill bg-gray-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      {mem.employeeName}
                    </span>
                  )}
                </span>
              </td>

              {FAMILIES.map((f) => {
                const split: ActivitySplit = mem[f.key];
                return (
                  <React.Fragment key={f.key}>
                    <td className="border-l border-gray-100 px-2 py-1.5 text-center">
                      <CountLink
                        value={split.delegate}
                        managerId={managerId}
                        doerId={mem.employeeId}
                        type={f.key}
                        label={`${f.label} delegated to ${mem.employeeName}`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <CountLink
                        value={split.counterpart}
                        managerId={managerId}
                        doerId={mem.employeeId}
                        type={f.key}
                        label={`${f.label} for ${mem.employeeName} from anyone else`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Num value={split.total} />
                    </td>
                  </React.Fragment>
                );
              })}

              <td className="border-l border-gray-100 px-2 py-1.5 text-center">
                <Num value={mem.grandTotal} hero />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ManagerActivityTable({
  avatarById = {},
}: {
  avatarById?: Record<string, string | null>;
}) {
  const [windowDays, setWindowDays] = React.useState<3 | 7>(7);
  const [full, setFull] = React.useState(false);
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ok"; board: ManagerActivityBoard }
  >({ kind: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void getManagerActivityBoard(windowDays).then((res) => {
      if (cancelled) return;
      if ("error" in res) setState({ kind: "error", message: res.error });
      else setState({ kind: "ok", board: res });
    });
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  // Esc exits fullscreen, and the page behind must not scroll while it is up.
  React.useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [full]);

  const resolveAvatar = React.useCallback(
    (id: string) => avatarById[id] ?? null,
    [avatarById],
  );

  const controls = (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="activity-period">
        Period
      </label>
      <select
        id="activity-period"
        value={windowDays}
        onChange={(e) => setWindowDays(Number(e.target.value) as 3 | 7)}
        className="h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-bold text-gray-700 outline-none transition-colors hover:border-gray-300 focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
      >
        {PERIODS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setFull((v) => !v)}
        aria-label={full ? "Exit fullscreen" : "Open fullscreen"}
        title={full ? "Exit fullscreen (Esc)" : "Fullscreen"}
        className="grid size-9 cursor-pointer place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        {full ? <Minimize2 size={15} strokeWidth={2.4} /> : <Maximize2 size={15} strokeWidth={2.4} />}
      </button>
    </div>
  );

  const body = (
    <>
      {state.kind === "loading" && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 size={18} className="animate-spin" strokeWidth={2.4} />
          <span className="text-[13.5px] font-semibold">Loading activity…</span>
        </div>
      )}

      {state.kind === "error" && (
        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
          <p className="text-[14px] font-bold text-ink-soft">Could not load the activity board</p>
          <p className="max-w-[320px] text-[12.5px] font-semibold text-ink-subtle">
            {state.message}
          </p>
        </div>
      )}

      {state.kind === "ok" && state.board.rows.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
          <Users size={22} strokeWidth={2} className="text-gray-400" />
          <p className="text-[14px] font-bold text-ink-soft">No managers with direct reports yet</p>
          <p className="max-w-[280px] text-[12.5px] font-semibold text-ink-subtle">
            Assign reporting lines in Admin → Employees to populate this board.
          </p>
        </div>
      )}

      {state.kind === "ok" && state.board.rows.length > 0 && (
        /* The 600px scroll box, matching the scorecard widget beside it. In
           fullscreen the cap is lifted -- a 600px window inside a viewport-sized
           overlay is the one place it stops helping. */
        <div className={full ? "overflow-y-auto" : "max-h-[600px] overflow-y-auto"}>
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: "#f9fafb" }}>
              <tr>
                <th className={`${HEAD_CELL} text-left`}>Manager / Initiator</th>
                {FAMILIES.map((f) => (
                  <th key={f.key} className={`${HEAD_CELL} text-center`}>
                    {f.label}
                  </th>
                ))}
                <th className={`${HEAD_CELL} text-center`}>G.T.</th>
                <th className={`${HEAD_CELL} text-center`}>Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {state.board.rows.map((row) => (
                <ManagerRow key={row.managerId} row={row} resolveAvatar={resolveAvatar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const header = (
    <div className="mb-3 flex items-start justify-between gap-3 max-md:flex-col">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.09em] text-ink-subtle">
          <Users size={12} strokeWidth={2.8} />
          Managers · Activity Board
        </span>
        <h3
          className="mt-0.5 text-[20px] font-black leading-tight"
          style={{
            color: "var(--color-ink-strong)",
            fontFamily: "var(--font-display), system-ui, sans-serif",
          }}
        >
          What each team is carrying
        </h3>
        <p className="mt-0.5 text-[12.5px] font-semibold text-ink-subtle">
          Targets: {ACTIVITY_TARGETS.goals} goals · {ACTIVITY_TARGETS.tasks} tasks ·{" "}
          {ACTIVITY_TARGETS.commitments} commitments
        </p>
      </div>
      {controls}
    </div>
  );

  if (full && typeof document !== "undefined") {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manager activity board"
        className="fixed inset-0 z-[80] overflow-y-auto bg-white p-8 max-md:p-4"
      >
        {header}
        {body}
      </div>,
      document.body,
    );
  }

  return (
    <section className="relative min-w-0" aria-label="Manager activity board">
      {header}
      <div
        className="wms-card w-full max-w-none overflow-hidden rounded-2xl bg-white shadow-xs"
        style={{ border: "1px solid var(--color-hairline)" }}
      >
        {body}
      </div>
    </section>
  );
}
