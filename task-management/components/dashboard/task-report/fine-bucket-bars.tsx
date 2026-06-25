"use client";

import * as React from "react";
import type { FineBucketCount } from "@/lib/transforms/aging-buckets-fine";

const GREEN = "var(--color-green-deep, #15803D)";
const RED = "var(--color-altus-red, #E10600)";

/**
 * The brand "bucket bars" — a horizontal distribution across Manan's twelve
 * signed early/late aging buckets. Early (non-late) bands render Altus green,
 * late (overdue) bands render Altus red. Counts are tabular-nums; the widest
 * bar normalises to 100%. The zero-bucket ("0") is treated as on-time (green).
 */
export function FineBucketBars({
  buckets,
  earlyLabel = "early / on time",
  lateLabel = "late",
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
      <div className="mb-3 flex items-center gap-4 text-[11px] font-bold">
        <span className="inline-flex items-center gap-1.5" style={{ color: GREEN }}>
          <span className="inline-block size-2.5 rounded-full" style={{ background: GREEN }} />
          {earlyLabel}
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: RED }}>
          <span className="inline-block size-2.5 rounded-full" style={{ background: RED }} />
          {lateLabel}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {buckets.map((b) => {
          const color = b.late ? RED : GREEN;
          const w = (b.count / max) * 100;
          return (
            <li key={b.key} className="flex items-center gap-3">
              <span
                className="w-[26%] max-md:w-[34%] shrink-0 truncate text-[13px] font-bold text-ink-strong tabular-nums"
                title={b.key}
              >
                {b.key}
              </span>
              <span
                className="relative h-3.5 flex-1 overflow-hidden rounded-full"
                style={{ background: "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)" }}
              >
                <span
                  className="absolute inset-y-0 left-0 transition-all"
                  style={{
                    width: `${w}%`,
                    background: `linear-gradient(90deg, color-mix(in srgb, ${color} 78%, transparent), ${color})`,
                  }}
                />
              </span>
              <span
                className="w-10 shrink-0 text-right text-[13.5px] font-black tabular-nums"
                style={{ color: b.count > 0 ? color : "var(--color-ink-subtle)" }}
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
