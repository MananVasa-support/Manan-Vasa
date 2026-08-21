"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Users, CalendarDays } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { Avatar } from "@/components/ui/avatar";
import { getManagerActivityBoard } from "@/app/(app)/dashboard/manager-activity-actions";
// From the CONTRACT module, not the query module. The query module is
// `server-only`, and `ACTIVITY_TARGETS` is a value — importing it from there
// puts a real module edge into the client graph and fails the production build.
// The types alone would have been fine; the constant is what broke it.
import {
  type ActivityTargets,
  type ActivitySplit,
  type ManagerActivityBoard,
  type ManagerActivityRow,
  type MemberActivityRow,
  type ActivitySplitKey,
  type ActivityPeriod,
  ACTIVITY_PERIODS,
  DEFAULT_ACTIVITY_PERIOD,
} from "@/lib/dashboard/manager-activity-contract";
import { ActivityCellPopover, activityHref } from "./activity-cell-popover";
import { CollapseToggle, CollapsibleBody, DASHBOARD_CARD } from "../section-chrome";

/* ────────────────────────────────────────────────────────────────────────
   ManagerActivityTable — one row per manager across the three activity
   families (weekly goals, WMS tasks, daily commitments), each expanding to a
   per-member breakdown of DELEGATE (A) / COUNTERPART (B) / G.T.

   Sits beside the initiation scorecards and deliberately borrows their frame:
   the same white card and the same 600px scroll box, with a maximize control
   that expands it in place.
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
/** The three families, in the column order the header declares them. Targets
 *  are NOT here any more: they are pro-rated to the selected window, so they
 *  arrive with the board rather than being fixed at module scope. */
const FAMILIES = [
  { key: "goals", label: "WMS Goals" },
  { key: "tasks", label: "WMS Tasks" },
  { key: "commitments", label: "Daily Commitments" },
] as const;

type FamilyKey = (typeof FAMILIES)[number]["key"];

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
  memberId,
  memberName,
  category,
  categoryLabel,
  split,
  period,
  custom,
  hero = false,
}: {
  value: number;
  managerId: string;
  memberId: string;
  memberName: string;
  category: FamilyKey;
  categoryLabel: string;
  split: ActivitySplitKey;
  period: ActivityPeriod;
  /** Applied custom window, when the period is `custom`. Threaded so a
   *  preview can never be fetched over a different range than its cell. */
  custom?: { from: string; to: string } | null;
  hero?: boolean;
}) {
  // A zero renders inert, with NO popover and no link. Offering a hover that
  // resolves to "Nothing to show" and a click that lands on an empty list is
  // worse than offering neither.
  if (value === 0) return <Num value={0} hero={hero} />;
  return (
    <ActivityCellPopover
      managerId={managerId}
      memberId={memberId}
      memberName={memberName}
      category={category}
      categoryLabel={categoryLabel}
      split={split}
      period={period}
                custom={custom}
      count={value}
    >
      <Link
        href={activityHref(managerId, memberId, category, split)}
        onClick={(e) => e.stopPropagation()}
        className="inline-block cursor-pointer rounded-md px-1.5 py-0.5 transition-all hover:text-blue-600 hover:underline"
      >
        <Num value={value} hero={hero} />
      </Link>
    </ActivityCellPopover>
  );
}

/* Column headers. `text-slate-900` rather than the old `text-gray-500`: these
   label a dense numeric grid, and a mid-grey header on a grey header strip left
   the reader hunting for which column they were in.

   NO `dark:text-slate-100` here. The app has NO dark theme -- zero `dark:`
   variants anywhere in components/, and no dark variant configured -- so every
   surface behind this is hardcoded light. Tailwind's default `dark:` is
   `@media (prefers-color-scheme: dark)`, so adding it would turn these headers
   near-WHITE on a #f9fafb strip for anyone whose OS is in dark mode. That is
   invisible text, not dark-mode support. */
/** "2026-08-21" -> "21 Aug 2026", for the dropdown and trigger labels. */
function fmtYmd(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

const HEAD_CELL =
  "px-2 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-slate-900";

/** One manager's row plus its expandable member breakdown. */
function ManagerRow({
  row,
  resolveAvatar,
  open,
  onToggle,
  period,
  custom,
  targets,
}: {
  row: ManagerActivityRow;
  resolveAvatar: (id: string) => string | null;
  /** Threaded down so a cell's popover fetches the same window the board is
   *  showing — a preview over a different period than its own count would be
   *  worse than no preview. */
  period: ActivityPeriod;
  /** Applied custom window, when the period is `custom`. Threaded so a
   *  preview can never be fetched over a different range than its cell. */
  custom?: { from: string; to: string } | null;
  /** CONTROLLED. The row used to own this as local state, but Maximize has to
   *  open every breakdown at once — and a parent cannot reach into children's
   *  useState. The open set lives in the table now; the row just renders it. */
  open: boolean;
  onToggle: () => void;
  /** Pro-rated to the selected window; see computeActivityTargets. */
  targets: ActivityTargets;
}) {
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
                memberId={row.managerId}
                memberName={row.managerName}
                category={f.key}
                categoryLabel={f.label}
                split="gt"
                period={period}
                custom={custom}
              />
              {/* actual / target. The target is PRO-RATED to the selected
                  window, so the same ratio means the same thing over three days
                  and over a year; the colour rides on the denominator, where
                  the eye already is. */}
              <span
                className="ml-1 text-[11px] font-bold tabular-nums"
                style={{ color: attainColor(actual, targets[f.key]) }}
              >
                /{targets[f.key]}
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
            onClick={onToggle}
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
              period={period}
                custom={custom}
              targets={targets}
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
  period,
  custom,
  targets,
}: {
  members: MemberActivityRow[];
  managerId: string;
  resolveAvatar: (id: string) => string | null;
  period: ActivityPeriod;
  /** Applied custom window, when the period is `custom`. Threaded so a
   *  preview can never be fetched over a different range than its cell. */
  custom?: { from: string; to: string } | null;
  targets: ActivityTargets;
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
                        memberId={mem.employeeId}
                        memberName={mem.employeeName}
                        category={f.key}
                        categoryLabel={`${f.label} · Delegated`}
                        split="delegate"
                        period={period}
                custom={custom}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <CountLink
                        value={split.counterpart}
                        managerId={managerId}
                        memberId={mem.employeeId}
                        memberName={mem.employeeName}
                        category={f.key}
                        categoryLabel={`${f.label} · Counterpart`}
                        split="counterpart"
                        period={period}
                custom={custom}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      {/* actual / target on the member's own total for this
                          family. A and B are two halves of it, so hanging a
                          target off either would compare a part to a whole. */}
                      <Num value={split.total} />
                      <span
                        className="ml-1 text-[10.5px] font-bold tabular-nums"
                        style={{ color: attainColor(split.total, targets[f.key]) }}
                      >
                        /{targets[f.key]}
                      </span>
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
  const [period, setPeriod] = React.useState<ActivityPeriod>(DEFAULT_ACTIVITY_PERIOD);
  // The APPLIED range — only set when Apply is pressed, so dragging the date
  // inputs never refetches mid-edit. `draft` is what the popover binds to.
  const [custom, setCustom] = React.useState<{ from: string; to: string } | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<{ from: string; to: string }>({ from: "", to: "" });
  const draftValid = draft.from !== "" && draft.to !== "" && draft.from <= draft.to;
  // Section collapse, the SAME control every other dashboard section uses
  // (CollapseToggle + CollapsibleBody in section-chrome). This board used to
  // own a bespoke toggle that expanded it in place, so the one button that
  // looks identical across the dashboard did something different here.
  const [open, setOpen] = React.useState(true);
  // Which manager breakdowns are open. Lifted out of the rows so the bulk
  // control can open all of them at once.
  const [openIds, setOpenIds] = React.useState<ReadonlySet<string>>(new Set());
  const [state, setState] = React.useState<
    | { kind: "loading"; forWindow?: ActivityPeriod }
    | { kind: "error"; message: string; forWindow: ActivityPeriod }
    | { kind: "ok"; board: ManagerActivityBoard; forWindow: ActivityPeriod }
  >({ kind: "loading" });

  // The loading reset is DERIVED, not set in the effect. Stamping each result
  // with the window it was fetched for means a stale response for the previous
  // window is ignored during render — so switching the toggle shows "loading"
  // immediately without a setState-in-effect and its extra render pass.
  const showLoading = state.kind === "loading" || state.forWindow !== period;

  React.useEffect(() => {
    let cancelled = false;
    void getManagerActivityBoard(period, custom).then((res) => {
      if (cancelled) return;
      if ("error" in res) setState({ kind: "error", message: res.error, forWindow: period });
      else setState({ kind: "ok", board: res, forWindow: period });
    });
    return () => {
      cancelled = true;
    };
  }, [period, custom]);

  // NO body scroll lock and no Esc trap any more. Maximize expands the widget
  // IN PLACE inside the page rather than throwing a viewport overlay over it,
  // so the page behind is not "behind" anything — locking its scroll would just
  // freeze the document the reader is still sitting in.

  const resolveAvatar = React.useCallback(
    (id: string) => avatarById[id] ?? null,
    [avatarById],
  );

  // useMemo, not a bare conditional: `toggleExpanded` closes over this to build
  // the "open everything" set, and a fresh [] on every render would rebuild that
  // callback every time.
  const rows = React.useMemo(
    () => (state.kind === "ok" ? state.board.rows : []),
    [state],
  );
  // Null until the first board lands: the targets belong to a WINDOW, so there
  // is no honest value to show before one has been fetched.
  const targets = state.kind === "ok" ? state.board.targets : null;

  const toggleRow = React.useCallback((id: string) => {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Opening every breakdown was previously welded to the maximize button. It is
  // a genuinely useful action, so it survives as its own control rather than
  // disappearing with the button it happened to ride on.
  const allRowsOpen = rows.length > 0 && openIds.size === rows.length;
  const toggleAllRows = React.useCallback(() => {
    setOpenIds((cur) =>
      cur.size === rows.length ? new Set() : new Set(rows.map((r) => r.managerId)),
    );
  }, [rows]);

  const controls = (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="activity-period">
        Period
      </label>
      <select
        id="activity-period"
        value={period}
        onChange={(e) => {
          const next = e.target.value as ActivityPeriod;
          setPeriod(next);
          // Choosing Custom opens the picker rather than refetching: there is
          // no range yet, and the board must not flicker to a default window
          // on the way to one.
          if (next === "custom") {
            setDraft(custom ?? { from: "", to: "" });
            setPickerOpen(true);
          } else {
            setCustom(null);
            setPickerOpen(false);
          }
        }}
        className="h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-bold text-gray-700 outline-none transition-colors hover:border-gray-300 focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
      >
        {ACTIVITY_PERIODS.map((p) => (
          <option key={p.id} value={p.id}>
            {/* Once a range is applied the Custom option NAMES it, so the
                control still says what it is showing. */}
            {p.id === "custom" && custom ? `${fmtYmd(custom.from)} - ${fmtYmd(custom.to)}` : p.label}
          </option>
        ))}
      </select>

      {period === "custom" && (
        <Popover.Root open={pickerOpen} onOpenChange={setPickerOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              title="Choose a date range"
              className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-bold text-gray-700 transition-colors hover:border-gray-300"
            >
              <CalendarDays size={14} strokeWidth={2.4} />
              {custom ? `${fmtYmd(custom.from)} - ${fmtYmd(custom.to)}` : "Pick dates"}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={6}
              className="z-50 w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
            >
              <p className="text-[12px] font-black text-slate-900">Custom range</p>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                  Start date
                  <input
                    type="date"
                    value={draft.from}
                    max={draft.to || undefined}
                    onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                    className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                  End date
                  <input
                    type="date"
                    value={draft.to}
                    min={draft.from || undefined}
                    onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                    className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
                  />
                </label>
              </div>
              {/* Disabled until both ends exist and the range runs forwards —
                  an inverted range would silently fall back to the default
                  window server-side, which looks like the filter was ignored. */}
              <button
                type="button"
                disabled={!draftValid}
                onClick={() => {
                  setCustom({ ...draft });
                  setPickerOpen(false);
                }}
                className="mt-3 w-full cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply Filter
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {rows.length > 0 && (
        <button
          type="button"
          onClick={toggleAllRows}
          aria-pressed={allRowsOpen}
          title={allRowsOpen ? "Collapse every breakdown" : "Expand every breakdown"}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-lg px-2 text-[13px] font-bold text-ink-muted transition-colors hover:text-ink-strong"
        >
          {allRowsOpen ? "Collapse all" : "Expand all"}
        </button>
      )}
      {/* The shared section control, not a bespoke one. Every other section on
          this dashboard folds with this exact button; this board was the only
          one where it did something else. */}
      <CollapseToggle
        expanded={open}
        onToggle={() => setOpen((v) => !v)}
        label="the activity board"
      />
    </div>
  );

  const body = (
    <>
      {showLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 size={18} className="animate-spin" strokeWidth={2.4} />
          <span className="text-[13.5px] font-semibold">Loading activity…</span>
        </div>
      )}

      {!showLoading && state.kind === "error" && (
        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
          <p className="text-[14px] font-bold text-ink-soft">Could not load the activity board</p>
          <p className="max-w-[320px] text-[12.5px] font-semibold text-ink-subtle">
            {state.message}
          </p>
        </div>
      )}

      {!showLoading && state.kind === "ok" && state.board.rows.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
          <Users size={22} strokeWidth={2} className="text-gray-400" />
          <p className="text-[14px] font-bold text-ink-soft">No managers with direct reports yet</p>
          <p className="max-w-[280px] text-[12.5px] font-semibold text-ink-subtle">
            Assign reporting lines in Admin → Employees to populate this board.
          </p>
        </div>
      )}

      {!showLoading && state.kind === "ok" && state.board.rows.length > 0 && (
        /* The 600px scroll box, matching the scorecard widget beside it. This
           is the section's default height now — folding it away entirely is the
           section control's job, not this box's. */
        <div className="max-h-[600px] overflow-y-auto">
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
                <ManagerRow
                  key={row.managerId}
                  row={row}
                  resolveAvatar={resolveAvatar}
                  open={openIds.has(row.managerId)}
                  onToggle={() => toggleRow(row.managerId)}
                  period={period}
                custom={custom}
                  targets={state.board.targets}
                />
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
        {/* No category overline. Removed across every dashboard section — see
            the note in section-header.tsx. `mt-0.5` goes with it, or the title
            keeps the offset that existed to clear the tag. */}
        <h3
          className="text-[20px] font-black leading-tight"
          style={{
            color: "var(--color-ink-strong)",
            fontFamily: "var(--font-display), system-ui, sans-serif",
          }}
        >
          Who is delegating, and how much
        </h3>
        <p className="mt-0.5 text-[12.5px] font-semibold text-ink-subtle">
          {targets
            ? `Targets for this window: ${targets.goals} goals · ${targets.tasks} tasks · ${targets.commitments} commitments (${targets.workingDays} working of ${targets.calendarDays} days)`
            : "Targets scale with the selected period"}
        </p>
      </div>
      {controls}
    </div>
  );

  /* The HEADER stays put and the card's BODY folds — the same shape every other
     section on this dashboard has. CollapsibleBody animates grid-template-rows
     1fr -> 0fr over 300ms rather than transitioning `height`, which is what
     lets it animate to the body's natural height instead of a hardcoded one,
     and it marks the folded content `inert` so collapsed rows leave the tab
     order instead of being invisible tab stops. */
  return (
    <section className="relative min-w-0" aria-label="Manager activity board">
      {header}
      <div
        className={`wms-card w-full max-w-none overflow-hidden ${DASHBOARD_CARD} p-6 md:p-8`}
      >
        {/* CARD OUTSIDE, body inside — the nesting matters. Collapsed, this
            leaves the card shell as a thin empty bar under the header rather
            than removing it outright, which is how Status Distribution folds
            and what keeps the section's footprint legible when it is shut. */}
        <CollapsibleBody expanded={open}>{body}</CollapsibleBody>
      </div>
    </section>
  );
}
