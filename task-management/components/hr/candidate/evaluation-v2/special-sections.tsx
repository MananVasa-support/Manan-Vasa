"use client";

import * as React from "react";
import { Sparkles, Check, X, Store, Gauge } from "lucide-react";
import {
  RECOMMENDATIONS,
  TEXTBOX_FIELDS,
  type EvaluationInstance,
} from "@/lib/hr/candidate/evaluation-v2";
import { overallScore, type WeightProfile } from "@/lib/hr/candidate/evaluation-v2-scoring";
import { RatingControl } from "./controls";
import { RowNotes, VoiceTextbox } from "./voice";
import { toneFor } from "./dial";
import type { EvalController } from "./controller";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** K · X-Factor — a single bonus 0..10, scored outside the weighted average. */
export function XFactorInput({ ctrl }: { ctrl: EvalController }) {
  const { instance } = ctrl;
  const set = instance.xFactor !== null;
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink-strong">
          <Sparkles size={16} className="text-altus-red" /> A standout, hard-to-quantify strength
        </span>
        <div className="flex items-center gap-3">
          <RatingControl label="X-Factor" value={instance.xFactor ?? 0} onChange={(v) => ctrl.setXFactor(v)} />
          <span
            className="rounded-lg px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide"
            style={{ background: "color-mix(in srgb, #f59e0b 14%, white)", color: "#b45309" }}
          >
            Bonus
          </span>
        </div>
      </div>
      <div className="mt-2">
        <RowNotes value={instance.notes["xfactor"] ?? ""} onChange={(v) => ctrl.setNote("xfactor", v)} label="What is it?" />
      </div>
      {!set && <p className="mt-2 text-[12px] text-ink-subtle">Leave blank if there isn&apos;t a clear X-factor — it never counts against the score.</p>}
    </div>
  );
}

/** L · Responsibility to Sell? — a Yes/No gate that shows/hides the Sales section. */
export function SellGate({ ctrl }: { ctrl: EvalController }) {
  const val = ctrl.instance.sellResponsibility;
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
          <Store size={16} className="text-altus-red" /> Does this role carry a responsibility to sell?
        </span>
        <div className="inline-flex overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-hairline-strong)" }} role="radiogroup" aria-label="Responsibility to sell">
          <GateButton active={val === true} onClick={() => ctrl.setSell(true)} tone="#16a34a">
            <Check size={14} strokeWidth={3} /> Yes
          </GateButton>
          <GateButton active={val === false} onClick={() => ctrl.setSell(false)} tone={RED} borderLeft>
            <X size={14} strokeWidth={3} /> No
          </GateButton>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-ink-subtle">
        {val === true
          ? "Sales Competency is included and weighted below."
          : val === false
            ? "Sales Competency is skipped — its weight is dropped from the overall."
            : "Choose to reveal or skip the Sales Competency section."}
      </p>
    </div>
  );
}

function GateButton({
  active,
  onClick,
  tone,
  borderLeft,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: string;
  borderLeft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold transition-colors"
      style={
        active
          ? { background: tone, color: "#fff", borderLeft: borderLeft ? "1px solid rgba(255,255,255,0.25)" : "none" }
          : { background: "#fff", color: "var(--color-ink-muted)", borderLeft: borderLeft ? "1px solid var(--color-hairline)" : "none" }
      }
    >
      {children}
    </button>
  );
}

/** N · Overall Interviewer Score — a manual 0..10 shown beside the computed one. */
export function OverallInput({
  ctrl,
  instance,
  profile,
}: {
  ctrl: EvalController;
  instance: EvaluationInstance;
  profile: WeightProfile;
}) {
  const computed = overallScore(instance, profile);
  const tone = toneFor(computed.avg);
  const set = instance.overall !== null;
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink-strong">
            <Gauge size={16} className="text-altus-red" /> Your gut number
          </span>
          <div className="mt-2">
            <RatingControl label="Overall interviewer score" value={instance.overall ?? 0} onChange={(v) => ctrl.setOverall(v)} />
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5"
          style={{ background: tone.soft }}
        >
          <div className="text-right">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">Computed weighted</p>
            <p className="text-[20px] font-black tabular-nums leading-tight" style={{ color: tone.fg, fontFamily: "var(--font-display), system-ui, sans-serif" }}>
              {computed.avg === null ? "— / 10" : `${fmt(computed.avg)} / 10`}
            </p>
          </div>
        </div>
      </div>
      {set && instance.overall !== null && computed.avg !== null && Math.abs(instance.overall - computed.avg) >= 2 && (
        <p className="mt-2 text-[12px] font-semibold" style={{ color: RED_DEEP }}>
          Your gut ({fmt(instance.overall)}) differs from the computed score ({fmt(computed.avg)}) by {fmt(Math.abs(instance.overall - computed.avg))} — worth a note on why.
        </p>
      )}
    </div>
  );
}

/** The single-select recommendation, rendered as tone-coloured gradient buttons. */
export function RecommendationBar({ ctrl }: { ctrl: EvalController }) {
  const current = ctrl.instance.recommendation;
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {RECOMMENDATIONS.map((r) => {
          const active = current === r.value;
          return (
            <button
              key={r.value}
              type="button"
              aria-pressed={active}
              onClick={() => ctrl.setRecommendation(r.value)}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold transition-all"
              style={
                active
                  ? {
                      background: `linear-gradient(135deg, ${r.tone}, color-mix(in srgb, ${r.tone} 72%, black))`,
                      color: "#fff",
                      boxShadow: `0 10px 22px -12px ${r.tone}`,
                      transform: "translateY(-1px)",
                    }
                  : {
                      background: "#fff",
                      color: r.tone,
                      border: `1.5px solid color-mix(in srgb, ${r.tone} 40%, white)`,
                    }
              }
            >
              <span
                className="grid h-4 w-4 place-items-center rounded-full"
                style={active ? { background: "rgba(255,255,255,0.28)" } : { background: `color-mix(in srgb, ${r.tone} 16%, white)` }}
              >
                {active && <Check size={11} strokeWidth={3.5} />}
              </span>
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The 5 closing narrative boxes (Justification, Strengths, Risk Areas, …). */
export function ClosingTextboxes({ ctrl }: { ctrl: EvalController }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {TEXTBOX_FIELDS.map((f, i) => (
        <div key={f.id} className={i === 0 ? "sm:col-span-2" : ""}>
          <VoiceTextbox
            label={f.label}
            value={ctrl.instance.textboxes[f.id] ?? ""}
            onChange={(v) => ctrl.setTextbox(f.id, v)}
            rows={i === 0 ? 4 : 3}
            minHeight={i === 0 ? 96 : 80}
          />
        </div>
      ))}
    </div>
  );
}
