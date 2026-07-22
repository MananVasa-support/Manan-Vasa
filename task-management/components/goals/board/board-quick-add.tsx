"use client";

import * as React from "react";
import { Plus, Loader2, Check } from "lucide-react";
import { createGoal, addChildGoal } from "@/app/(app)/goals/cascade/actions";
import {
  periodKeyLabel,
  categoryStyle,
  GOAL_CATEGORIES,
  type GoalDTO,
  type MonthlyMasterRef,
} from "@/components/goals/cascade/util";
import { buildOptimisticGoal, type GoalMutationApi } from "@/components/goals/canvas/optimistic";
import type { GoalPeriod } from "@/lib/goals/types";
import { ComboInput } from "@/components/weekly-goals/field-controls";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { IncentiveField, MonthlyMasterField } from "@/components/goals/board/goal-board-card";

type IncentiveKind = "one_time" | "repetitive" | "milestone";

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
 * The dashed "+ Add goal" tile for the Goals level board (goal-quick-add.tsx
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
  const [category, setCategory] = React.useState<(typeof GOAL_CATEGORIES)[number]>("goal");
  const [weight, setWeight] = React.useState("100");
  const [incentiveEnabled, setIncentiveEnabled] = React.useState(false);
  const [incentiveAmount, setIncentiveAmount] = React.useState<string | null>(null);
  const [incentiveKind, setIncentiveKind] = React.useState<IncentiveKind | null>(null);
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
    setCategory("goal");
    setWeight("100");
    setIncentiveEnabled(false);
    setIncentiveAmount(null);
    setIncentiveKind(null);
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
    const fields = {
      title: t,
      area: area.trim() || null,
      category,
      notes: notes.trim() || null,
      weight: w,
      incentiveEnabled,
      incentiveAmount: incentiveEnabled ? incentiveAmount : null,
      incentiveKind: incentiveEnabled ? incentiveKind : null,
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
      category,
      notes: fields.notes,
      weight: fields.weight,
      incentiveEnabled: fields.incentiveEnabled,
      incentiveAmount: fields.incentiveAmount,
      incentiveKind: fields.incentiveKind,
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
      {/* The calm dashed "+ Add goal" tile — deliberately NOT `.brand-btn`
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
        Add goal
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
        eyebrow={`New goal · #${props.currentCount + 1} · ${bucketLabel}`}
        title={`Add a ${props.level} goal`}
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
              Add goal
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Area</span>
              <ComboInput value={area} options={props.areaOptions} onChange={setArea} placeholder="Area / function" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-bold text-ink-soft">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof GOAL_CATEGORIES)[number])}
                aria-label="Goal category"
                className={`h-10 w-full cursor-pointer rounded-md border bg-white px-2.5 text-[14px] font-semibold text-ink-strong focus:border-altus-red ${FOCUS_RING}`}
                style={{ borderColor: "var(--color-hairline-strong)" }}
              >
                {GOAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryStyle(c, false).label}
                  </option>
                ))}
              </select>
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

          {/* ── Incentive ── */}
          <IncentiveField
            enabled={incentiveEnabled}
            amount={incentiveAmount}
            kind={incentiveKind}
            onCommit={(patch) => {
              if (patch.incentiveEnabled !== undefined) setIncentiveEnabled(patch.incentiveEnabled);
              if (patch.incentiveAmount !== undefined) setIncentiveAmount(patch.incentiveAmount);
              if (patch.incentiveKind !== undefined) setIncentiveKind(patch.incentiveKind ?? null);
            }}
          />

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
