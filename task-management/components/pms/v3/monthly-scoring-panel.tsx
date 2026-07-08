"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, TriangleAlert } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveSubjectiveScore } from "@/app/(app)/pms/v3/actions";
import type { MonthlyScoreView } from "@/lib/queries/pms-v3";
import type { FactorDef } from "@/lib/pms/v3/config";

type Role = "self" | "manager" | "manan";

/** 0..max point scale — keyboard + click, on-brand accent. */
function PointScale({
  value,
  onChange,
  max,
  accent,
  disabled,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  max: number;
  accent: string;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1"
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(max, (value ?? -1) + 1)); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(0, (value ?? max + 1) - 1)); }
      }}
      tabIndex={disabled ? undefined : 0}
    >
      {Array.from({ length: max + 1 }, (_, i) => i).map((n) => {
        const on = value != null && n <= value;
        const exact = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={exact}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="grid size-7 place-items-center rounded-md text-[12px] font-bold tabular-nums transition-transform enabled:hover:scale-110 disabled:opacity-60"
            style={{
              background: on ? accent : "var(--color-surface-soft)",
              color: on ? "#fff" : "var(--color-ink-subtle)",
              boxShadow: exact ? `0 0 0 2px color-mix(in srgb, ${accent} 45%, transparent)` : undefined,
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

/** Read-only lane chip showing one rater's points. */
function LaneChip({ role, points, accent }: { role: string; points: number | null; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{role}</span>
      <span
        className="grid h-8 min-w-[2rem] place-items-center rounded-lg px-2 text-[14px] font-black tabular-nums"
        style={{
          background: points == null ? "var(--color-surface-soft)" : `color-mix(in srgb, ${accent} 12%, transparent)`,
          color: points == null ? "var(--color-ink-subtle)" : accent,
        }}
      >
        {points == null ? "—" : points}
      </span>
    </div>
  );
}

function FactorCard({
  def,
  factor,
  editableRole,
  scaleMax,
  weight,
  accent,
  accentDeep,
  subjectId,
  period,
  onSaved,
}: {
  def: FactorDef;
  factor: MonthlyScoreView["factors"][number];
  editableRole: Role | null;
  scaleMax: number;
  weight: number | null;
  accent: string;
  accentDeep: string;
  subjectId: string;
  period: string;
  onSaved: () => void;
}) {
  const mine = editableRole ? factor[editableRole] : null;
  const [points, setPoints] = React.useState<number | null>(mine);
  const [given, setGiven] = React.useState(factor.justify?.[editableRole ?? "self"]?.given ?? "");
  const [taken, setTaken] = React.useState(factor.justify?.[editableRole ?? "self"]?.taken ?? "");
  const [pending, start] = React.useTransition();

  function submit() {
    if (!editableRole) return;
    if (points == null) {
      fireToast({ message: `Give ${def.label} a score (0–${scaleMax}).`, type: "error" });
      return;
    }
    start(async () => {
      const res = await saveSubjectiveScore({
        subjectId,
        period,
        raterRole: editableRole,
        factorKey: def.key,
        points,
        justifyGiven: given || undefined,
        justifyTaken: taken || undefined,
      });
      if (res.ok) {
        fireToast({ message: `${def.label} saved.`, type: "success" });
        onSaved();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  const gap = factor.gap.maxDivergence;
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-ink-strong">{def.label}</span>
            {weight != null && (
              <span
                className="rounded-pill px-2 py-0.5 text-[11px] font-bold"
                style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accentDeep }}
              >
                weight {weight}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">{def.hint}</p>
        </div>
        {gap != null && gap >= 3 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-bold"
            style={{ background: "color-mix(in srgb, #d97706 14%, transparent)", color: "#b45309" }}
            title="Large gap between self and reviewer scores"
          >
            <TriangleAlert size={11} strokeWidth={2.6} /> gap {gap}
          </span>
        )}
      </div>

      {/* Perception gap lanes (numbers visible to the person) */}
      <div className="mt-3 flex items-center gap-4">
        <LaneChip role="Self" points={factor.self} accent={accent} />
        <LaneChip role="Manager" points={factor.manager} accent={accent} />
        <LaneChip role="Manan" points={factor.manan} accent={accentDeep} />
        <div className="ml-auto flex flex-col items-end">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Final</span>
          <span className="text-[16px] font-black tabular-nums" style={{ color: accentDeep }}>
            {factor.final == null ? "—" : factor.final.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Editable lane for the current viewer */}
      {editableRole && (
        <div className="mt-4 rounded-xl border border-hairline bg-surface-soft p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: accentDeep }}>
              Your {editableRole} score
            </span>
            <PointScale value={points} onChange={setPoints} max={scaleMax} accent={accent} label={`${def.label} score`} />
          </div>
          <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11.5px] font-bold text-ink-soft">
                Q1 · Justify points GIVEN <Lock size={10} className="text-ink-subtle" />
              </span>
              <textarea
                value={given}
                onChange={(e) => setGiven(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Why they earned these points"
                className="w-full resize-y rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[13px] text-ink-strong outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[11.5px] font-bold text-ink-soft">
                Q2 · Justify points TAKEN <Lock size={10} className="text-ink-subtle" />
              </span>
              <textarea
                value={taken}
                onChange={(e) => setTaken(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Why points were withheld"
                className="w-full resize-y rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[13px] text-ink-strong outline-none"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            <Lock size={10} className="mr-0.5 inline" /> Justifications are visible only to Manan.
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="wg-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.6} />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Manan-only justifications review */}
      {factor.justify && !editableRole && (
        <JustifyReview justify={factor.justify} />
      )}
    </div>
  );
}

function JustifyReview({ justify }: { justify: NonNullable<MonthlyScoreView["factors"][number]["justify"]> }) {
  const lanes: [string, { given: string | null; taken: string | null } | null][] = [
    ["Self", justify.self],
    ["Manager", justify.manager],
    ["Manan", justify.manan],
  ];
  const any = lanes.some(([, v]) => v && (v.given || v.taken));
  if (!any) return null;
  return (
    <div className="mt-3 space-y-1.5 rounded-xl border border-dashed border-hairline-strong bg-surface-soft p-3 text-[12.5px]">
      <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        <Lock size={11} /> Justifications (Manan-only)
      </div>
      {lanes.map(([role, v]) =>
        v && (v.given || v.taken) ? (
          <div key={role} className="text-ink-soft">
            <span className="font-bold text-ink-strong">{role}: </span>
            {v.given && <span>+ {v.given} </span>}
            {v.taken && <span className="text-ink-muted">· − {v.taken}</span>}
          </div>
        ) : null,
      )}
    </div>
  );
}

export function MonthlyScoringPanel({
  view,
  subjectName,
  editableRole,
  periodLabel,
  accent,
  accentDeep,
}: {
  view: MonthlyScoreView;
  subjectName: string;
  editableRole: Role | null;
  periodLabel: string;
  accent: string;
  accentDeep: string;
}) {
  const router = useRouter();
  const defByKey = new Map(view.config.factors.map((f) => [f.key, f]));
  const scaleMax = view.config.subjectiveScaleMax;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-muted">
          {subjectName} · {periodLabel} · {view.isManager ? "Manager (scored by Manan 100%)" : "Non-manager (Manager 50% + Manan 50%)"}
        </span>
        {editableRole && (
          <span
            className="rounded-pill px-3 py-1 text-[12px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
          >
            You are scoring as: {editableRole}
          </span>
        )}
      </div>

      {view.band == null && !view.isManager && (
        <div
          className="flex items-center gap-2 rounded-xl border border-hairline p-3 text-[13px]"
          style={{ background: "color-mix(in srgb, #d97706 8%, transparent)", color: "#b45309" }}
        >
          <TriangleAlert size={16} strokeWidth={2.4} />
          Non-manager weight band is pending Sir&apos;s ruling — scores are captured, but the weighted total is
          withheld until the canonical band is chosen in Score settings.
        </div>
      )}

      {view.factors.map((factor) => {
        const def = defByKey.get(factor.factorKey);
        if (!def) return null;
        const weight = view.band ? (view.band[factor.factorKey] ?? null) : null;
        return (
          <FactorCard
            key={factor.factorKey}
            def={def}
            factor={factor}
            editableRole={editableRole}
            scaleMax={scaleMax}
            weight={weight}
            accent={accent}
            accentDeep={accentDeep}
            subjectId={view.subjectId}
            period={view.period}
            onSaved={() => router.refresh()}
          />
        );
      })}
    </div>
  );
}
