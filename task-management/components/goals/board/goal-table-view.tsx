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
import {
  Check,
  ChevronDown,
  Copy,
  ListChecks,
  Minus,
  Pencil,
  Plus,
  Split,
  Trash2,
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
  bulkArchiveGoals,
  bulkSetShareWithTeam,
  bulkCopyGoalsToPeriod,
} from "@/app/(app)/goals/cascade/actions";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { pctTone, fmtNum, num, periodKeyLabel, goalCode } from "@/components/goals/cascade/util";
import type { GoalDTO, RosterMember } from "@/components/goals/cascade/util";
import { autoPctDone } from "@/lib/goals/auto-pct";
import { quartersOfFy } from "@/lib/goals/types";
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
  customLookups: { areas: string[]; measures: string[]; types: string[] };
  fyStartYear: number;
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
        "h-9 rounded-md border-[1.5px] bg-white px-2 text-right text-[13.5px] font-semibold text-ink-strong tabular-nums transition-colors focus:border-altus-red",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        FOCUS_RING,
        className,
      )}
      style={{ borderColor: "color-mix(in srgb, var(--color-ink-strong) 34%, transparent)", fontFamily: "var(--font-display)" }}
    />
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
    <div className="flex items-center justify-center gap-1.5">
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
        className="w-[52px]"
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
  const list = team ?? [];
  const picked = React.useMemo(() => new Set(list.map(memberKey)), [list]);

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
            type="button"
            disabled={disabled}
            aria-label="Edit team members + weights"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-[11px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red",
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
          className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
          style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
        >
          <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            <Users size={12} /> Members &amp; weights
          </p>
          <div className="max-h-64 overflow-auto">
            {roster.map((r) => {
              const isSel = isPicked(r);
              const mine = list.find(
                (m) => m.employeeId === r.id || (!m.employeeId && (m.name ?? "").toLowerCase() === r.name.toLowerCase()),
              );
              return (
                <div
                  key={r.id}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", isSel ? "" : "hover:bg-black/[0.04]")}
                  style={isSel ? { background: redTint(10) } : undefined}
                >
                  <button
                    type="button"
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
            {roster.length === 0 && <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">No roster.</p>}
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
/* Cell: Share-with-team Yes/No pill                                   */
/* ------------------------------------------------------------------ */

function SharePill({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "inline-flex overflow-hidden rounded-full border text-[11px] font-bold",
        disabled && "cursor-not-allowed opacity-60",
      )}
      style={{
        borderColor: on ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
        background: on ? redTint(8) : "var(--color-surface-card)",
      }}
      role="group"
      aria-label="Share with team"
    >
      {([true, false] as const).map((v) => {
        const active = on === v;
        return (
          <button
            key={String(v)}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => !active && onChange(v)}
            className={cn("px-2.5 py-1 transition-colors disabled:cursor-not-allowed", FOCUS_RING)}
            style={
              active
                ? v
                  ? { background: "var(--color-altus-red)", color: "#fff" }
                  : { background: "var(--color-ink-soft)", color: "#fff" }
                : { color: "var(--color-ink-subtle)" }
            }
          >
            {v ? "Yes" : "No"}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

const TH =
  "px-2 py-4 text-left text-[12.5px] font-black uppercase tracking-[0.07em] text-ink-strong whitespace-nowrap";

export function GoalTableView(props: GoalTableViewProps) {
  const {
    goals,
    canWrite,
    isAdmin,
    roster,
    areaOptions,
    measureOptions,
    typeOptions,
    customLookups,
    fyStartYear,
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

  const quarters = React.useMemo(() => quartersOfFy(fyStartYear), [fyStartYear]);
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
  function bulkShare(share: boolean) {
    const sel = new Set(ids);
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, shareWithTeam: share } : r)));
    run(
      () => bulkSetShareWithTeam({ ids, shareWithTeam: share }),
      share ? "Now sharing with the team" : "Sharing turned off",
      clearSelection,
    );
  }
  function bulkSetMembers(team: TeamRef[]) {
    const sel = new Set(ids);
    const value = team.length ? team : null;
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, teamInvolved: value } : r)));
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
  function bulkCopy(targetKey: string) {
    run(
      () => bulkCopyGoalsToPeriod({ ids, targetLevel: "quarter", targetKey }),
      `Copied ${ids.length} goal${ids.length === 1 ? "" : "s"} to ${periodKeyLabel(targetKey)}`,
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
        /* Prominent column dividers so the user clearly sees each column split. */
        .gtv-table th, .gtv-table td {
          border-right: 1.5px solid color-mix(in srgb, var(--color-ink-strong) 28%, transparent);
        }
        .gtv-table th:last-child, .gtv-table td:last-child { border-right: none; }
        /* Frozen header — stays put while the rows scroll. */
        .gtv-table thead th {
          position: sticky;
          top: 0;
          z-index: 6;
          border-right-color: color-mix(in srgb, var(--color-altus-red) 45%, transparent);
          background-image: linear-gradient(120deg,
            color-mix(in srgb, var(--color-altus-red) 16%, var(--color-surface-card)),
            color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card)));
          box-shadow: 0 2px 0 color-mix(in srgb, var(--color-altus-red) 34%, var(--color-hairline-strong));
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

          {!weekly && (
            <>
              <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
              <span className="text-[12px] font-bold text-ink-soft">Share with Team</span>
              <div className="inline-flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-hairline-strong)" }}>
                <button
                  type="button"
                  onClick={() => bulkShare(true)}
                  className={cn("bg-surface-card px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-altus-red hover:text-white", FOCUS_RING)}
                >
                  Yes
                </button>
                <span className="w-px" style={{ background: "var(--color-hairline-strong)" }} />
                <button
                  type="button"
                  onClick={() => bulkShare(false)}
                  className={cn("bg-surface-card px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-black/[0.06]", FOCUS_RING)}
                >
                  No
                </button>
              </div>
            </>
          )}

          <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />

          <BulkMembers roster={roster} count={selected.size} onApply={bulkSetMembers} />

          {!weekly && (
            <>
              <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-ink-soft">
                <Copy size={12} /> Copy to
              </span>
              <div className="inline-flex gap-1">
                {quarters.map((qk, i) => (
                  <button
                    key={qk}
                    type="button"
                    onClick={() => bulkCopy(qk)}
                    title={`Copy to ${periodKeyLabel(qk)}`}
                    className={cn(
                      "rounded-lg border bg-surface-card px-2.5 py-1.5 text-[12.5px] font-bold text-ink-strong tabular-nums transition-colors hover:border-altus-red hover:text-altus-red",
                      FOCUS_RING,
                    )}
                    style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                  >
                    Q{i + 1}
                  </button>
                ))}
              </div>
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
                background: `linear-gradient(120deg, ${redTint(16)}, ${redTint(8)})`,
                borderBottom: "2px solid color-mix(in srgb, var(--color-altus-red) 34%, var(--color-hairline-strong))",
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
              <th className={cn(TH, "w-9")} aria-label="Delete" />
              <th className={cn(TH, "w-14")}>#</th>
              <th className={cn(TH, "min-w-[104px]")}>Area</th>
              <th className={cn(TH, "min-w-[150px]")}>Goal</th>
              <th className={cn(TH, "min-w-[104px]")}>Measure</th>
              <th className={TH}>Actual / Target</th>
              <th className={cn(TH, "text-center")}>
                <span className="inline-flex items-center gap-1.5">
                  % Done
                  <span
                    aria-label="Auto-calculated from Actual ÷ Target"
                    title="Auto-calculated from Actual ÷ Target"
                    className="inline-flex h-[18px] items-center rounded-full px-1.5 text-[9px] font-black uppercase tracking-[0.06em]"
                    style={{ color: "var(--color-altus-red-deep)", background: redTint(12) }}
                  >
                    auto
                  </span>
                </span>
              </th>
              <th className={cn(TH, "w-[60px]")}>Team %</th>
              <th className={cn(TH, "min-w-[140px]")}>Members</th>
              {!weekly && <th className={TH}>Share</th>}
              {!weekly && <th className={cn(TH, "min-w-[104px]")}>Type</th>}
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
                    borderBottom: i === rows.length - 1 ? undefined : "1px solid var(--color-hairline)",
                    background: isSel ? redTint(5) : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSel) e.currentTarget.style.background = "color-mix(in srgb, var(--color-altus-red) 2.5%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSel ? redTint(5) : "";
                  }}
                >
                  {/* select */}
                  <td className="py-4 pl-3 pr-1 align-middle">
                    <BrandCheck checked={isSel} onToggle={() => toggleRow(g.id)} label={`Select "${g.title}"`} />
                  </td>

                  {/* edit (top) + delete (bottom) — left for easy access */}
                  <td className="px-1 py-4 align-middle">
                    <div className="flex flex-col items-center gap-1.5">
                      {!weekly && (
                        <button
                          type="button"
                          disabled={locked}
                          aria-label={`Edit "${g.title}"`}
                          title="Edit goal"
                          onClick={() => setEditingGoal(g)}
                          className={cn(
                            "grid size-7 place-items-center rounded-md border text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            FOCUS_RING,
                          )}
                          style={{ borderColor: "var(--color-hairline-strong)" }}
                        >
                          <Pencil size={12} strokeWidth={2.4} />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={locked}
                        aria-label={`Delete "${g.title}"`}
                        title="Delete (moves to recycle bin)"
                        onClick={() => removeRows([g.id], () => A.archiveGoal({ id: g.id }), "Goal moved to the recycle bin")}
                        className={cn(
                          "grid size-7 place-items-center rounded-md border text-altus-red transition-colors hover:bg-altus-red hover:text-white",
                          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-altus-red",
                          FOCUS_RING,
                        )}
                        style={{ borderColor: redTint(40) }}
                      >
                        <Trash2 size={13} strokeWidth={2.4} />
                      </button>
                    </div>
                  </td>

                  {/* Sr. No — auto-code Y1 / AQ1 / AprM1, sequential with no gaps */}
                  <td className="px-2 py-4 align-middle">
                    <span
                      className="whitespace-nowrap text-[13px] font-bold text-ink-soft tabular-nums"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {goalCode({ period: g.period, periodKey: g.periodKey, position: i + 1, id: g.id })}
                    </span>
                  </td>

                  {/* Area */}
                  <td className="px-2 py-4 align-middle">
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
                        onChange={(v) => editField(g.id, { area: v }, () => A.editGoal({ id: g.id, area: v }))}
                      />
                    </div>
                  </td>

                  {/* Goal title + Notes/Files expander */}
                  <td className="px-2.5 py-4 align-middle">
                    {weekly ? (
                      <input
                        defaultValue={g.title}
                        disabled={locked}
                        aria-label="Goal title"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== g.title) editField(g.id, { title: v }, () => A.editGoal({ id: g.id, title: v }));
                        }}
                        className={cn(
                          "w-full rounded-md border bg-white px-2 py-1 text-[14px] font-bold text-ink-strong focus:border-altus-red disabled:opacity-60",
                          FOCUS_RING,
                        )}
                        style={{ borderColor: "var(--color-hairline-strong)" }}
                      />
                    ) : (
                      <p className="line-clamp-2 text-[14.5px] font-bold leading-snug text-ink-strong" title={g.title}>
                        {g.title}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExpand(g.id)}
                      aria-expanded={expanded.has(g.id)}
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
                  <td className="px-2 py-4 align-middle">
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
                        onChange={(v) => editField(g.id, { uom: v }, () => A.editGoal({ id: g.id, uom: v }))}
                      />
                    </div>
                  </td>

                  {/* Actual / Target */}
                  <td className="px-2 py-4 align-middle">
                    <div className="flex items-center gap-1">
                      <NumBox
                        value={g.actualQty ?? ""}
                        disabled={locked}
                        ariaLabel="Actual"
                        placeholder="Act"
                        className="w-[54px]"
                        onCommit={(raw) =>
                          editField(
                            g.id,
                            { actualQty: raw === "" ? null : raw },
                            () => A.editGoal({ id: g.id, actualQty: raw === "" ? null : raw }),
                          )
                        }
                      />
                      <span className="text-[13px] font-bold text-ink-subtle">/</span>
                      <NumBox
                        value={g.targetQty ?? ""}
                        disabled={locked}
                        ariaLabel="Target"
                        placeholder="Tgt"
                        className="w-[54px]"
                        onCommit={(raw) =>
                          editField(
                            g.id,
                            { targetQty: raw === "" ? null : raw },
                            () => A.editGoal({ id: g.id, targetQty: raw === "" ? null : raw }),
                          )
                        }
                      />
                    </div>
                    {(Math.abs(t ?? 0) >= 1000 || Math.abs(a ?? 0) >= 1000) && (
                      <p className="mt-0.5 pl-0.5 text-[10.5px] font-semibold text-ink-subtle tabular-nums">
                        {fmtNum(g.actualQty)} / {fmtNum(g.targetQty)}
                      </p>
                    )}
                  </td>

                  {/* % Done — auto-derived from Target ÷ Actual when both drive it */}
                  <td className="px-2 py-4 align-middle">
                    {(() => {
                      const auto = autoPctDone(g.targetQty, g.actualQty);
                      return (
                        <PctCell
                          pct={auto ?? g.pctDone}
                          disabled={locked}
                          auto={auto !== null}
                          onCommit={(p) => editField(g.id, { pctDone: p }, () => A.setGoalPctDone({ id: g.id, pctDone: p }))}
                        />
                      );
                    })()}
                  </td>

                  {/* Team % */}
                  <td className="px-2 py-4 align-middle">
                    <NumBox
                      value={g.teamDependencyPct == null ? "" : String(g.teamDependencyPct)}
                      min={0}
                      max={100}
                      disabled={locked}
                      ariaLabel="Team participation percent"
                      className="w-[56px]"
                      onCommit={(raw) => {
                        const n = raw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
                        editField(g.id, { teamDependencyPct: n }, () => A.editGoal({ id: g.id, teamDependencyPct: n }));
                      }}
                    />
                  </td>

                  {/* Team members */}
                  <td className="px-2 py-4 align-middle">
                    <TeamMembersCell
                      team={g.teamInvolved}
                      roster={roster}
                      disabled={locked}
                      onCommit={(next) => editField(g.id, { teamInvolved: next }, () => A.editGoal({ id: g.id, teamInvolved: next }))}
                    />
                  </td>

                  {/* Share w/ team */}
                  {!weekly && (
                    <td className="px-2 py-4 align-middle">
                      <SharePill
                        on={g.shareWithTeam}
                        disabled={locked}
                        onChange={(v) => editField(g.id, { shareWithTeam: v }, () => A.editGoal({ id: g.id, shareWithTeam: v }))}
                      />
                    </td>
                  )}

                  {/* Type */}
                  {!weekly && (
                    <td className="px-2 py-4 align-middle">
                      <div className={cn(locked && "pointer-events-none opacity-60")}>
                        <GoalLookupSelect
                          kind="type"
                          noun="Type"
                          compact
                          placeholder="Type"
                          value={g.category ?? ""}
                          options={typeOptions}
                          custom={customLookups.types}
                          isAdmin={isAdmin}
                          onChange={(v) => editField(g.id, { category: v }, () => A.editGoal({ id: g.id, category: v }))}
                        />
                      </div>
                    </td>
                  )}

                </tr>
                {expanded.has(g.id) && (
                  <GoalDetailRow
                    goalId={g.id}
                    notes={g.notes}
                    canWrite={!locked}
                    colSpan={weekly ? 10 : 12}
                    nodeKind={detailKind}
                    onSaveNotes={(n) => patchNotes(g.id, n)}
                  />
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* footer count */}
      <p className="mt-2 pl-1 text-[11.5px] font-semibold text-ink-subtle tabular-nums">
        {rows.length} goal{rows.length === 1 ? "" : "s"}
        {selected.size > 0 && <> · {selected.size} selected</>}
      </p>

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
    </div>
  );
}
