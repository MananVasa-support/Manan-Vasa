"use client";

/**
 * GoalTableView — the Goals level-board list as a prominent, outlined,
 * inline-editable table with a sticky bulk-actions bar.
 *
 * Every cell edits in place (Area / Measure / Type dropdowns, Target vs Actual
 * number boxes, a tone-coloured % Done slider, Team % box, Team-member picker,
 * Share-with-team pill) and commits straight to the cascade server actions.
 * Row selection powers the red glass bulk bar (delete · share · copy-to-quarter).
 *
 * Brand: Altus tokens only — no raw Tailwind palette. Motion is transform/
 * opacity only and reduced-motion-gated (wg-* utilities are already gated).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Flag,
  ListChecks,
  Minus,
  Pencil,
  Plus,
  Search,
  Split,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { GoalDetailRow } from "@/components/goals/board/goal-detail-row";
import { GoalEditDialog } from "@/components/goals/cascade/goal-edit-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  setGoalPctDone,
  editGoal,
  archiveGoal,
  divideYearlyGoal,
  moveGoalToPeriod,
  bulkArchiveGoals,
  bulkCopyGoalsToPeriod,
  detectCopyCollisions,
} from "@/app/(app)/goals/cascade/actions";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { GoalPreview } from "@/components/goals/shared/goal-preview";
import { useGoalGridEngine, type GridColumn } from "@/components/goals/board/goal-grid";
import { Select } from "@/components/ui/select";
import { ADMIN_TASK_STATUSES, USER_TASK_STATUSES, GOAL_TYPES, GOAL_TYPE_LABELS, type TaskStatus, type GoalType } from "@/db/enums";
import { pctTone, fmtNum, num, periodKeyLabel, periodKeyShort, goalCode, trimDecimal, targetDateStatus, fmtTargetDate, assignmentInfo } from "@/components/goals/cascade/util";
import { CalendarClock } from "lucide-react";
import { AssignmentChip } from "@/components/goals/board/assignment-chip";
import type { GoalDTO, RosterMember } from "@/components/goals/cascade/util";
import { autoPctDone } from "@/lib/goals/auto-pct";
import {
  quartersOfFy,
  monthKeysOfQuarter,
  monthKeysOfFy,
  quarterOfKey,
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
} from "@/lib/goals/types";
import { weeksOfMonth } from "@/lib/goals/fy-calendar";
import { addDays, formatWeekShort } from "@/lib/weekly-goals/week";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type GoalTableActionRes = { ok: true } | { ok: false; error: string };

/** The inline table's mutation surface — swappable so the SAME table can drive
 *  the cascade `goals` engine (default) or the `weekly_goals` engine. */
export interface GoalTableActions {
  editGoal: (input: Record<string, unknown> & { id: string }) => Promise<GoalTableActionRes>;
  setGoalPctDone: (input: { id: string; pctDone: number }) => Promise<GoalTableActionRes>;
  archiveGoal: (input: { id: string }) => Promise<GoalTableActionRes>;
  bulkArchiveGoals: (input: { ids: string[] }) => Promise<GoalTableActionRes>;
}

const CASCADE_ACTIONS: GoalTableActions = {
  editGoal: (input) => editGoal(input as Parameters<typeof editGoal>[0]),
  setGoalPctDone: (input) => setGoalPctDone(input),
  archiveGoal: (input) => archiveGoal(input),
  bulkArchiveGoals: (input) => bulkArchiveGoals(input),
};

export interface GoalTableViewProps {
  goals: GoalDTO[];
  canWrite: boolean;
  isAdmin: boolean;
  roster: RosterMember[];
  areaOptions: string[];
  measureOptions: string[];
  typeOptions: string[];
  /** Goal-Type taxonomy options (base + admin-added). When supplied, the inline
   *  Type cell becomes an add/delete managed dropdown (#194); when omitted it
   *  falls back to the fixed built-in taxonomy. */
  goaltypeOptions?: string[];
  customLookups: { areas: string[]; measures: string[]; types: string[]; goaltypes?: string[] };
  /** "Part of Project?" pickers (mig 0184) — drive the Project column's name
   *  lookup and its typed-name matching. Optional: without them the column still
   *  reads Yes/No, it just can't resolve a name. */
  projects?: { id: string; name: string }[];
  vendors?: { id: string; name: string }[];
  fyStartYear: number;
  /** Stable dense goal code from the board's single rank source. When omitted
   *  (e.g. the weekly board) the table falls back to its own row-index code. */
  codeOf?: (g: GoalDTO) => string;
  /** Resolves the goal owner's display name for the shared detail view. Optional:
   *  the boards that know their roster pass it, the rest simply omit the row. */
  ownerNameOf?: (g: GoalDTO) => string | null;
  level: "year" | "quarter" | "month" | "week" | "day";
  /** "weekly" drives the weekly_goals engine: hides Share/Type + copy/divide,
   *  makes the Goal title inline-editable, uses the weekly detail node kind. */
  variant?: "cascade" | "weekly";
  /** Mutation surface — defaults to the cascade goals actions. */
  actions?: GoalTableActions;
  /** Detail row (Notes/Attachments) node kind — "cascade" (default) or "weekly". */
  detailKind?: "cascade" | "weekly";
}

type ActionRes = { ok: true } | { ok: false; error: string };

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

const redTint = (pct: number) => `color-mix(in srgb, var(--color-altus-red) ${pct}%, transparent)`;

/* ------------------------------------------------------------------ */
/* Small primitives                                                    */
/* ------------------------------------------------------------------ */

/** Hand-rolled brand checkbox (native inputs can't take the red tint cleanly). */
function BrandCheck({
  checked,
  indeterminate,
  onToggle,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  label: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
        FOCUS_RING,
      )}
      style={{
        borderColor: on ? "var(--color-altus-red)" : "var(--color-ink-soft)",
        borderWidth: on ? 1 : 2,
        background: on ? "var(--color-altus-red)" : "var(--color-surface-card)",
      }}
    >
      {indeterminate ? (
        <Minus size={12} strokeWidth={3.2} className="text-white" />
      ) : checked ? (
        <Check size={12} strokeWidth={3.2} className="text-white" />
      ) : null}
    </button>
  );
}

/** Number text-box that keeps a local draft and commits on blur / Enter. */
function NumBox({
  value,
  onCommit,
  disabled,
  ariaLabel,
  placeholder,
  className,
  min,
  max,
}: {
  value: string;
  onCommit: (raw: string) => void;
  disabled: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  function commit() {
    const v = draft.trim();
    if (v === value.trim()) return;
    onCommit(v);
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      value={draft}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder ?? "—"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "h-9 rounded-md border-0 bg-transparent px-2 text-center text-[13.5px] font-semibold text-ink-strong tabular-nums transition-colors hover:bg-black/[0.04] focus:bg-black/[0.06]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        FOCUS_RING,
        className,
      )}
      style={{ fontFamily: "var(--font-display)" }}
    />
  );
}

/** Inline single-line TEXT cell (Goal title). Keeps a local draft and commits on
 *  blur / Enter; Esc reverts. Same commit contract as NumBox so every editable
 *  cell behaves identically (Enter = save · Esc = cancel · blur = auto-save). */
function TextCell({
  value,
  onCommit,
  disabled,
  ariaLabel,
  placeholder,
  className,
  multiline,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  /** When true, render a wrapping, auto-growing textarea so the FULL goal text
   *  is always visible (no truncation). Enter still commits; the text wraps on
   *  its own — no manual newlines needed. */
  multiline?: boolean;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  // Auto-grow: match the textarea height to its content on every change/mount.
  const autoGrow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  React.useEffect(() => {
    if (multiline) autoGrow();
  }, [multiline, draft, autoGrow]);

  function commit() {
    const v = draft.trim();
    if (v === value.trim()) return;
    onCommit(v);
  }

  const shared = {
    value: draft,
    disabled,
    "aria-label": ariaLabel,
    placeholder,
    onBlur: commit,
    style: { borderColor: "var(--color-hairline-strong)" },
  } as const;

  if (multiline) {
    return (
      <textarea
        {...shared}
        ref={taRef}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter commits (like the single-line cell); Shift+Enter is ignored so
          // the value stays a clean single logical line that simply wraps.
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLTextAreaElement).blur();
          } else if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={cn(
          "w-full resize-none overflow-hidden rounded-md border bg-white px-2 py-1 text-[14px] font-bold leading-snug text-ink-strong focus:border-altus-red disabled:opacity-60",
          FOCUS_RING,
          className,
        )}
      />
    );
  }

  return (
    <input
      {...shared}
      type="text"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "w-full rounded-md border bg-white px-2 py-1 text-[14px] font-bold text-ink-strong focus:border-altus-red disabled:opacity-60",
        FOCUS_RING,
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Status — inline dropdown over the app's Task statuses          */
/* ------------------------------------------------------------------ */

/** Human label for a Task status enum value (live set + legacy verdicts). */
const STATUS_LABEL: Partial<Record<TaskStatus, string>> = {
  dont_know: "Not assessed",
  not_started: "Not started",
  initiated: "In progress",
  follow_up: "Follow-up",
  need_help: "Need help",
  on_hold: "On hold",
  need_info: "Need info",
  done: "Done",
  approved: "Approved",
  not_approved: "Not approved",
  cancelled: "Cancelled",
  transferred: "Transferred",
};

function statusLabel(s: string): string {
  return (
    STATUS_LABEL[s as TaskStatus] ??
    s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** A quiet band colour for the status dot (done = green · active = amber · else grey). */
function statusColor(s: string): string {
  if (s === "done" || s === "approved") return "#15803d";
  if (s === "not_started" || s === "dont_know" || s === "not_approved" || s === "cancelled")
    return "var(--color-ink-soft)";
  return "#b45309";
}

/** Inline Status dropdown. Built on the shared `Select` primitive so it inherits
 *  the keyboard-first flow (type-ahead first-match highlight, ↑/↓, Enter/Tab to
 *  commit + advance, Esc to close). Admins see every live status; others see the
 *  user-settable set. The row's CURRENT value is always included. */
function StatusCell({
  value,
  isAdmin,
  disabled,
  onCommit,
}: {
  value: string;
  isAdmin: boolean;
  disabled: boolean;
  onCommit: (status: TaskStatus) => void;
}) {
  const base = (isAdmin ? ADMIN_TASK_STATUSES : USER_TASK_STATUSES) as readonly TaskStatus[];
  const options = React.useMemo(() => {
    const set = new Set<string>(base);
    // Keep a legacy/out-of-set current value visible so it never silently drops.
    const list = value && !set.has(value) ? [value as TaskStatus, ...base] : [...base];
    return list.map((s) => ({ value: s, label: statusLabel(s) }));
  }, [base, value]);

  return (
    <div className={cn("flex items-center gap-1.5", disabled && "pointer-events-none opacity-60")}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: statusColor(value || "not_started") }}
      />
      <Select
        value={value || "not_started"}
        onValueChange={(v) => {
          if (!disabled && v !== value) onCommit(v as TaskStatus);
        }}
        disabled={disabled}
        ariaLabel="Status"
        unstyled
        className="min-w-0 flex-1 cursor-pointer gap-1 text-[13px] font-semibold text-ink-strong hover:text-altus-red"
        options={options}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Reviewer — inline roster dropdown → reviewedById              */
/* ------------------------------------------------------------------ */

const REVIEWER_NONE = "__none__";

/** Inline Reviewer picker (writes goals.reviewed_by_id). Reuses `Select` for the
 *  keyboard-first flow; a leading "No reviewer" option clears the field. */
function ReviewerCell({
  reviewedById,
  roster,
  disabled,
  onCommit,
}: {
  reviewedById: string | null | undefined;
  roster: RosterMember[];
  disabled: boolean;
  onCommit: (id: string | null) => void;
}) {
  const options = React.useMemo(
    () => [
      { value: REVIEWER_NONE, label: "No reviewer" },
      ...roster.map((r) => ({ value: r.id, label: r.name })),
    ],
    [roster],
  );
  const current = reviewedById ?? REVIEWER_NONE;

  return (
    <div className={cn(disabled && "pointer-events-none opacity-60")}>
      <Select
        value={current}
        onValueChange={(v) => {
          const next = v === REVIEWER_NONE ? null : v;
          if (!disabled && next !== (reviewedById ?? null)) onCommit(next);
        }}
        disabled={disabled}
        searchable
        searchPlaceholder="Search people…"
        placeholder="No reviewer"
        ariaLabel="Reviewer"
        unstyled
        className="w-full cursor-pointer gap-1 text-[13px] font-semibold text-ink-strong hover:text-altus-red"
        options={options}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: % Done — tone slider + number box                             */
/* ------------------------------------------------------------------ */

function PctCell({
  pct,
  disabled,
  auto,
  onCommit,
}: {
  pct: number;
  disabled: boolean;
  /** True when Target/Actual drive this % — the box is read-only + auto-computed. */
  auto?: boolean;
  onCommit: (pct: number) => void;
}) {
  const tone = pctTone(pct);

  // Auto-derived (Actual ÷ Target): show it as a bold, tone-coloured figure —
  // no input box, no pill — so it reads as a computed result, not an edit field.
  if (auto) {
    return (
      <div
        className="flex items-baseline justify-center gap-0.5"
        title="Auto-calculated from Actual ÷ Target"
      >
        <span
          className="tabular-nums font-black leading-none"
          style={{ color: tone.color, fontFamily: "var(--font-display)", fontSize: 20 }}
        >
          {pct}
        </span>
        <span className="text-[13px] font-black" style={{ color: tone.color }}>
          %
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-0.5">
      <NumBox
        value={String(pct)}
        min={0}
        max={100}
        disabled={disabled}
        ariaLabel="Percent done"
        onCommit={(raw) => {
          const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
          if (n !== pct) onCommit(n);
        }}
        className="w-[40px]"
      />
      <span
        className="inline-flex h-6 min-w-7 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
        style={{ color: tone.color, background: tone.bg }}
      >
        %
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Team members — name chips + roster popover                    */
/* ------------------------------------------------------------------ */

type TeamRef = { employeeId?: string; name?: string; weight?: number };

function memberKey(m: TeamRef): string {
  return m.employeeId ?? `name:${(m.name ?? "").toLowerCase()}`;
}

function TeamMembersCell({
  team,
  roster,
  disabled,
  onCommit,
}: {
  team: TeamRef[] | null;
  roster: RosterMember[];
  disabled: boolean;
  onCommit: (next: TeamRef[] | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const list = team ?? [];
  const picked = React.useMemo(() => new Set(list.map(memberKey)), [list]);

  // Type-a-name-to-filter, mirroring DelegatesCell — the search box autofocuses
  // on open, ↑/↓ + Home/End move the highlight, Enter toggles it, Esc closes. A
  // grid `data-grid-seed` (if opened via type-to-edit) primes the first char.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roster.filter((r) => r.name.toLowerCase().includes(q)) : roster;
  }, [roster, query]);

  React.useEffect(() => {
    if (open) {
      const seed = triggerRef.current?.getAttribute("data-grid-seed") ?? "";
      triggerRef.current?.removeAttribute("data-grid-seed");
      setQuery(seed);
      setActive(0);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);
  React.useEffect(() => {
    setActive((a) => Math.min(Math.max(0, a), Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  React.useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-mem-opt="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function focusOwner() {
    const cell = triggerRef.current?.closest<HTMLElement>('[role="gridcell"]');
    (cell ?? triggerRef.current)?.focus();
  }
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, filtered.length - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = filtered[active];
      if (r) toggle(r);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      requestAnimationFrame(focusOwner);
    }
  }

  function isPicked(r: RosterMember): boolean {
    return picked.has(r.id) || list.some((m) => !m.employeeId && (m.name ?? "").toLowerCase() === r.name.toLowerCase());
  }
  function toggle(member: RosterMember) {
    const key = member.id;
    const next = isPicked(member)
      ? list.filter(
          (m) => m.employeeId !== key && !(m.employeeId == null && (m.name ?? "").toLowerCase() === member.name.toLowerCase()),
        )
      : [...list, { employeeId: member.id, name: member.name, weight: 100 }];
    onCommit(next.length ? next : null);
  }
  function setWeight(member: RosterMember, w: number) {
    onCommit(
      list.map((m) =>
        m.employeeId === member.id || (!m.employeeId && (m.name ?? "").toLowerCase() === member.name.toLowerCase())
          ? { ...m, weight: w }
          : m,
      ),
    );
  }

  const shown = list.slice(0, 2);
  const extra = list.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((m) => (
        <span
          key={memberKey(m)}
          title={`${m.name}${m.weight != null ? ` · weight ${m.weight}` : ""}`}
          className="inline-flex max-w-[112px] items-center gap-1 truncate rounded-full border px-1.5 py-0.5 text-[11px] font-semibold text-ink-strong"
          style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}
        >
          <span
            aria-hidden
            className="grid size-3.5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
            style={{ background: "var(--color-altus-red-deep)" }}
          >
            {(m.name ?? "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{m.name ?? "—"}</span>
          {m.weight != null && (
            <span className="tabular-nums font-bold text-altus-red-deep">·{m.weight}</span>
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-altus-red-deep"
          style={{ background: redTint(10) }}
          title={list.slice(2).map((m) => `${m.name} (wt ${m.weight ?? "—"})`).join(", ")}
        >
          +{extra}
        </span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-label="Edit team members + weights"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red",
              "disabled:cursor-not-allowed disabled:opacity-60",
              FOCUS_RING,
            )}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <Plus size={11} strokeWidth={3} /> Member
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          onCloseAutoFocus={(e) => { e.preventDefault(); focusOwner(); }}
          className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
          style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
        >
          <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            <Users size={12} /> Members &amp; weights
          </p>
          {/* Type-a-name-to-filter — autofocused; ↑/↓ move the highlight, Enter toggles. */}
          <div className="px-1 pb-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-hairline bg-white/70 px-2.5">
              <Search size={14} className="shrink-0 text-ink-subtle" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder="Search people…"
                aria-label="Search team members"
                className="h-8 w-full bg-transparent text-[13px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-64 overflow-auto" role="listbox">
            {filtered.map((r, i) => {
              const isSel = isPicked(r);
              const isActive = i === active;
              const mine = list.find(
                (m) => m.employeeId === r.id || (!m.employeeId && (m.name ?? "").toLowerCase() === r.name.toLowerCase()),
              );
              return (
                <div
                  key={r.id}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", isSel || isActive ? "" : "hover:bg-black/[0.04]")}
                  style={isSel ? { background: redTint(10) } : isActive ? { background: redTint(6) } : undefined}
                >
                  <button
                    type="button"
                    data-mem-opt={i}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => toggle(r)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="inline-flex w-4 shrink-0 justify-center">
                      {isSel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                      {r.name}
                    </span>
                  </button>
                  {isSel && (
                    <label className="flex shrink-0 items-center gap-1">
                      <span className="text-[10px] font-bold uppercase text-ink-subtle">wt</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={mine?.weight ?? 100}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const w = raw === "" ? 0 : Math.max(0, Math.min(1000, Math.round(Number(raw) || 0)));
                          setWeight(r, w);
                        }}
                        aria-label={`Weight for ${r.name}`}
                        className={cn(
                          "h-7 w-[56px] rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
                          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                          FOCUS_RING,
                        )}
                        style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                      />
                    </label>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">
                {roster.length === 0 ? "No roster." : "No matches."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk: + Members — the Members picker applied to every selected goal */
/* ------------------------------------------------------------------ */

function BulkMembers({
  roster,
  count,
  onApply,
}: {
  roster: RosterMember[];
  count: number;
  onApply: (team: TeamRef[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<TeamRef[]>([]);

  const matches = (m: TeamRef, r: RosterMember) =>
    m.employeeId === r.id || (!m.employeeId && (m.name ?? "").toLowerCase() === r.name.toLowerCase());
  const isPicked = (r: RosterMember) => list.some((m) => matches(m, r));

  function toggle(r: RosterMember) {
    setList((prev) =>
      prev.some((m) => matches(m, r))
        ? prev.filter((m) => !matches(m, r))
        : [...prev, { employeeId: r.id, name: r.name, weight: 100 }],
    );
  }
  function setWeight(r: RosterMember, w: number) {
    setList((prev) => prev.map((m) => (matches(m, r) ? { ...m, weight: w } : m)));
  }
  function apply() {
    onApply(list);
    setOpen(false);
    setList([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border bg-surface-card px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red",
            FOCUS_RING,
          )}
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <Users size={13} /> + Members
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <Users size={12} /> Members &amp; weights · {count} selected
        </p>
        <div className="max-h-64 overflow-auto">
          {roster.map((r) => {
            const sel = isPicked(r);
            const mine = list.find((m) => matches(m, r));
            return (
              <div
                key={r.id}
                className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", sel ? "" : "hover:bg-black/[0.04]")}
                style={sel ? { background: redTint(10) } : undefined}
              >
                <button type="button" onClick={() => toggle(r)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="inline-flex w-4 shrink-0 justify-center">
                    {sel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", sel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                    {r.name}
                  </span>
                </button>
                {sel && (
                  <label className="flex shrink-0 items-center gap-1">
                    <span className="text-[10px] font-bold uppercase text-ink-subtle">wt</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={mine?.weight ?? 100}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const w = raw === "" ? 0 : Math.max(0, Math.min(1000, Math.round(Number(raw) || 0)));
                        setWeight(r, w);
                      }}
                      aria-label={`Weight for ${r.name}`}
                      className={cn(
                        "h-7 w-[56px] rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
                        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        FOCUS_RING,
                      )}
                      style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                    />
                  </label>
                )}
              </div>
            );
          })}
          {roster.length === 0 && <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">No roster.</p>}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 border-t px-2.5 pt-2" style={{ borderColor: "var(--color-hairline)" }}>
          <span className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">{list.length} picked</span>
          <button
            type="button"
            onClick={apply}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white", FOCUS_RING)}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Apply to {count} goal{count === 1 ? "" : "s"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Delegates — accountability hand-off (mig 0171). Name chips     */
/* each with an inline % (default 100), + a roster popover to add/drop.  */
/* Distinct from Members: a delegate is answerable for the goal; picking */
/* one instantly surfaces the goal on their own board (getSharedGoals).  */
/* ------------------------------------------------------------------ */

type DelegRef = { employeeId: string; name?: string; pct: number };

function DelegatesCell({
  delegates,
  roster,
  disabled,
  onCommit,
}: {
  delegates: DelegRef[] | null;
  roster: RosterMember[];
  disabled: boolean;
  onCommit: (next: DelegRef[] | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const list = delegates ?? [];
  const picked = React.useMemo(() => new Set(list.map((d) => d.employeeId)), [list]);

  // Type-a-name-to-filter: the search box always holds focus while open, the
  // first match is auto-highlighted, ↑/↓ + Home/End move it, Enter toggles the
  // highlighted person, Esc closes. When the grid opens us via type-to-edit it
  // stamps the typed char on the trigger as `data-grid-seed` — consume it so the
  // first keystroke primes the filter instead of being dropped.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roster.filter((r) => r.name.toLowerCase().includes(q)) : roster;
  }, [roster, query]);

  React.useEffect(() => {
    if (open) {
      const seed = triggerRef.current?.getAttribute("data-grid-seed") ?? "";
      triggerRef.current?.removeAttribute("data-grid-seed");
      setQuery(seed);
      setActive(0);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);
  React.useEffect(() => {
    setActive((a) => Math.min(Math.max(0, a), Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  React.useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-deleg-opt="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function focusOwner() {
    const cell = triggerRef.current?.closest<HTMLElement>('[role="gridcell"]');
    (cell ?? triggerRef.current)?.focus();
  }
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, filtered.length - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = filtered[active];
      if (r) toggle(r); // toggle keeps the panel open so several can be picked in a row
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      requestAnimationFrame(focusOwner);
    }
  }

  function toggle(member: RosterMember) {
    const next = picked.has(member.id)
      ? list.filter((d) => d.employeeId !== member.id)
      : [...list, { employeeId: member.id, name: member.name, pct: 100 }];
    onCommit(next.length ? next : null);
  }
  function setPct(member: RosterMember, p: number) {
    onCommit(list.map((d) => (d.employeeId === member.id ? { ...d, pct: p } : d)));
  }

  const shown = list.slice(0, 2);
  const extra = list.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((d) => (
        <span
          key={d.employeeId}
          title={`${d.name ?? "—"} · delegated ${d.pct}%`}
          className="inline-flex max-w-[132px] items-center gap-1 rounded-full border pl-1.5 pr-1 py-0.5 text-[11px] font-semibold text-ink-strong"
          style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}
        >
          <span
            aria-hidden
            className="grid size-3.5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
            style={{ background: "var(--color-altus-red-deep)" }}
          >
            {(d.name ?? "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{d.name ?? "—"}</span>
          <span className="shrink-0 tabular-nums font-bold text-altus-red-deep">·{d.pct}%</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                const next = list.filter((x) => x.employeeId !== d.employeeId);
                onCommit(next.length ? next : null);
              }}
              aria-label={`Remove ${d.name ?? "delegate"}`}
              title="Remove delegate"
              className="grid size-3.5 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_15%,transparent)] hover:text-altus-red"
            >
              <X size={10} strokeWidth={3} />
            </button>
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-altus-red-deep"
          style={{ background: redTint(10) }}
          title={list.slice(2).map((d) => `${d.name ?? "—"} (${d.pct}%)`).join(", ")}
        >
          +{extra}
        </span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-label="Delegate to team"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red",
              "disabled:cursor-not-allowed disabled:opacity-60",
              // #30 — no delegate affordance until the goal is actually delegated:
              // when the list is empty the trigger is hidden, revealed only on row
              // hover / keyboard focus (or while its own picker is open).
              list.length === 0 && !open &&
                "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
              FOCUS_RING,
            )}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <UserPlus size={11} strokeWidth={3} /> Delegate
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          // Esc / click-away returns focus to the owning grid cell so arrow-nav resumes.
          onCloseAutoFocus={(e) => { e.preventDefault(); focusOwner(); }}
          className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
          style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
        >
          <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            <UserPlus size={12} /> Delegate &amp; share %
          </p>
          {/* Type-a-name-to-filter — autofocused; ↑/↓ move the highlight, Enter toggles. */}
          <div className="px-1 pb-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-hairline bg-white/70 px-2.5">
              <Search size={14} className="shrink-0 text-ink-subtle" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder="Search people…"
                aria-label="Search people to delegate"
                className="h-8 w-full bg-transparent text-[13px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-64 overflow-auto" role="listbox">
            {filtered.map((r, i) => {
              const isSel = picked.has(r.id);
              const isActive = i === active;
              const mine = list.find((d) => d.employeeId === r.id);
              return (
                <div
                  key={r.id}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", isSel || isActive ? "" : "hover:bg-black/[0.04]")}
                  style={isSel ? { background: redTint(10) } : isActive ? { background: redTint(6) } : undefined}
                >
                  <button
                    type="button"
                    data-deleg-opt={i}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => toggle(r)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="inline-flex w-4 shrink-0 justify-center">
                      {isSel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                      {r.name}
                    </span>
                  </button>
                  {isSel && (
                    <label className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={mine?.pct ?? 100}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const p = raw === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
                          setPct(r, p);
                        }}
                        aria-label={`Delegation percent for ${r.name}`}
                        className={cn(
                          "h-7 w-[56px] rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
                          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                          FOCUS_RING,
                        )}
                        style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                      />
                      <span className="text-[10px] font-bold text-ink-subtle">%</span>
                    </label>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">
                {roster.length === 0 ? "No roster." : "No matches."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk: + Delegate — pick staff (auto 100%) for every selected goal.   */
/* Mirrors BulkMembers; the per-row % is then editable in DelegatesCell. */
/* ------------------------------------------------------------------ */

function BulkDelegate({
  roster,
  count,
  onApply,
}: {
  roster: RosterMember[];
  count: number;
  onApply: (delegates: DelegRef[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<DelegRef[]>([]);

  const isPicked = (r: RosterMember) => list.some((d) => d.employeeId === r.id);
  function toggle(r: RosterMember) {
    setList((prev) =>
      prev.some((d) => d.employeeId === r.id)
        ? prev.filter((d) => d.employeeId !== r.id)
        : [...prev, { employeeId: r.id, name: r.name, pct: 100 }],
    );
  }
  function setPct(r: RosterMember, p: number) {
    setList((prev) => prev.map((d) => (d.employeeId === r.id ? { ...d, pct: p } : d)));
  }
  function apply() {
    onApply(list);
    setOpen(false);
    setList([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border bg-surface-card px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red",
            FOCUS_RING,
          )}
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <UserPlus size={13} /> + Delegate
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <UserPlus size={12} /> Delegate to · {count} selected
        </p>
        <div className="max-h-64 overflow-auto">
          {roster.map((r) => {
            const sel = isPicked(r);
            const mine = list.find((d) => d.employeeId === r.id);
            return (
              <div
                key={r.id}
                className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", sel ? "" : "hover:bg-black/[0.04]")}
                style={sel ? { background: redTint(10) } : undefined}
              >
                <button type="button" onClick={() => toggle(r)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="inline-flex w-4 shrink-0 justify-center">
                    {sel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", sel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                    {r.name}
                  </span>
                </button>
                {sel && (
                  <label className="flex shrink-0 items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={mine?.pct ?? 100}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const p = raw === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
                        setPct(r, p);
                      }}
                      aria-label={`Delegation percent for ${r.name}`}
                      className={cn(
                        "h-7 w-[56px] rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
                        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        FOCUS_RING,
                      )}
                      style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                    />
                    <span className="text-[10px] font-bold text-ink-subtle">%</span>
                  </label>
                )}
              </div>
            );
          })}
          {roster.length === 0 && <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">No roster.</p>}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 border-t px-2.5 pt-2" style={{ borderColor: "var(--color-hairline)" }}>
          <span className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">{list.length} picked</span>
          <button
            type="button"
            onClick={apply}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white", FOCUS_RING)}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Delegate {count} goal{count === 1 ? "" : "s"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}


/* ------------------------------------------------------------------ */
/* Cell: Target Date — inline deadline under the goal title (month/week) */
/* Editable date box for month (cascade) goals; read-only coloured chip */
/* for week rows (weekly goals set their date in the composer).         */
/* ------------------------------------------------------------------ */

function TargetDateInline({
  iso,
  editable,
  disabled,
  onCommit,
}: {
  iso: string | null;
  editable: boolean;
  disabled: boolean;
  onCommit: (v: string | null) => void;
}) {
  const st = targetDateStatus(iso);
  const has = st.daysLeft != null;

  if (!editable) {
    if (!has) return null;
    return (
      <span
        className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[11px] font-bold tabular-nums"
        style={{ background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color }}
        title={`Target date ${fmtTargetDate(iso)} · ${st.label}`}
      >
        <CalendarClock size={11} aria-hidden />
        {fmtTargetDate(iso)} · {st.label}
      </span>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <input
        type="date"
        defaultValue={iso ?? ""}
        disabled={disabled}
        aria-label="Target date"
        onBlur={(e) => {
          const v = e.target.value || null;
          if (v !== (iso ?? null)) onCommit(v);
        }}
        className={cn(
          "h-7 rounded-md border bg-white px-1.5 text-[12px] font-semibold text-ink-strong focus:border-altus-red disabled:opacity-60",
          FOCUS_RING,
        )}
        style={{ borderColor: has ? st.color : "var(--color-hairline-strong)" }}
      />
      {has && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[10.5px] font-bold tabular-nums"
          style={{ background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color }}
          title={st.label}
        >
          <CalendarClock size={10} aria-hidden />
          {st.label}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hierarchy-aware "Copy to" — derive the CURRENT level's immediate     */
/* child periods (never siblings / parents). year→quarters, quarter→    */
/* that quarter's 3 months, month→that month's weeks, week→its 7 days.  */
/* ------------------------------------------------------------------ */

type Level = "year" | "quarter" | "month" | "week" | "day";
type ChildLevel = "quarter" | "month" | "week" | "day";
type PeriodTarget = { key: string; label: string; sub?: string };
type ChildMap = { childLevel: ChildLevel; childNoun: string; targets: PeriodTarget[] };

const QUARTER_SUB = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEVEL_ADJ: Record<Level, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};

/** The immediate CHILD periods a level's goals should copy into. */
function childMapping(level: Level, periodKey: string | undefined): ChildMap | null {
  if (!periodKey) return null;
  if (level === "year") {
    const fy = Number(periodKey);
    if (!Number.isFinite(fy)) return null;
    return {
      childLevel: "quarter",
      childNoun: "quarter",
      targets: quartersOfFy(fy).map((k, i) => ({ key: k, label: `Q${i + 1}`, sub: QUARTER_SUB[i] })),
    };
  }
  if (level === "quarter") {
    if (!/^\d{4}-Q[1-4]$/.test(periodKey)) return null;
    const fy = fyStartYearOfKey(periodKey);
    const q = quarterOfKey(periodKey);
    return {
      childLevel: "month",
      childNoun: "month",
      targets: monthKeysOfQuarter(fy, q).map((k) => ({ key: k, label: periodKeyShort(k), sub: k.slice(0, 4) })),
    };
  }
  if (level === "month") {
    if (!/^\d{4}-\d{2}$/.test(periodKey)) return null;
    const fy = fyStartYearOfMonthKey(periodKey);
    const monthIndex = Number(periodKey.slice(5, 7)) - 1;
    // Label by ORDER within the month ("Week 1..N"), not the FY week number.
    return {
      childLevel: "week",
      childNoun: "week",
      targets: weeksOfMonth(fy, monthIndex).map((w, i) => ({
        key: w.mondayISO,
        label: `Week ${i + 1}`,
        sub: formatWeekShort(w.mondayISO),
      })),
    };
  }
  if (level === "week") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return null;
    // periodKey is the week's Monday — Mon…Sun of that week.
    return {
      childLevel: "day",
      childNoun: "day",
      targets: DAY_NAMES.map((name, i) => {
        const iso = addDays(periodKey, i);
        return { key: iso, label: name, sub: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
      }),
    };
  }
  return null; // day has no child level
}

/** Sibling buckets at the goal's OWN level (for "Move to…", cascade only). */
function siblingTargets(level: Level, periodKey: string | undefined): PeriodTarget[] {
  if (!periodKey) return [];
  if (level === "quarter" && /^\d{4}-Q[1-4]$/.test(periodKey)) {
    const fy = fyStartYearOfKey(periodKey);
    return quartersOfFy(fy)
      .filter((k) => k !== periodKey)
      .map((k) => ({ key: k, label: `Q${quarterOfKey(k)}`, sub: QUARTER_SUB[quarterOfKey(k) - 1] }));
  }
  if (level === "month" && /^\d{4}-\d{2}$/.test(periodKey)) {
    const fy = fyStartYearOfMonthKey(periodKey);
    return monthKeysOfFy(fy)
      .filter((k) => k !== periodKey)
      .map((k) => ({ key: k, label: periodKeyShort(k), sub: k.slice(0, 4) }));
  }
  return [];
}

const MENU_BTN =
  "inline-flex items-center gap-1.5 rounded-lg border bg-surface-card px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red";

/** Context-aware "Copy to" — a checkable list of the current level's child
 *  periods; copy the selected goals into ONE OR MORE of them in a single go. */
function CopyToMenu({
  childMap,
  count,
  onCopy,
}: {
  childMap: ChildMap;
  count: number;
  onCopy: (keys: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const reset = () => setPicked(new Set());
  const toggle = (k: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  function go() {
    if (picked.size === 0) return;
    onCopy([...picked]);
    reset();
    setOpen(false);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={cn(MENU_BTN, FOCUS_RING)} style={{ borderColor: "var(--color-hairline-strong)" }}>
          <Copy size={13} /> Copy to {childMap.childNoun}
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-64 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <Copy size={12} /> Copy {count} goal{count === 1 ? "" : "s"} to…
        </p>
        <div className="max-h-64 overflow-auto">
          {childMap.targets.map((t) => {
            const on = picked.has(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggle(t.key)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors", on ? "" : "hover:bg-black/[0.04]")}
                style={on ? { background: redTint(10) } : undefined}
              >
                <BrandCheck checked={on} onToggle={() => toggle(t.key)} label={`Copy to ${t.label}`} />
                <span className={cn("min-w-0 flex-1 truncate text-[13px]", on ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                  {t.label}
                </span>
                {t.sub && <span className="shrink-0 text-[11px] font-semibold text-ink-subtle tabular-nums">{t.sub}</span>}
              </button>
            );
          })}
          {childMap.targets.length === 0 && (
            <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">No child periods.</p>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 border-t px-2.5 pt-2" style={{ borderColor: "var(--color-hairline)" }}>
          <span className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">{picked.size} picked</span>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={go}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50", FOCUS_RING)}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Copy
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** "Move to…" — re-home the selected goals to ONE sibling bucket at the same level. */
function MoveToMenu({
  siblings,
  noun,
  onMove,
}: {
  siblings: PeriodTarget[];
  noun: string;
  onMove: (key: string, label: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(MENU_BTN, FOCUS_RING)} style={{ borderColor: "var(--color-hairline-strong)" }}>
          <ArrowRightLeft size={13} /> Move to {noun}
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-56 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <ArrowRightLeft size={12} /> Move to another {noun}
        </p>
        <div className="max-h-64 overflow-auto">
          {siblings.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                onMove(t.key, t.label);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ink-strong transition-colors hover:bg-black/[0.04]"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t.label}</span>
              {t.sub && <span className="shrink-0 text-[11px] font-semibold text-ink-subtle tabular-nums">{t.sub}</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Bulk status — status is derived from % Done, so three presets set the % (and
 *  therefore status) on every selected goal. */
const STATUS_PRESETS: { pct: number; label: string; color: string }[] = [
  { pct: 0, label: "Not started", color: "var(--color-ink-soft)" },
  { pct: 50, label: "In progress", color: "var(--color-amber, #d97706)" },
  { pct: 100, label: "Done", color: "var(--color-emerald, #059669)" },
];

function BulkStatusMenu({ onPick }: { onPick: (pct: number, label: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(MENU_BTN, FOCUS_RING)} style={{ borderColor: "var(--color-hairline-strong)" }}>
          <Flag size={13} /> Status
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-48 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        {STATUS_PRESETS.map((s) => (
          <button
            key={s.pct}
            type="button"
            onClick={() => {
              onPick(s.pct, s.label);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.04]"
          >
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-[13px] font-semibold text-ink-strong">{s.label}</span>
            <span className="text-[11px] font-bold text-ink-subtle tabular-nums">{s.pct}%</span>
          </button>
        ))}
        {/* PHASE 2: per-goal Priority / Reviewer / KPI verbs — those fields don't
            exist on a cascade goal yet, so no fake bulk-editor is offered here. */}
      </PopoverContent>
    </Popover>
  );
}

/** Bulk target-date (month goals only — the only level with an editable deadline). */
function BulkTargetDate({ onApply }: { onApply: (iso: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [iso, setIso] = React.useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(MENU_BTN, FOCUS_RING)} style={{ borderColor: "var(--color-hairline-strong)" }}>
          <CalendarDays size={13} /> Target date
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-60 rounded-xl border border-hairline bg-surface-card p-2.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="pb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Set target date</p>
        <input
          type="date"
          value={iso}
          onChange={(e) => setIso(e.target.value)}
          aria-label="Bulk target date"
          className={cn("h-9 w-full rounded-md border bg-white px-2 text-[13px] font-semibold text-ink-strong focus:border-altus-red", FOCUS_RING)}
          style={{ borderColor: "var(--color-hairline-strong)" }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onApply(null);
              setOpen(false);
            }}
            className={cn("rounded-lg px-2 py-1.5 text-[12px] font-bold text-ink-subtle transition-colors hover:text-ink-strong", FOCUS_RING)}
          >
            Clear
          </button>
          <button
            type="button"
            disabled={!iso}
            onClick={() => {
              onApply(iso);
              setOpen(false);
            }}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50", FOCUS_RING)}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Duplicate-collision prompt shown when a chosen destination already holds a
 *  goal with the same title. Skip / Replace / Cancel (Merge = PHASE 2). */
function DupCollisionDialog({
  open,
  collisions,
  labelFor,
  onResolve,
}: {
  open: boolean;
  collisions: Record<string, string[]>;
  labelFor: (key: string) => string;
  onResolve: (mode: "skip" | "replace" | null) => void;
}) {
  const entries = Object.entries(collisions);
  const total = entries.reduce((n, [, list]) => n + list.length, 0);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onResolve(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6"
          style={{ border: "1px solid var(--color-hairline-strong)", boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)" }}
        >
          <div className="mb-4 flex items-start gap-3">
            <span
              aria-hidden
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: redTint(12), color: "var(--color-altus-red)" }}
            >
              <Copy size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-bold text-ink-strong" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                {total} duplicate{total === 1 ? "" : "s"} already there
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13.5px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
                Some destinations already hold a goal with the same title. How should the copy proceed?
              </Dialog.Description>
            </div>
          </div>

          <div
            className="mb-4 max-h-40 overflow-auto rounded-lg border p-2 text-[12.5px]"
            style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}
          >
            {entries.map(([key, list]) => (
              <div key={key} className="py-0.5">
                <span className="font-bold text-ink-strong">{labelFor(key)}:</span>{" "}
                <span className="text-ink-soft">{list.join(", ")}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onResolve(null)}
              className={cn("rounded-lg border px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink-strong", FOCUS_RING)}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onResolve("skip")}
              className={cn("rounded-lg border px-3.5 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red", FOCUS_RING)}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              Skip Duplicates
            </button>
            <button
              type="button"
              onClick={() => onResolve("replace")}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white", FOCUS_RING)}
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              Replace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

const TH =
  "px-2 py-4 text-left text-[12.5px] font-black uppercase tracking-[0.07em] text-ink-strong whitespace-nowrap";

// #10 — the fixed Goal Type taxonomy labels for the inline Type selector
// (KPI / Branding / Strategic / Operational / Essential). NOT admin-extensible,
// unlike the legacy free-text `category` lookups.
const GOAL_TYPE_OPTIONS: string[] = GOAL_TYPES.map((t) => GOAL_TYPE_LABELS[t]);

export function GoalTableView(props: GoalTableViewProps) {
  const {
    goals,
    canWrite,
    isAdmin,
    roster,
    areaOptions,
    measureOptions,
    typeOptions,
    goaltypeOptions,
    customLookups,
    codeOf,
    ownerNameOf,
    level,
  } = props;

  const weekly = props.variant === "weekly";
  const A = props.actions ?? CASCADE_ACTIONS;
  const detailKind = props.detailKind ?? "cascade";

  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Local, optimistic copy of the rows so an inline edit is visible in 0 ms —
  // the server action persists in the background and a debounced refresh
  // reconciles server-derived values (dials, roll-ups). Re-sync whenever the
  // server sends a fresh board (after a refresh / navigation / realtime).
  const [rows, setRows] = React.useState<GoalDTO[]>(goals);
  React.useEffect(() => setRows(goals), [goals]);

  // Every goal on this board shares one period key — derive the current period
  // from it, then the hierarchy-correct CHILD periods (Copy to) + SIBLINGS (Move).
  const currentPeriodKey = goals[0]?.periodKey;
  const childMap = React.useMemo(() => childMapping(level, currentPeriodKey), [level, currentPeriodKey]);
  const siblings = React.useMemo(() => siblingTargets(level, currentPeriodKey), [level, currentPeriodKey]);

  // Pending "Copy to" awaiting a duplicate-collision decision (Skip/Replace/Cancel).
  const [dupPrompt, setDupPrompt] = React.useState<{ keys: string[]; collisions: Record<string, string[]> } | null>(null);

  const allSelected = rows.length > 0 && rows.every((g) => selected.has(g.id));
  const someSelected = selected.size > 0 && !allSelected;
  const locked = !canWrite;

  // Debounced background reconcile — coalesces a burst of edits into ONE server
  // re-fetch instead of one heavy refresh per keystroke-commit (the old 7–10 s
  // stall). The optimistic local state already shows the change instantly.
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 700);
  }, [router]);
  React.useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  /** Fire a server action; on success reconcile in the background, on failure toast. */
  const run = React.useCallback(
    (act: () => Promise<ActionRes>, okMsg: string, after?: () => void) => {
      startTransition(async () => {
        const res = await act();
        if (res.ok) {
          after?.();
          scheduleRefresh();
          fireToast({ message: okMsg, type: "success" });
        } else {
          fireToast({ message: res.error, type: "error" });
        }
      });
    },
    [scheduleRefresh],
  );

  /** Optimistic inline field edit: patch the row locally NOW (instant), persist
   *  in the background, revert just that row on failure. No success toast — the
   *  visible change IS the confirmation. */
  const editField = React.useCallback(
    (id: string, partial: Partial<GoalDTO>, act: () => Promise<ActionRes>) => {
      let snapshot: GoalDTO | undefined;
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          snapshot = r;
          return { ...r, ...partial };
        }),
      );
      startTransition(async () => {
        const res = await act();
        if (res.ok) {
          scheduleRefresh();
        } else {
          if (snapshot) setRows((prev) => prev.map((r) => (r.id === id ? snapshot! : r)));
          fireToast({ message: res.error, type: "error" });
        }
      });
    },
    [scheduleRefresh],
  );

  /** Optimistic removal (single or bulk delete): drop rows locally NOW, persist
   *  in the background, restore the whole set on failure. */
  const removeRows = React.useCallback(
    (removeIds: string[], act: () => Promise<ActionRes>, okMsg: string, after?: () => void) => {
      const removing = new Set(removeIds);
      let snapshot: GoalDTO[] = [];
      setRows((prev) => {
        snapshot = prev;
        return prev.filter((r) => !removing.has(r.id));
      });
      after?.();
      startTransition(async () => {
        const res = await act();
        if (res.ok) {
          scheduleRefresh();
          fireToast({ message: okMsg, type: "success" });
        } else {
          setRows(snapshot);
          fireToast({ message: res.error, type: "error" });
        }
      });
    },
    [scheduleRefresh],
  );

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((g) => g.id)));
  }

  const clearSelection = React.useCallback(() => setSelected(new Set()), []);

  // The goal open in the full Edit dialog (title + all fields), or null.
  const [editingGoal, setEditingGoal] = React.useState<GoalDTO | null>(null);

  // Which goals have their Notes / Attachments detail row open.
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const patchNotes = React.useCallback(
    (id: string, notes: string | null) =>
      editField(id, { notes }, () => A.editGoal({ id, notes })),
    [editField],
  );

  /* ------------------------------------------------------------------ */
  /* Spreadsheet grid engine — the editable columns, in visual order.    */
  /* Each column is the ONE source of truth for read / editable / parse, */
  /* so inline typing, paste, fill-down and undo all commit identically  */
  /* through the SAME `actions` surface (A.editGoal / A.setGoalPctDone).  */
  /* Members is intentionally NOT a grid column (its JSON team+weights    */
  /* payload has no sane TSV round-trip) — it stays directly editable.    */
  /* ------------------------------------------------------------------ */
  const gridColumns = React.useMemo<GridColumn[]>(() => {
    const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
    /** "" → null · valid number → the string · junk → undefined (reject). */
    const numOrNull = (raw: string): string | null | undefined => {
      const s = raw.trim();
      if (s === "") return null;
      return Number.isFinite(Number(s)) ? s : undefined;
    };
    const rosterById = new Map(roster.map((m) => [m.id, m.name]));
    const rosterByName = new Map(roster.map((m) => [m.name.trim().toLowerCase(), m.id]));
    // Project / vendor lookups for the "Part of Project?" column (both directions:
    // id → name to render, name → id to accept a typed or pasted cell).
    const projectList = props.projects ?? [];
    const vendorList = props.vendors ?? [];
    const projectById = new Map(projectList.map((p) => [p.id, p.name]));
    const projectByName = new Map(projectList.map((p) => [p.name.trim().toLowerCase(), p.id]));
    const vendorById = new Map(vendorList.map((v) => [v.id, v.name]));
    const vendorByName = new Map(vendorList.map((v) => [v.name.trim().toLowerCase(), v.id]));
    const statusBase = (isAdmin ? ADMIN_TASK_STATUSES : USER_TASK_STATUSES) as readonly TaskStatus[];

    const cols: GridColumn[] = [
      {
        key: "area",
        label: "Area",
        read: (g) => g.area ?? "",
        editable: () => !locked,
        parse: (raw, g) => {
          const v = raw.trim() === "" ? null : raw.trim();
          return { partial: { area: v }, run: () => A.editGoal({ id: g.id, area: v }) };
        },
      },
      {
        key: "title",
        label: "Goal",
        read: (g) => g.title,
        editable: () => !locked,
        parse: (raw, g) => {
          const t = raw.trim();
          if (!t) return null; // title is required — never blank it
          return { partial: { title: t }, run: () => A.editGoal({ id: g.id, title: t }) };
        },
      },
      {
        // "Part of Project?" — reads "No" or "Yes · <Project> · <Vendor>". Typing
        // follows the grid's spreadsheet convention: "no"/"-" clears the tag,
        // "yes" marks it without a project, and typing a PROJECT NAME (or a
        // "Project · Vendor" pair, exactly as the cell renders) both marks it and
        // resolves the ids — so a pasted column round-trips.
        key: "project",
        label: "Project",
        read: (g) => {
          if (!g.isProject) return "No";
          const p = g.projectNodeId ? projectById.get(g.projectNodeId) : null;
          const v = g.vendorId ? vendorById.get(g.vendorId) : null;
          return ["Yes", p, v].filter(Boolean).join(" · ");
        },
        editable: () => !locked,
        parse: (raw, g) => {
          const s = raw.trim();
          const low = s.toLowerCase();
          if (s === "" || low === "no" || low === "-" || low === "—") {
            return {
              partial: { isProject: false, projectNodeId: null, vendorId: null },
              run: () => A.editGoal({ id: g.id, isProject: false }),
            };
          }
          // Drop a leading "Yes ·" so the cell's own rendering can be pasted back.
          const rest = s.replace(/^yes\s*(·|\||,|-)?\s*/i, "");
          const [pName, vName] = rest.split(/\s*(?:·|\|)\s*/);
          const projectNodeId = pName ? (projectByName.get(pName.trim().toLowerCase()) ?? null) : null;
          const vendorId = vName ? (vendorByName.get(vName.trim().toLowerCase()) ?? null) : null;
          // A typed name that matches nothing is a typo, not an intent to clear —
          // reject the edit so the previous value stands.
          if (pName && pName.trim() && !projectNodeId) return null;
          return {
            partial: { isProject: true, projectNodeId, vendorId },
            run: () => A.editGoal({ id: g.id, isProject: true, projectNodeId, vendorId }),
          };
        },
      },
      {
        key: "measure",
        label: "Measure",
        read: (g) => g.uom ?? "",
        editable: () => !locked,
        parse: (raw, g) => {
          const v = raw.trim() === "" ? null : raw.trim();
          return { partial: { uom: v }, run: () => A.editGoal({ id: g.id, uom: v }) };
        },
      },
      {
        key: "actual",
        label: "Actual",
        read: (g) => trimDecimal(g.actualQty),
        editable: () => !locked,
        parse: (raw, g) => {
          const v = numOrNull(raw);
          if (v === undefined) return null;
          return { partial: { actualQty: v }, run: () => A.editGoal({ id: g.id, actualQty: v }) };
        },
      },
      {
        key: "target",
        label: "Target",
        read: (g) => trimDecimal(g.targetQty),
        editable: () => !locked,
        parse: (raw, g) => {
          const v = numOrNull(raw);
          if (v === undefined) return null;
          return { partial: { targetQty: v }, run: () => A.editGoal({ id: g.id, targetQty: v }) };
        },
      },
      {
        key: "pct",
        label: "% Done",
        read: (g) => String(autoPctDone(g.targetQty, g.actualQty) ?? g.pctDone),
        // Read-only when Actual ÷ Target drives it (matches the PctCell auto mode).
        editable: (g) => !locked && autoPctDone(g.targetQty, g.actualQty) === null,
        parse: (raw, g) => {
          const n = Number(raw.trim());
          if (!Number.isFinite(n)) return null;
          const p = clampInt(n, 0, 100);
          return { partial: { pctDone: p }, run: () => A.setGoalPctDone({ id: g.id, pctDone: p }) };
        },
      },
      {
        key: "teamPct",
        label: "Team %",
        read: (g) => (g.teamDependencyPct == null ? "" : String(g.teamDependencyPct)),
        editable: () => !locked,
        parse: (raw, g) => {
          const s = raw.trim();
          if (s === "") return { partial: { teamDependencyPct: null }, run: () => A.editGoal({ id: g.id, teamDependencyPct: null }) };
          const n = Number(s);
          if (!Number.isFinite(n)) return null;
          const v = clampInt(n, 0, 100);
          return { partial: { teamDependencyPct: v }, run: () => A.editGoal({ id: g.id, teamDependencyPct: v }) };
        },
      },
      {
        // #14 — Weightage editable inline at EVERY level (year/quarter/month/week),
        // even when the goal was cascaded from a parent (editGoal has no weight lock).
        key: "weight",
        label: "Weight",
        read: (g) => String(g.weight ?? 100),
        editable: () => !locked,
        parse: (raw, g) => {
          const n = Number(raw.trim());
          if (!Number.isFinite(n)) return null;
          const v = clampInt(n, 0, 1000);
          return { partial: { weight: v }, run: () => A.editGoal({ id: g.id, weight: v }) };
        },
      },
      {
        // Delegate is NOT typeable/pasteable (its {employeeId, name, pct} payload
        // has no sane TSV round-trip, like Members) — but it IS a navigable grid
        // column so arrow-nav can land on it and Enter opens the picker. read()
        // gives Copy a readable summary; editable=false makes paste/fill/delete
        // skip it; parse=()=>null rejects any typed/pasted write.
        key: "delegate",
        label: "Delegated",
        read: (g) => (g.delegatedTo ?? []).map((d) => `${d.name ?? ""}${d.pct != null ? ` (${d.pct}%)` : ""}`).filter(Boolean).join(", "),
        editable: () => false,
        parse: () => null,
      },
    ];

    cols.push(
      {
        // #10 — Goal Type taxonomy: KPI / Branding / Strategic / Operational /
        // Essential (goalType enum), NOT the legacy free-text `category`.
        key: "type",
        label: "Type",
        // Built-in code → its label; admin-added custom type → its raw value.
        read: (g) => (g.goalType ? GOAL_TYPE_LABELS[g.goalType as GoalType] ?? g.goalType : ""),
        editable: () => !locked,
        parse: (raw, g) => {
          const trimmed = raw.trim();
          const norm = trimmed.toLowerCase();
          if (norm === "")
            return { partial: { goalType: null }, run: () => A.editGoal({ id: g.id, goalType: null }) };
          // A built-in type persists as its canonical code (unchanged behaviour).
          const code = GOAL_TYPES.find(
            (t) => t === norm || GOAL_TYPE_LABELS[t].toLowerCase() === norm,
          );
          if (code)
            return { partial: { goalType: code }, run: () => A.editGoal({ id: g.id, goalType: code }) };
          // #194 — an admin-added custom Goal Type is stored as its raw label.
          return { partial: { goalType: trimmed }, run: () => A.editGoal({ id: g.id, goalType: trimmed }) };
        },
      },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, locked, isAdmin, weekly, props.projects, props.vendors]);

  const grid = useGoalGridEngine({
    rows,
    columns: gridColumns,
    enabled: !locked,
    applyEdit: editField,
  });

  /* ---------- bulk actions ---------- */
  const ids = React.useMemo(() => [...selected], [selected]);

  function bulkDelete() {
    removeRows(
      ids,
      () => A.bulkArchiveGoals({ ids }),
      `${ids.length} goal${ids.length === 1 ? "" : "s"} moved to the recycle bin`,
      clearSelection,
    );
  }
  function bulkSetMembers(team: TeamRef[]) {
    const sel = new Set(ids);
    const value = team.length ? team : null;
    // #7 — adding members bulk-shares onto their boards (server auto-flips too).
    const share = (value ?? []).some((m) => m.employeeId);
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, teamInvolved: value, shareWithTeam: share } : r)));
    run(
      async () => {
        for (const id of ids) {
          const res = await A.editGoal({ id, teamInvolved: value });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      `Members set on ${ids.length} goal${ids.length === 1 ? "" : "s"}`,
      clearSelection,
    );
  }
  function bulkSetDelegate(delegates: DelegRef[]) {
    const sel = new Set(ids);
    const value = delegates.length ? delegates : null;
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, delegatedTo: value } : r)));
    run(
      async () => {
        for (const id of ids) {
          const res = await A.editGoal({ id, delegatedTo: value });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      value
        ? `Delegated ${ids.length} goal${ids.length === 1 ? "" : "s"}`
        : `Delegation cleared on ${ids.length} goal${ids.length === 1 ? "" : "s"}`,
      clearSelection,
    );
  }
  // Human label for a chosen child period key (Q2 / Apr / Week 2 / Mon).
  const childLabelFor = React.useCallback(
    (key: string) => childMap?.targets.find((t) => t.key === key)?.label ?? periodKeyLabel(key),
    [childMap],
  );

  /** Copy the selected goals into the given CHILD periods, with a collision policy. */
  const performCopy = React.useCallback(
    (keys: string[], onDuplicate?: "skip" | "replace") => {
      const cl = childMap;
      if (!cl || keys.length === 0) return;
      const selIds = [...selected];
      startTransition(async () => {
        let copied = 0;
        let skipped = 0;
        let err = "";
        for (const key of keys) {
          const res = await bulkCopyGoalsToPeriod({
            ids: selIds,
            targetLevel: cl.childLevel,
            targetKey: key,
            ...(onDuplicate ? { onDuplicate } : {}),
          });
          if (res.ok) {
            copied += res.copied;
            skipped += res.skipped;
          } else {
            err = res.error;
          }
        }
        if (copied === 0 && skipped === 0) {
          fireToast({ message: err || "Nothing was copied.", type: "error" });
          return;
        }
        scheduleRefresh();
        clearSelection();
        const labels = keys.map((k) => cl.targets.find((t) => t.key === k)?.label ?? k);
        const dest = labels.length <= 2 ? labels.join(" and ") : `${labels.length} ${cl.childNoun}s`;
        const noun = `${LEVEL_ADJ[level]} Goal${copied === 1 ? "" : "s"}`;
        let msg = copied > 0 ? `${copied} ${noun} copied to ${dest}.` : "";
        if (skipped > 0) msg += `${msg ? " " : ""}${skipped} duplicate${skipped === 1 ? "" : "s"} skipped.`;
        fireToast({ message: msg, type: "success" });
      });
    },
    [childMap, selected, level, scheduleRefresh, clearSelection],
  );

  /** Entry point from the Copy-to menu: detect collisions first, then either
   *  copy straight away or open the Skip/Replace/Cancel prompt. */
  const requestCopy = React.useCallback(
    (keys: string[]) => {
      const cl = childMap;
      if (!cl || keys.length === 0) return;
      const selIds = [...selected];
      startTransition(async () => {
        const det = await detectCopyCollisions({ ids: selIds, targetLevel: cl.childLevel, targetKeys: keys });
        if (!det.ok) {
          fireToast({ message: det.error, type: "error" });
          return;
        }
        if (Object.keys(det.collisions).length > 0) {
          setDupPrompt({ keys, collisions: det.collisions });
        } else {
          performCopy(keys, undefined);
        }
      });
    },
    [childMap, selected, performCopy],
  );

  function bulkMove(targetKey: string, label: string) {
    const selIds = [...selected];
    run(
      async () => {
        for (const id of selIds) {
          const res = await moveGoalToPeriod({ id, periodKey: targetKey });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      `Moved ${selIds.length} goal${selIds.length === 1 ? "" : "s"} to ${label}`,
      clearSelection,
    );
  }

  function bulkStatus(pct: number, label: string) {
    const sel = new Set(ids);
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, pctDone: pct } : r)));
    run(
      async () => {
        for (const id of ids) {
          const res = await A.setGoalPctDone({ id, pctDone: pct });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      `${ids.length} goal${ids.length === 1 ? "" : "s"} marked "${label}"`,
      clearSelection,
    );
  }

  function bulkTargetDate(iso: string | null) {
    const sel = new Set(ids);
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, targetDate: iso } : r)));
    run(
      async () => {
        for (const id of ids) {
          const res = await A.editGoal({ id, targetDate: iso });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      iso
        ? `Target date set on ${ids.length} goal${ids.length === 1 ? "" : "s"}`
        : `Target date cleared on ${ids.length} goal${ids.length === 1 ? "" : "s"}`,
      clearSelection,
    );
  }

  function bulkDivide() {
    run(
      async () => {
        for (const id of ids) {
          const res = await divideYearlyGoal({ id });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      `Divided ${ids.length} goal${ids.length === 1 ? "" : "s"} into 4 quarters + 12 months`,
      clearSelection,
    );
  }

  /* ---------- empty state ---------- */
  if (rows.length === 0) {
    return (
      <div
        className="wg-rise grid place-items-center rounded-2xl border px-6 py-14 text-center"
        style={{
          borderColor: "var(--color-hairline)",
          background: `linear-gradient(160deg, ${redTint(4)}, var(--color-surface-card))`,
        }}
      >
        <span
          className="mb-3 grid size-12 place-items-center rounded-2xl"
          style={{ background: redTint(10) }}
        >
          <ListChecks size={22} className="text-altus-red" />
        </span>
        <p className="text-[16px] font-bold text-ink-strong" style={{ fontFamily: "var(--font-serif)" }}>
          No goals yet
        </p>
        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-soft">
          This bucket is a blank page. Add a goal above and it will land here, ready to edit inline.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* scoped slider chrome */}
      <style>{`
        /* No vertical dividers — a clean list feel with only horizontal rules. */
        .gtv-table th, .gtv-table td { border-right: none; }
        /* Frozen header — stays put while the rows scroll. */
        .gtv-table thead th {
          position: sticky;
          top: 0;
          z-index: 6;
          background-image: linear-gradient(180deg,
            color-mix(in srgb, #6b7280 13%, var(--color-surface-card)),
            color-mix(in srgb, #6b7280 8%, var(--color-surface-card)));
          box-shadow: 0 2px 0 color-mix(in srgb, #6b7280 24%, var(--color-hairline-strong));
        }
      `}</style>

      {/* ---------- sticky bulk-actions bar ---------- */}
      {selected.size > 0 && (
        <div
          className="wg-rise sticky top-2 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 backdrop-blur-md"
          style={{
            borderColor: redTint(35),
            background: `linear-gradient(120deg, ${redTint(10)}, color-mix(in srgb, var(--color-surface-card) 82%, transparent))`,
            boxShadow: `0 14px 34px -16px ${redTint(45)}, 0 2px 8px -4px rgba(15,23,42,0.15)`,
          }}
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-bold text-white tabular-nums"
            style={{ background: "var(--color-altus-red)", fontFamily: "var(--font-display)" }}
          >
            {selected.size} selected
          </span>

          {/* Edit — only when EXACTLY one row is selected (single-goal edit). */}
          {!weekly && selected.size === 1 && (
            <button
              type="button"
              onClick={() => {
                const g = rows.find((r) => selected.has(r.id));
                if (g) setEditingGoal(g);
              }}
              className={cn(
                "wg-sheen inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red",
                FOCUS_RING,
              )}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              <Pencil size={13} strokeWidth={2.6} /> Edit
            </button>
          )}

          <button
            type="button"
            onClick={bulkDelete}
            className={cn(
              "wg-sheen inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold text-altus-red transition-colors hover:bg-altus-red hover:text-white",
              FOCUS_RING,
            )}
            style={{ borderColor: "var(--color-altus-red)" }}
          >
            <Trash2 size={13} strokeWidth={2.6} /> Delete
          </button>

          {level === "year" && (
            <>
              <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
              <button
                type="button"
                onClick={bulkDivide}
                title="Divide each selected yearly goal into 4 quarters + 12 months"
                className={cn(
                  "wg-sheen inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold text-altus-red transition-colors hover:bg-altus-red hover:text-white",
                  FOCUS_RING,
                )}
                style={{ borderColor: "var(--color-altus-red)" }}
              >
                <Split size={13} strokeWidth={2.6} /> Divide into 4Q + 12M
              </button>
            </>
          )}

          <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />

          <BulkMembers roster={roster} count={selected.size} onApply={bulkSetMembers} />
          {!weekly && <BulkDelegate roster={roster} count={selected.size} onApply={bulkSetDelegate} />}

          <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
          <BulkStatusMenu onPick={bulkStatus} />

          {!weekly && (
            <>
              {/* Context-aware copy: only the CURRENT level's immediate child periods. */}
              {childMap && childMap.targets.length > 0 && (
                <>
                  <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
                  <CopyToMenu childMap={childMap} count={selected.size} onCopy={requestCopy} />
                </>
              )}

              {/* Move to a sibling bucket at this level (quarter / month only). */}
              {siblings.length > 0 && (
                <MoveToMenu siblings={siblings} noun={level === "quarter" ? "quarter" : "month"} onMove={bulkMove} />
              )}

              {/* Target date — an editable deadline only exists on month goals.
                  PHASE 2: week deadlines are composer-driven on the weekly board. */}
              {level === "month" && <BulkTargetDate onApply={bulkTargetDate} />}
            </>
          )}

          <button
            type="button"
            onClick={clearSelection}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-bold text-ink-subtle transition-colors hover:text-ink-strong",
              FOCUS_RING,
            )}
          >
            <X size={13} strokeWidth={2.6} /> Clear
          </button>
        </div>
      )}

      {/* ---------- the table ---------- */}
      <div
        className="wg-rise max-h-[74vh] overflow-auto rounded-2xl border"
        onKeyDown={grid.onKeyDown}
        onBlur={(e) => {
          // Clear the active-cell highlight when focus leaves the table entirely
          // (fixes the stuck red/highlight box that never went away).
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) grid.blur();
        }}
        style={{
          borderColor: "var(--color-hairline-strong)",
          background: "var(--color-surface-card)",
          boxShadow: "0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.28)",
        }}
      >
        <table className="gtv-table w-full border-collapse text-[13.5px]">
          <thead>
            <tr
              style={{
                background: `linear-gradient(180deg, color-mix(in srgb, #6b7280 13%, var(--color-surface-card)), color-mix(in srgb, #6b7280 8%, var(--color-surface-card)))`,
                borderBottom: "2px solid color-mix(in srgb, #6b7280 24%, var(--color-hairline-strong))",
              }}
            >
              <th className={cn(TH, "w-9 pl-3")}>
                <BrandCheck
                  checked={allSelected}
                  indeterminate={someSelected}
                  onToggle={toggleAll}
                  label="Select all goals"
                />
              </th>
              <th className={cn(TH, "w-px text-center")}>#</th>
              <th className={cn(TH, "min-w-[104px] text-center")}>Area</th>
              <th className={cn(TH, "min-w-[280px]")}>Goal</th>
              <th className={cn(TH, "min-w-[104px] text-center")}>Measure</th>
              <th className={cn(TH, "text-center")}>Actual</th>
              <th className={cn(TH, "text-center")}>Target</th>
              <th className={cn(TH, "w-[64px] text-center")}>% Done</th>
              <th className={cn(TH, "w-[60px] text-center")}>Team %</th>
              <th className={cn(TH, "w-[64px] text-center")}>Weight</th>
              <th className={cn(TH, "min-w-[150px]")}>Delegated</th>
              {(level === "month" || level === "week") && (
                <th className={cn(TH, "min-w-[132px] text-center")}>Target Date</th>
              )}
              <th className={cn(TH, "min-w-[104px] text-center")}>Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => {
              const isSel = selected.has(g.id);
              const t = num(g.targetQty);
              const a = num(g.actualQty);
              return (
                <React.Fragment key={g.id}>
                <tr
                  className="group transition-colors"
                  style={{
                    borderBottom: i === rows.length - 1 ? undefined : "1px solid color-mix(in srgb, var(--color-ink-strong) 12%, transparent)",
                    background: isSel ? "color-mix(in srgb, var(--color-ink-strong) 5%, transparent)" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSel) e.currentTarget.style.background = "color-mix(in srgb, var(--color-ink-strong) 3.5%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSel ? "color-mix(in srgb, var(--color-ink-strong) 5%, transparent)" : "";
                  }}
                >
                  {/* select */}
                  <td className="py-4 pl-3 pr-1 align-middle">
                    <BrandCheck checked={isSel} onToggle={() => toggleRow(g.id)} label={`Select "${g.title}"`} />
                  </td>

                  {/* Sr. No — auto-code Y1 / AQ1 / AprM1 + Mine/Assigned pill */}
                  <td className="px-2 py-4 align-middle">
                    <div className="flex flex-col items-start gap-1">
                      {/* The goal CODE is the hover/click handle. It is the one
                          cell in the row that is not an inline editor, so making
                          it the trigger adds the preview + details without
                          competing with typing in the title, target or notes. */}
                      <GoalPreview goal={g} ownerName={ownerNameOf?.(g) ?? null}>
                        <span
                          className="whitespace-nowrap text-[13px] font-bold text-ink-soft tabular-nums underline decoration-transparent underline-offset-2 transition-colors hover:text-altus-red hover:decoration-current"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {codeOf ? codeOf(g) : goalCode({ period: g.period, periodKey: g.periodKey, position: i + 1, id: g.id })}
                        </span>
                      </GoalPreview>
                      {/* Assignment Type — Self / Assigned (assigned carries a
                          by · on · source tooltip). Every level can be assigned. */}
                      {level !== "day" && <AssignmentChip goal={g} />}
                    </div>
                  </td>

                  {/* Area */}
                  <td {...grid.cellProps(i, grid.ci("area"), "px-2 py-4 align-middle")}>
                    <div className={cn(locked && "pointer-events-none opacity-60")}>
                      <GoalLookupSelect
                        kind="area"
                        noun="Area"
                        compact
                        placeholder="Area"
                        value={g.area ?? ""}
                        options={areaOptions}
                        custom={customLookups.areas}
                        isAdmin={isAdmin}
                        onChange={(v) => grid.commit("area", g, v)}
                      />
                    </div>
                  </td>

                  {/* Goal title (inline in BOTH engines now) + Notes/Files expander */}
                  <td {...grid.cellProps(i, grid.ci("title"), "px-2.5 py-4 align-top")}>
                    {/* Multiline so the FULL goal is always visible — the cell wraps
                        and auto-grows instead of truncating (no hover-peek needed). */}
                    <TextCell
                      multiline
                      value={g.title}
                      disabled={locked}
                      ariaLabel="Goal title"
                      placeholder="Goal…"
                      // Title is required — the "title" column's parse rejects a blank
                      // commit (returns null), so the row is never left without a name.
                      onCommit={(v) => grid.commit("title", g, v)}
                    />
                    {/* Notes stay inline-editable in the expandable detail row below
                        (a textarea + attachments that commits via editGoal({notes})
                        through patchNotes) — no separate Notes column needed. The
                        Target Date moved out to its own column (after Delegated). */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(g.id)}
                      aria-expanded={expanded.has(g.id)}
                      // `data-cell-expander` lets the grid open this from the title
                      // cell via Shift+Enter; `data-notes-toggle` lets the detail
                      // row return focus here on Esc — both keyboard-only paths.
                      data-cell-expander
                      data-notes-toggle={g.id}
                      className={cn(
                        "mt-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-black uppercase tracking-[0.04em] transition-colors hover:bg-altus-red hover:text-white",
                        FOCUS_RING,
                      )}
                      style={{
                        borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)",
                        background: "color-mix(in srgb, var(--color-altus-red) 7%, transparent)",
                        color: "var(--color-altus-red-deep)",
                      }}
                    >
                      <ChevronDown
                        size={12}
                        strokeWidth={2.6}
                        className={cn("transition-transform", expanded.has(g.id) && "rotate-180")}
                      />
                      Notes &amp; Files
                      {(g.notes?.trim()?.length ?? 0) > 0 && (
                        <span
                          aria-label="has notes"
                          className="ml-0.5 inline-block size-1.5 rounded-full"
                          style={{ background: "var(--color-altus-red)" }}
                        />
                      )}
                    </button>
                  </td>

                  {/* Measure */}
                  <td {...grid.cellProps(i, grid.ci("measure"), "px-2 py-4 align-middle text-center")}>
                    <div className={cn(locked && "pointer-events-none opacity-60")}>
                      <GoalLookupSelect
                        kind="measure"
                        noun="Measure"
                        compact
                        placeholder="Measure"
                        value={g.uom ?? ""}
                        options={measureOptions}
                        custom={customLookups.measures}
                        isAdmin={isAdmin}
                        onChange={(v) => grid.commit("measure", g, v)}
                      />
                    </div>
                  </td>

                  {/* Actual — its own grid cell (was half of "Actual / Target") */}
                  <td {...grid.cellProps(i, grid.ci("actual"), "px-2 py-4 align-middle text-center")}>
                    <NumBox
                      value={trimDecimal(g.actualQty)}
                      disabled={locked}
                      ariaLabel="Actual"
                      placeholder="Actual"
                      className="w-[64px]"
                      onCommit={(raw) => grid.commit("actual", g, raw)}
                    />
                    {Math.abs(a ?? 0) >= 1000 && (
                      <p className="mt-0.5 pl-0.5 text-[10.5px] font-semibold text-ink-subtle tabular-nums">
                        {fmtNum(g.actualQty)}
                      </p>
                    )}
                  </td>

                  {/* Target — its own grid cell */}
                  <td {...grid.cellProps(i, grid.ci("target"), "px-2 py-4 align-middle text-center")}>
                    <NumBox
                      value={trimDecimal(g.targetQty)}
                      disabled={locked}
                      ariaLabel="Target"
                      placeholder="Target"
                      className="w-[64px]"
                      onCommit={(raw) => grid.commit("target", g, raw)}
                    />
                    {Math.abs(t ?? 0) >= 1000 && (
                      <p className="mt-0.5 pl-0.5 text-[10.5px] font-semibold text-ink-subtle tabular-nums">
                        {fmtNum(g.targetQty)}
                      </p>
                    )}
                  </td>

                  {/* % Done — auto-derived from Target ÷ Actual when both drive it */}
                  <td {...grid.cellProps(i, grid.ci("pct"), "px-2 py-4 align-middle text-center")}>
                    {(() => {
                      const auto = autoPctDone(g.targetQty, g.actualQty);
                      return (
                        <PctCell
                          pct={auto ?? g.pctDone}
                          disabled={locked}
                          auto={auto !== null}
                          onCommit={(p) => grid.commit("pct", g, String(p))}
                        />
                      );
                    })()}
                  </td>

                  {/* Team % */}
                  <td {...grid.cellProps(i, grid.ci("teamPct"), "px-2 py-4 align-middle text-center")}>
                    <NumBox
                      value={g.teamDependencyPct == null ? "" : String(g.teamDependencyPct)}
                      min={0}
                      max={100}
                      disabled={locked}
                      ariaLabel="Team participation percent"
                      className="w-[56px]"
                      onCommit={(raw) => grid.commit("teamPct", g, raw)}
                    />
                  </td>

                  {/* Weight — #14: editable inline at every level, incl. inherited */}
                  <td {...grid.cellProps(i, grid.ci("weight"), "px-2 py-4 align-middle text-center")}>
                    <NumBox
                      value={String(g.weight ?? 100)}
                      min={0}
                      max={1000}
                      disabled={locked}
                      ariaLabel="Goal weightage"
                      className="w-[60px]"
                      onCommit={(raw) => grid.commit("weight", g, raw)}
                    />
                  </td>

                  {/* Delegated — accountability hand-off with per-delegate %.
                      A navigable (non-typeable) grid cell: arrow-nav lands here and
                      Enter/type opens the picker with its search auto-focused. */}
                  <td {...grid.cellProps(i, grid.ci("delegate"), "px-2 py-4 align-middle")}>
                    <DelegatesCell
                      delegates={g.delegatedTo ?? null}
                      roster={roster}
                      disabled={locked}
                      onCommit={(next) => editField(g.id, { delegatedTo: next }, () => A.editGoal({ id: g.id, delegatedTo: next }))}
                    />
                  </td>

                  {/* Target Date — moved out of the Goal cell into its own column.
                      Month goals are editable; week goals show a read-only chip. */}
                  {(level === "month" || level === "week") && (
                    <td className="px-2 py-4 align-middle text-center">
                      <TargetDateInline
                        iso={g.targetDate}
                        editable={level === "month" && !weekly}
                        disabled={locked}
                        onCommit={(v) =>
                          editField(g.id, { targetDate: v }, () => A.editGoal({ id: g.id, targetDate: v }))
                        }
                      />
                    </td>
                  )}

                  {/* Type — fixed Goal Type taxonomy (goalType), not free-text category */}
                  <td {...grid.cellProps(i, grid.ci("type"), "px-2 py-4 align-middle text-center")}>
                    <div className={cn(locked && "pointer-events-none opacity-60")}>
                      <GoalLookupSelect
                        kind="goaltype"
                        noun="Type"
                        compact
                        placeholder="Type"
                        // Built-in codes render via their label; an admin-added
                        // custom type is stored raw, so fall back to the value.
                        value={g.goalType ? GOAL_TYPE_LABELS[g.goalType as GoalType] ?? g.goalType : ""}
                        options={goaltypeOptions ?? GOAL_TYPE_OPTIONS}
                        custom={customLookups.goaltypes ?? []}
                        isAdmin={isAdmin && goaltypeOptions !== undefined}
                        onChange={(v) => grid.commit("type", g, v)}
                      />
                    </div>
                  </td>

                </tr>
                {expanded.has(g.id) && (
                  <GoalDetailRow
                    goalId={g.id}
                    notes={g.notes}
                    canWrite={!locked}
                    colSpan={level === "month" || level === "week" ? 13 : 12}
                    nodeKind={detailKind}
                    assignment={assignmentInfo(g)}
                    onSaveNotes={(n) => patchNotes(g.id, n)}
                    onClose={() => {
                      toggleExpand(g.id);
                      requestAnimationFrame(() =>
                        document.querySelector<HTMLElement>(`[data-notes-toggle="${g.id}"]`)?.focus(),
                      );
                    }}
                  />
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* footer count + spreadsheet keyboard hint */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-1">
        <p className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">
          {rows.length} goal{rows.length === 1 ? "" : "s"}
          {selected.size > 0 && <> · {selected.size} selected</>}
        </p>
        {!locked && (
          <p className="text-[11px] font-medium text-ink-subtle">
            <span className="font-bold text-ink-soft">Grid:</span> click a cell · arrows to move ·
            Shift+arrows to select · Enter/type to edit ·{" "}
            <span className="tabular-nums">Ctrl/⌘</span>+C/V copy·paste · Ctrl/⌘+D fill down ·
            Ctrl/⌘+Z undo
          </p>
        )}
      </div>

      {editingGoal && (
        <GoalEditDialog
          mode={{ kind: "edit", goal: editingGoal }}
          roster={roster}
          open={!!editingGoal}
          onOpenChange={(o) => {
            if (!o) setEditingGoal(null);
          }}
        />
      )}

      <DupCollisionDialog
        open={dupPrompt != null}
        collisions={dupPrompt?.collisions ?? {}}
        labelFor={childLabelFor}
        onResolve={(mode) => {
          const pending = dupPrompt;
          setDupPrompt(null);
          if (mode && pending) performCopy(pending.keys, mode);
        }}
      />
    </div>
  );
}
