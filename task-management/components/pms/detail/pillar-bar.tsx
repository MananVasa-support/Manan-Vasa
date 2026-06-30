import type { ReactNode } from "react";
import { SubSignalBar } from "./sub-signal-bar";

/**
 * One pillar card on the per-person detail page: the pillar name, its weight,
 * its blended rate %, a headline progress bar, and (optionally) the sub-signal
 * mini-bars that make it up. Server-renderable. `rate` is 0..1 or null.
 */
export interface SubSignal {
  key: string;
  label: string;
  rate: number | null;
}

export function PillarBar({
  name,
  weight,
  rate,
  accent,
  accentDeep,
  icon,
  subSignals,
  hint,
}: {
  name: string;
  weight: number;
  rate: number | null;
  accent: string;
  accentDeep: string;
  icon?: ReactNode;
  subSignals?: SubSignal[];
  hint?: string;
}) {
  const pct = rate == null ? null : Math.round(Math.max(0, Math.min(1, rate)) * 100);
  const visible = (subSignals ?? []).filter((s) => s !== undefined);
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold text-ink-strong">{name}</div>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">
              Weight {weight}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="tabular-nums font-black leading-none"
            style={{ fontSize: 26, color: pct == null ? "var(--color-ink-subtle)" : accentDeep }}
          >
            {pct == null ? "—" : pct}
          </div>
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
            {pct == null ? "no data" : "of 100"}
          </div>
        </div>
      </div>

      {/* Headline bar */}
      <div className="mt-3 relative h-2.5 overflow-hidden rounded-pill bg-surface-soft">
        <div
          className="absolute inset-y-0 left-0 rounded-pill"
          style={{
            width: `${pct ?? 0}%`,
            background:
              pct == null ? "var(--color-hairline-strong)" : `linear-gradient(90deg, ${accent}, ${accentDeep})`,
          }}
        />
      </div>

      {hint && <p className="mt-2 text-[12.5px] leading-snug text-ink-subtle">{hint}</p>}

      {visible.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-hairline pt-3">
          {visible.map((s) => (
            <SubSignalBar key={s.key} label={s.label} rate={s.rate} accent={accent} accentDeep={accentDeep} />
          ))}
        </div>
      )}
    </div>
  );
}
