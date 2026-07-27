"use client";

import * as React from "react";
import type { EvalSection } from "@/lib/hr/candidate/evaluation-v2";
import { sectionScore } from "@/lib/hr/candidate/evaluation-v2-scoring";
import { RatingControl, CantSayToggle } from "./controls";
import { RowNotes } from "./voice";
import { Dial, toneFor } from "./dial";
import type { EvalController } from "./controller";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * A rating section (B–J, M): a heading with a live weighted section dial, then
 * every item as a star-rating row with a Can't-Say toggle and dictatable notes.
 * Sections with labelled sub-groups (G) render their group headings.
 */
export function RatingSection({ ctrl, section }: { ctrl: EvalController; section: EvalSection }) {
  const { instance, profile } = ctrl;
  const score = sectionScore(section, instance, profile);
  const tone = toneFor(score.micro);
  const showGroupLabels = section.groups.some((g) => g.label);

  return (
    <div>
      {/* Section header: title + weight + live dial */}
      <div className="mb-4 flex items-center gap-4">
        <Dial
          size={72}
          stroke={7}
          fill={score.micro === null ? 0 : score.micro / 10}
          tone={tone}
          ariaLabel={score.micro === null ? `${section.title} not yet rated` : `${section.title} scores ${fmt(score.micro)} out of 10`}
          main={
            score.micro === null ? (
              <span className="text-ink-subtle">—</span>
            ) : (
              fmt(score.micro)
            )
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-bold tabular-nums"
              style={{ background: tone.soft, color: tone.fg }}
            >
              {score.x} / {score.weight}
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">pts</span>
            </span>
            {section.note && <span className="text-[12.5px] font-medium text-ink-muted">{section.note}</span>}
          </div>
        </div>
      </div>

      {/* Groups + rows */}
      <div className="space-y-5">
        {section.groups.map((grp, gi) => (
          <div key={grp.label ?? gi}>
            {showGroupLabels && grp.label && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[12px] font-black uppercase tracking-[0.12em] text-altus-red">{grp.label}</span>
                <span className="h-px flex-1" style={{ background: "var(--color-hairline)" }} />
              </div>
            )}
            <div className="overflow-hidden rounded-2xl border border-hairline bg-white">
              {grp.items.map((item) => {
                const muted = instance.cantSay.includes(item.id);
                const value = instance.ratings[item.id] ?? 0;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <span className="min-w-[140px] flex-1 text-[14px] font-semibold leading-snug text-ink-strong">
                        {item.label}
                      </span>
                      <div className="flex items-center gap-3">
                        <RatingControl label={item.label} value={value} onChange={(v) => ctrl.setRating(item.id, v)} muted={muted} />
                        <CantSayToggle on={muted} onToggle={() => ctrl.toggleCantSay(item.id)} />
                      </div>
                    </div>
                    <RowNotes value={instance.notes[item.id] ?? ""} onChange={(v) => ctrl.setNote(item.id, v)} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
