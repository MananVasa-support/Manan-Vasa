"use client";

import * as React from "react";
import {
  FINE_BUCKET_STYLES,
  type FineBucketCount,
} from "@/lib/transforms/aging-buckets-fine";

/**
 * Delivery-performance distribution across the nine aging buckets, ordered most
 * overdue at the top down to earliest delivery at the bottom.
 *
 * Each row takes its own tier colour from `FINE_BUCKET_STYLES` — a nine-step
 * ramp (purple → dark red → red → orange → amber → neutral → sky → blue →
 * emerald) rather than the previous binary green/red. The binary scheme could
 * not distinguish one day late from three weeks late, which is the distinction
 * the chart exists to show.
 *
 * The legend names the two SIDES of the due date in words. It no longer carries
 * colour swatches: with nine tiers a two-swatch legend would be actively
 * misleading, and each row already states its own band in full.
 */
export function FineBucketBars({
  buckets,
  earlyLabel = "Before Due Date",
  lateLabel = "Overdue",
}: {
  buckets: FineBucketCount[];
  earlyLabel?: string;
  lateLabel?: string;
}) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const max = Math.max(...buckets.map((b) => b.count), 1);

  if (total === 0) {
    return (
      <p className="text-[13.5px] font-semibold text-ink-subtle">
        No dated tasks to place on the early/late scale yet.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        <span>{lateLabel}</span>
        <span aria-hidden className="text-gray-300">↓</span>
        <span>{earlyLabel}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {buckets.map((b) => {
          const style = FINE_BUCKET_STYLES[b.key];
          const w = (b.count / max) * 100;
          const empty = b.count === 0;
          return (
            <li key={b.key} className="flex items-center gap-3">
              <span
                className="w-[34%] max-md:w-[42%] shrink-0 truncate text-[13px] font-bold text-gray-900"
                title={b.key}
              >
                {b.key}
              </span>
              <span
                className="relative h-3.5 flex-1 overflow-hidden rounded-full"
                style={{ background: "#F3F4F6" }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${w}%`,
                    background: style.color,
                    // The neutral tier is white on a near-white track, so it
                    // needs its own outline to be visible at all.
                    boxShadow: style.border ? `inset 0 0 0 1px ${style.border}` : undefined,
                  }}
                />
              </span>
              {/* Indicator pill — same tier colour as the bar, so the row reads
                  as one object rather than a bar and an unrelated number. */}
              <span
                className="inline-flex w-11 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[12.5px] font-black tabular-nums"
                style={{
                  background: empty ? "#F3F4F6" : style.color,
                  color: empty ? "#9CA3AF" : style.ink,
                  boxShadow: !empty && style.border ? `inset 0 0 0 1px ${style.border}` : undefined,
                }}
              >
                {b.count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
