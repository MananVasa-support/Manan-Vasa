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
  Copy,
  ListChecks,
  Minus,
  MoreHorizontal,
  Plus,
  Split,
  Trash2,
  Users,
  X,
} from "lucide-react";
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
import { pctTone, fmtNum, num, periodKeyLabel } from "@/components/goals/cascade/util";
import type { GoalDTO, RosterMember } from "@/components/goals/cascade/util";
import { quartersOfFy } from "@/lib/goals/types";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

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
  level: "year" | "quarter" | "month";
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
        borderColor: on ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
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
        "h-9 rounded-md border bg-white px-2 text-right text-[13.5px] font-semibold text-ink-strong tabular-nums transition-colors focus:border-altus-red",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        FOCUS_RING,
        className,
      )}
      style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Cell: % Done — tone slider + number box                             */
/* ------------------------------------------------------------------ */

function PctCell({
  pct,
  disabled,
  onCommit,
}: {
  pct: number;
  disabled: boolean;
  onCommit: (pct: number) => void;
}) {
  const [draft, setDraft] = React.useState(pct);
  React.useEffect(() => setDraft(pct), [pct]);
  const tone = pctTone(draft);

  function commitSlider() {
    if (draft !== pct) onCommit(draft);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={draft}
        disabled={disabled}
        aria-label="Percent done"
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commitSlider}
        onBlur={commitSlider}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key))
            commitSlider();
        }}
        className="gtv-range w-[64px] shrink-0"
        style={
          {
            "--gtv-tone": tone.color,
            background: `linear-gradient(to right, ${tone.color} 0% ${draft}%, var(--color-hairline) ${draft}% 100%)`,
          } as React.CSSProperties
        }
      />
      <NumBox
        value={String(pct)}
        min={0}
        max={100}
        disabled={disabled}
        ariaLabel="Percent done value"
        onCommit={(raw) => {
          const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
          if (n !== pct) onCommit(n);
        }}
        className="w-[46px]"
      />
      <span className="text-[11px] font-bold tabular-nums" style={{ color: tone.color }}>%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Team members — name chips + roster popover                    */
/* ------------------------------------------------------------------ */

type TeamRef = { employeeId?: string; name?: string };

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

  function toggle(member: RosterMember) {
    const key = member.id;
    const has = picked.has(key) || list.some((m) => !m.employeeId && (m.name ?? "").toLowerCase() === member.name.toLowerCase());
    const next = has
      ? list.filter(
          (m) => m.employeeId !== key && !(m.employeeId == null && (m.name ?? "").toLowerCase() === member.name.toLowerCase()),
        )
      : [...list, { employeeId: member.id, name: member.name }];
    onCommit(next.length ? next : null);
  }

  const shown = list.slice(0, 3);
  const extra = list.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((m) => (
        <span
          key={memberKey(m)}
          title={m.name}
          className="inline-flex max-w-[92px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold text-ink-strong"
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
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-altus-red-deep"
          style={{ background: redTint(10) }}
          title={list.slice(3).map((m) => m.name).join(", ")}
        >
          +{extra}
        </span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Edit team members"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-[11px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red",
              "disabled:cursor-not-allowed disabled:opacity-60",
              FOCUS_RING,
            )}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <Plus size={11} strokeWidth={3} /> member
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="z-[80] w-60 rounded-xl border border-hairline bg-surface-card p-1.5"
          style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
        >
          <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            <Users size={12} /> Team members
          </p>
          <div className="max-h-64 overflow-auto">
            {roster.map((r) => {
              const isSel =
                picked.has(r.id) ||
                list.some((m) => !m.employeeId && (m.name ?? "").toLowerCase() === r.name.toLowerCase());
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    isSel ? "" : "hover:bg-black/[0.04]",
                  )}
                  style={isSel ? { background: redTint(10) } : undefined}
                >
                  <span className="inline-flex w-4 shrink-0 justify-center">
                    {isSel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                  </span>
                  <span className={cn("flex-1 truncate text-[13px]", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                    {r.name}
                  </span>
                </button>
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
/* Cell: ⋯ row menu (Divide · Copy to quarter…)                        */
/* ------------------------------------------------------------------ */

function RowMenu({
  showDivide,
  quarters,
  disabled,
  onDivide,
  onCopy,
}: {
  showDivide: boolean;
  quarters: string[];
  disabled: boolean;
  onDivide: () => void;
  onCopy: (targetKey: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Row actions"
          className={cn(
            "grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-black/[0.05] hover:text-ink-strong",
            "disabled:cursor-not-allowed disabled:opacity-60",
            FOCUS_RING,
          )}
        >
          <MoreHorizontal size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="z-[80] w-60 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        {showDivide && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDivide();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-ink-strong transition-colors hover:bg-black/[0.04]"
          >
            <Split size={14} className="shrink-0 text-altus-red" />
            Divide into 4 quarters + 12 months
          </button>
        )}
        <p className="flex items-center gap-1.5 px-2.5 pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
          <Copy size={11} /> Copy to quarter…
        </p>
        {quarters.map((qk) => (
          <button
            key={qk}
            type="button"
            onClick={() => {
              setOpen(false);
              onCopy(qk);
            }}
            className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold text-ink-strong transition-colors hover:bg-black/[0.04]"
          >
            {periodKeyLabel(qk)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
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

  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const quarters = React.useMemo(() => quartersOfFy(fyStartYear), [fyStartYear]);
  const allSelected = goals.length > 0 && goals.every((g) => selected.has(g.id));
  const someSelected = selected.size > 0 && !allSelected;
  const locked = !canWrite;

  /** Run a server action; refresh + toast on success, toast on failure. */
  const run = React.useCallback(
    (act: () => Promise<ActionRes>, okMsg: string, after?: () => void) => {
      startTransition(async () => {
        const res = await act();
        if (res.ok) {
          after?.();
          router.refresh();
          fireToast({ message: okMsg, type: "success" });
        } else {
          fireToast({ message: res.error, type: "error" });
        }
      });
    },
    [router],
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
    setSelected(allSelected ? new Set() : new Set(goals.map((g) => g.id)));
  }

  const clearSelection = React.useCallback(() => setSelected(new Set()), []);

  /* ---------- bulk actions ---------- */
  const ids = React.useMemo(() => [...selected], [selected]);

  function bulkDelete() {
    run(() => bulkArchiveGoals({ ids }), `${ids.length} goal${ids.length === 1 ? "" : "s"} moved to the recycle bin`, clearSelection);
  }
  function bulkShare(share: boolean) {
    run(
      () => bulkSetShareWithTeam({ ids, shareWithTeam: share }),
      share ? "Now sharing with the team" : "Sharing turned off",
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

  /* ---------- empty state ---------- */
  if (goals.length === 0) {
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
        .gtv-range { -webkit-appearance:none; appearance:none; height:5px; border-radius:999px; outline:none; cursor:pointer; }
        .gtv-range:disabled { opacity:.55; cursor:not-allowed; }
        .gtv-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:14px; height:14px; border-radius:50%;
          background:var(--gtv-tone); border:2.5px solid #fff; box-shadow:0 1px 5px rgba(15,23,42,.35); transition:transform .15s ease; }
        .gtv-range:not(:disabled)::-webkit-slider-thumb:hover { transform:scale(1.18); }
        .gtv-range::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:var(--gtv-tone);
          border:2.5px solid #fff; box-shadow:0 1px 5px rgba(15,23,42,.35); transition:transform .15s ease; }
        .gtv-range:not(:disabled)::-moz-range-thumb:hover { transform:scale(1.18); }
        @media (prefers-reduced-motion: reduce) {
          .gtv-range::-webkit-slider-thumb, .gtv-range::-moz-range-thumb { transition:none; }
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

          <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />

          <span className="text-[12px] font-bold text-ink-soft">Share with team</span>
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
        className="wg-rise overflow-x-auto rounded-2xl border"
        style={{
          borderColor: "var(--color-hairline-strong)",
          background: "var(--color-surface-card)",
          boxShadow: "0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.28)",
        }}
      >
        <table className="w-full border-collapse text-[13.5px]">
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
              <th className={cn(TH, "w-8")}>#</th>
              <th className={cn(TH, "min-w-[104px]")}>Area</th>
              <th className={cn(TH, "min-w-[150px]")}>Goal</th>
              <th className={cn(TH, "min-w-[104px]")}>Measure</th>
              <th className={TH}>Target / Actual</th>
              <th className={TH}>% Done</th>
              <th className={cn(TH, "w-[60px]")}>Team %</th>
              <th className={cn(TH, "min-w-[140px]")}>Members</th>
              <th className={TH}>Share</th>
              <th className={cn(TH, "min-w-[104px]")}>Type</th>
              <th className={cn(TH, "w-9 pr-3 text-right")} aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {goals.map((g, i) => {
              const isSel = selected.has(g.id);
              const t = num(g.targetQty);
              const a = num(g.actualQty);
              return (
                <tr
                  key={g.id}
                  className="group transition-colors"
                  style={{
                    borderBottom: i === goals.length - 1 ? undefined : "1px solid var(--color-hairline)",
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

                  {/* delete — left for easy access */}
                  <td className="px-1 py-4 align-middle">
                    <button
                      type="button"
                      disabled={locked}
                      aria-label={`Delete "${g.title}"`}
                      title="Delete (moves to recycle bin)"
                      onClick={() => run(() => archiveGoal({ id: g.id }), "Goal moved to the recycle bin")}
                      className={cn(
                        "grid size-7 place-items-center rounded-md border text-altus-red transition-colors hover:bg-altus-red hover:text-white",
                        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-altus-red",
                        FOCUS_RING,
                      )}
                      style={{ borderColor: redTint(40) }}
                    >
                      <Trash2 size={13} strokeWidth={2.4} />
                    </button>
                  </td>

                  {/* Sr. No — always 1..N with no gaps */}
                  <td className="px-2 py-4 align-middle">
                    <span
                      className="text-[13px] font-bold text-ink-soft tabular-nums"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {i + 1}
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
                        onChange={(v) => run(() => editGoal({ id: g.id, area: v }), "Area updated")}
                      />
                    </div>
                  </td>

                  {/* Goal title */}
                  <td className="px-2.5 py-4 align-middle">
                    <p className="line-clamp-2 text-[14.5px] font-bold leading-snug text-ink-strong" title={g.title}>
                      {g.title}
                    </p>
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
                        onChange={(v) => run(() => editGoal({ id: g.id, uom: v }), "Measure updated")}
                      />
                    </div>
                  </td>

                  {/* Target / Actual */}
                  <td className="px-2 py-4 align-middle">
                    <div className="flex items-center gap-1">
                      <NumBox
                        value={g.targetQty ?? ""}
                        disabled={locked}
                        ariaLabel="Target"
                        placeholder="Tgt"
                        className="w-[54px]"
                        onCommit={(raw) =>
                          run(() => editGoal({ id: g.id, targetQty: raw === "" ? null : raw }), "Target updated")
                        }
                      />
                      <span className="text-[13px] font-bold text-ink-subtle">/</span>
                      <NumBox
                        value={g.actualQty ?? ""}
                        disabled={locked}
                        ariaLabel="Actual"
                        placeholder="Act"
                        className="w-[54px]"
                        onCommit={(raw) =>
                          run(() => editGoal({ id: g.id, actualQty: raw === "" ? null : raw }), "Actual updated")
                        }
                      />
                    </div>
                    {(Math.abs(t ?? 0) >= 1000 || Math.abs(a ?? 0) >= 1000) && (
                      <p className="mt-0.5 pl-0.5 text-[10.5px] font-semibold text-ink-subtle tabular-nums">
                        {fmtNum(g.targetQty)} / {fmtNum(g.actualQty)}
                      </p>
                    )}
                  </td>

                  {/* % Done */}
                  <td className="px-2 py-4 align-middle">
                    <PctCell
                      pct={g.pctDone}
                      disabled={locked}
                      onCommit={(p) => run(() => setGoalPctDone({ id: g.id, pctDone: p }), `% done → ${p}%`)}
                    />
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
                        run(() => editGoal({ id: g.id, teamDependencyPct: n }), "Team % updated");
                      }}
                    />
                  </td>

                  {/* Team members */}
                  <td className="px-2 py-4 align-middle">
                    <TeamMembersCell
                      team={g.teamInvolved}
                      roster={roster}
                      disabled={locked}
                      onCommit={(next) => run(() => editGoal({ id: g.id, teamInvolved: next }), "Team members updated")}
                    />
                  </td>

                  {/* Share w/ team */}
                  <td className="px-2 py-4 align-middle">
                    <SharePill
                      on={g.shareWithTeam}
                      disabled={locked}
                      onChange={(v) =>
                        run(
                          () => editGoal({ id: g.id, shareWithTeam: v }),
                          v ? "Now sharing with the team" : "Sharing turned off",
                        )
                      }
                    />
                  </td>

                  {/* Type */}
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
                        onChange={(v) => run(() => editGoal({ id: g.id, category: v }), "Type updated")}
                      />
                    </div>
                  </td>

                  {/* ⋯ */}
                  <td className="py-4 pl-1 pr-3 text-right align-middle">
                    <RowMenu
                      showDivide={level === "year" && (isAdmin || canWrite)}
                      quarters={quarters}
                      disabled={locked && !isAdmin}
                      onDivide={() =>
                        run(() => divideYearlyGoal({ id: g.id }), "Divided into 4 quarters + 12 months")
                      }
                      onCopy={(qk) =>
                        run(
                          () => bulkCopyGoalsToPeriod({ ids: [g.id], targetLevel: "quarter", targetKey: qk }),
                          `Copied to ${periodKeyLabel(qk)}`,
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* footer count */}
      <p className="mt-2 pl-1 text-[11.5px] font-semibold text-ink-subtle tabular-nums">
        {goals.length} goal{goals.length === 1 ? "" : "s"}
        {selected.size > 0 && <> · {selected.size} selected</>}
      </p>
    </div>
  );
}
