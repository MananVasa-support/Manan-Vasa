"use client";

import * as React from "react";
import { Plus, Loader2, Check } from "lucide-react";
import { createGoal, addChildGoal } from "@/app/(app)/goals/cascade/actions";
import {
  periodKeyLabel,
  type GoalDTO,
  type MonthlyMasterRef,
  type RosterMember,
} from "@/components/goals/cascade/util";
import { buildOptimisticGoal, type GoalMutationApi } from "@/components/goals/canvas/optimistic";
import type { GoalPeriod } from "@/lib/goals/types";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { MonthlyMasterField } from "@/components/goals/board/goal-board-card";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { TeamWeightsField, type TeamMemberWeight } from "@/components/goals/board/team-weights-field";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

interface Props {
  employeeId: string;
  level: GoalPeriod;
  /** The exact bucket the new goal lands in ("2026" / "2026-Q1" / "2026-07"). */
  periodKey: string;
  /** The level-above goal OWNING this bucket (lowest Sr. No.), if any — the new
   *  goal files under it via addChildGoal; absent → a standalone via createGoal. */
  parent: { id: string; title: string } | null;
  areaOptions: string[];
  /** Measure dropdown options (→ goals.uom): base + admin-added. */
  measureOptions: string[];
  /** Type dropdown options (→ goals.category): base + admin-added. */
  typeOptions: string[];
  /** Admin-added (deletable) subsets per kind. */
  customLookups: { areas: string[]; measures: string[]; types: string[] };
  /** Admins get the inline "+ Add / delete option" affordances. */
  isAdmin: boolean;
  /** People pickable as team members (with per-member weights). */
  roster: RosterMember[];
  currentCount: number;
  mutation: GoalMutationApi;
  /** Small "+ Add" tile for a Kanban column footer (same composer drawer). */
  compact?: boolean;
}

/** Imperative handle — lets the board header's "+ New goal" button fire the
 *  SAME composer (one compose path, no duplicated create flow). */
export interface BoardQuickAddHandle {
  open: () => void;
}

/**
 * The dashed "+ Add Goal" tile for the Goals level board (goal-quick-add.tsx
 * design applied to the goals table). Opens the composer drawer; the create is
 * optimistic — a temp row appears instantly and reconciles with the returned
 * server row (Sr. No., normalised money strings).
 */
export const BoardQuickAdd = React.forwardRef<BoardQuickAddHandle, Props>(
  function BoardQuickAdd(props, ref) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [area, setArea] = React.useState("");
  const [measure, setMeasure] = React.useState("");
  const [type, setType] = React.useState("Goal");
  const [target, setTarget] = React.useState("");
  const [actual, setActual] = React.useState("");
  const [weight, setWeight] = React.useState("100");
  const [team, setTeam] = React.useState<TeamMemberWeight[]>([]);
  const [monthlyMasterRef, setMonthlyMasterRef] = React.useState<MonthlyMasterRef | null>(null);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setOpen(true);
        requestAnimationFrame(() => titleRef.current?.focus());
      },
    }),
    [],
  );

  const bucketLabel = periodKeyLabel(props.periodKey);
  const compact = props.compact ?? false;

  function reset() {
    setTitle("");
    setArea("");
    setMeasure("");
    setType("Goal");
    setTarget("");
    setActual("");
    setWeight("100");
    setTeam([]);
    setMonthlyMasterRef(null);
    setNotes("");
    setError(null);
  }

  function submit() {
    const t = title.trim();
    if (!t) {
      setError("Give the goal a name before saving.");
      titleRef.current?.focus();
      return;
    }
    setError(null);
    setSaving(true);

    const parsedWeight = Number.parseInt(weight, 10);
    const w = Number.isFinite(parsedWeight) ? Math.max(0, Math.min(1000, parsedWeight)) : 100;
    const numOrNull = (s: string): string | null => {
      const v = s.trim();
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? String(n) : null;
    };
    const fields = {
      title: t,
      area: area.trim() || null,
      uom: measure.trim() || null,
      category: type.trim() || "Goal",
      targetQty: numOrNull(target),
      actualQty: numOrNull(actual),
      teamInvolved: team.length ? team : null,
      notes: notes.trim() || null,
      weight: w,
      monthlyMasterRef,
    };
    const temp: GoalDTO = {
      ...buildOptimisticGoal({
        employeeId: props.employeeId,
        period: props.level,
        periodKey: props.periodKey,
        title: t,
        area: fields.area,
      }),
      category: fields.category,
      uom: fields.uom,
      targetQty: fields.targetQty,
      actualQty: fields.actualQty,
      teamInvolved: fields.teamInvolved,
      notes: fields.notes,
      weight: fields.weight,
      monthlyMasterRef: fields.monthlyMasterRef,
      parentGoalId: props.parent?.id ?? null,
    };

    void props.mutation
      .mutate({ type: "insert", row: temp }, () =>
        props.parent
          ? addChildGoal({ parentId: props.parent.id, periodKey: props.periodKey, ...fields })
          : createGoal({
              employeeId: props.employeeId,
              period: props.level,
              periodKey: props.periodKey,
              ...fields,
            }),
      )
      .then((ok) => {
        setSaving(false);
        if (!ok) return; // mutate toasted; the temp row reverted
        reset();
        titleRef.current?.focus();
      });
  }

  return (
    <>
      {/* The calm dashed "+ Add Goal" tile — deliberately NOT `.brand-btn`
          (its !important solid-red fill turned this into a giant red bar).
          Hairline dashed border, muted ink, gentle lift + red-tint on hover. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => titleRef.current?.focus());
        }}
        className={
          compact
            ? `wg-btn cursor-pointer group flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-2.5 text-[13px] font-bold transition-colors hover:bg-surface-soft hover:border-[color-mix(in_srgb,var(--color-altus-red)_45%,var(--color-hairline-strong))] ${FOCUS_RING}`
            : `wg-btn cursor-pointer group flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-5 text-[15px] font-bold transition-colors hover:bg-surface-soft hover:border-[color-mix(in_srgb,var(--color-altus-red)_45%,var(--color-hairline-strong))] ${FOCUS_RING}`
        }
        style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)", color: "var(--color-altus-red-deep)", background: "color-mix(in srgb, var(--color-altus-red) 4%, transparent)" }}
      >
        <span
          className={`inline-flex items-center justify-center rounded-full ${compact ? "size-5" : "size-7"}`}
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red)" }}
        >
          <Plus size={compact ? 13 : 16} strokeWidth={2.8} />
        </span>
        Add Goal
        {!compact && (
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
            · into {bucketLabel}
          </span>
        )}
      </button>

      <WeeklyGoalDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        eyebrow={`New Goal · #${props.currentCount + 1} · ${bucketLabel}`}
        title={`Add a ${props.level} Goal`}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
              ⌘/Ctrl + Enter to save
              {props.parent ? ` · files under “${props.parent.title}”` : " · standalone in this bucket"}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-[14px] font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`}
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
              Add Goal
            </button>
          </div>
        }
      >
        <div
          className="grid gap-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        >
          {error && (
            <p
              className="rounded-lg px-3 py-2 text-[13px] font-semibold text-altus-red"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}
            >
              {error}
            </p>
          )}

          {/* 1 · Area — a managed dropdown (admins can add more). */}
          <div className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Area</span>
            <GoalLookupSelect
              kind="area"
              noun="Area"
              value={area}
              onChange={setArea}
              options={props.areaOptions}
              custom={props.customLookups.areas}
              isAdmin={props.isAdmin}
              placeholder="Choose an area"
            />
          </div>

          {/* 2 · Goal. */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Goal</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What does done look like?"
              className={`h-10 w-full rounded-md border bg-white px-2.5 text-[15px] font-medium text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
          </label>

          {/* 3 · Measure (→ uom) + Type. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Measure</span>
              <GoalLookupSelect
                kind="measure"
                noun="Measure"
                value={measure}
                onChange={setMeasure}
                options={props.measureOptions}
                custom={props.customLookups.measures}
                isAdmin={props.isAdmin}
                placeholder="Choose a measure"
              />
            </div>
            <div className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Type</span>
              <GoalLookupSelect
                kind="type"
                noun="Type"
                value={type}
                onChange={setType}
                options={props.typeOptions}
                custom={props.customLookups.types}
                isAdmin={props.isAdmin}
                placeholder="Choose a type"
              />
            </div>
          </div>

          {/* 4 · Actual vs Target (% Done = Actual ÷ Target). */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Actual</span>
              <input
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 0"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Target</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 100"
                className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
            </label>
          </div>

          {/* ── Weight ── */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Weight</span>
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="100"
              className={`h-10 w-full rounded-md border bg-white px-2.5 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">share of the period score</span>
          </label>

          {/* ── Team members (each with their OWN weight) ── */}
          <div className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Team Members</span>
            <TeamWeightsField value={team} roster={props.roster} onChange={setTeam} />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
              Add the people on this goal — each gets their own weight (share).
            </span>
          </div>

          {/* ── Monthly Master ── */}
          <div className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Monthly Master</span>
            <MonthlyMasterField value={monthlyMasterRef} onCommit={setMonthlyMasterRef} />
            <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
              Link to one event/task from the Monthly Events Master.
            </span>
          </div>

          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Plan / approach…"
              className={`w-full resize-y rounded-md border bg-white px-2.5 py-2 text-[15px] font-medium text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
          </label>
        </div>
      </WeeklyGoalDrawer>
    </>
  );
});
