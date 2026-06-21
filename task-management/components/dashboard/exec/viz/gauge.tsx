"use client";
import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";
import { useAnimCount } from "./use-anim-count";

/**
 * Gauge — a 180° semicircle on-time-rate gauge. The arc sweeps left→right,
 * draws on via stroke-dashoffset, and glows in its rate colour. A big animated
 * percentage sits under the arc with on-time / late counts.
 *
 * Rate threshold (matches punctuality-card): green ≥80, amber ≥60, red below.
 * Pure / presentational.
 */
export type GaugeProps = {
  /** On-time percentage 0–100. */
  pct: number;
  /** Count delivered on time. */
  onTime: number;
  /** Count delivered late. */
  late: number;
  /** Outer width in px (height is ~58% of this). */
  size?: number;
};

function rateTone(pct: number) {
  if (pct >= 80)
    return { stroke: "var(--color-green)", deep: "var(--color-green-deep)" };
  if (pct >= 60)
    return { stroke: "var(--color-amber)", deep: "var(--color-amber-deep)" };
  return { stroke: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" };
}

export function Gauge({ pct, onTime, late, size = 280 }: GaugeProps) {
  const reduce = useReducedMotion() ?? false;
  const clamped = Math.max(0, Math.min(pct, 100));
  const tone = rateTone(clamped);

  const w = size;
  const stroke = Math.max(12, Math.round(size * 0.066));
  const pad = stroke / 2 + 2;
  const r = (w - stroke) / 2 - 2;
  const cx = w / 2;
  const cy = w / 2; // baseline of the semicircle
  const h = r + pad + Math.round(size * 0.02);

  // Semicircle path from left (180°) to right (0°).
  const left = { x: cx - r, y: cy };
  const right = { x: cx + r, y: cy };
  const arcPath = `M ${left.x} ${left.y} A ${r} ${r} 0 0 1 ${right.x} ${right.y}`;
  const arcLen = Math.PI * r;

  const [drawn, setDrawn] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, clamped]);

  const targetOffset = arcLen * (1 - clamped / 100);
  const offset = drawn ? targetOffset : arcLen;

  const display = useAnimCount(Math.round(clamped), 1200);
  const gradId = React.useId();

  return (
    <div className="inline-flex flex-col items-center" style={{ width: w }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`On-time rate ${Math.round(clamped)} percent`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={tone.deep} />
            <stop offset="100%" stopColor={tone.stroke} />
          </linearGradient>
        </defs>

        {/* Track */}
        <path
          d={arcPath}
          fill="none"
          stroke="var(--color-hairline-strong)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />

        {/* Value arc */}
        <path
          d={arcPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={offset}
          style={{
            transition: reduce
              ? "none"
              : "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
            filter: `drop-shadow(0 0 8px color-mix(in srgb, ${tone.stroke} 55%, transparent))`,
          }}
        />
      </svg>

      {/* Readout sits visually inside the arc */}
      <div
        className="flex flex-col items-center"
        style={{ marginTop: -Math.round(size * 0.16) }}
      >
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: Math.round(size * 0.2),
            letterSpacing: "-0.03em",
            color: tone.deep,
          }}
        >
          {display}
          <span style={{ fontSize: Math.round(size * 0.1) }}>%</span>
        </span>
        <span
          className="uppercase font-bold tracking-[0.14em]"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: Math.max(9, Math.round(size * 0.044)),
            color: "var(--color-ink-muted)",
            marginTop: 2,
          }}
        >
          on time
        </span>

        <div
          className="mt-3 flex items-center gap-4 font-bold"
          style={{ fontSize: Math.max(11, Math.round(size * 0.05)) }}
        >
          <span
            className="inline-flex items-center gap-1.5"
            style={{ color: "var(--color-green-deep)" }}
          >
            <span
              className="inline-block size-2 rounded-full"
              style={{
                background: "var(--color-green)",
                boxShadow: "0 0 6px var(--color-green)",
              }}
            />
            On time
            <span className="tabular-nums text-ink-strong">{onTime}</span>
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            style={{ color: "var(--color-altus-red-deep)" }}
          >
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: "var(--color-altus-red)" }}
            />
            Late
            <span className="tabular-nums text-ink-strong">{late}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
