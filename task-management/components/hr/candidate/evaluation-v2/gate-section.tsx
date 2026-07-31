"use client";

import * as React from "react";
import { DoorOpen, EyeOff } from "lucide-react";
import type { EvalSection } from "@/lib/hr/candidate/evaluation-v2";
import { SegmentedControl } from "./controls";
import { RatingSection } from "./rating-section";
import type { EvalController } from "./controller";

/**
 * Customer-Facing (a "gate" section): a multi-value gate (Yes / No / Not Sure /
 * N-A) whose answer decides whether the 6 sub-ratings are revealed + counted.
 * The sub-ratings appear (and are scored) only when the answer is in the gate's
 * `revealWhen` set; any other answer collapses them and drops the section weight.
 */
export function GateSection({ ctrl, section }: { ctrl: EvalController; section: EvalSection }) {
  const gate = section.gate;
  if (!gate) return null;
  const answer = ctrl.instance.gates?.[section.id];
  const revealed = answer != null && gate.revealWhen.includes(answer);

  return (
    <div className="space-y-4">
      {/* Gate prompt */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-white p-4">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink-strong">
          <DoorOpen size={16} className="text-altus-red" /> {gate.label}
        </span>
        <SegmentedControl
          value={answer}
          onChange={(v) => ctrl.setGate(section.id, v)}
          options={gate.options}
          label={gate.label}
        />
      </div>

      {section.note && !revealed && (
        <p className="px-1 text-[12.5px] font-medium text-ink-muted">{section.note}</p>
      )}

      {/* Revealed sub-ratings, or a quiet "skipped" note */}
      {revealed ? (
        <div className="ev2-collapse">
          <RatingSection ctrl={ctrl} section={section} hideHeaderNote />
        </div>
      ) : answer != null ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-solid border-hairline-strong bg-surface-soft px-4 py-3.5 text-[13px] font-semibold text-ink-muted">
          <EyeOff size={16} className="shrink-0 text-ink-subtle" />
          Customer-facing ratings are skipped for this answer — the section&apos;s weight is dropped from the overall.
        </div>
      ) : null}
    </div>
  );
}
