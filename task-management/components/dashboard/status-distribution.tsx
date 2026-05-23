"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import type {
  StatusDistributionPayload,
  StatusDistribution,
} from "@/lib/types";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import { useCountUp } from "@/lib/use-count-up";
import {
  STATUS_LABELS_FALLBACK,
  STATUS_TONES_FALLBACK,
} from "@/lib/format";

type Tone = StatusColorToken;

export function StatusDistributionChart({
  data,
  labels,
  tones,
}: {
  data: StatusDistributionPayload;
  labels?: Record<TaskStatus, string>;
  tones?: Record<TaskStatus, Tone>;
}) {
  const resolvedLabels = labels ?? STATUS_LABELS_FALLBACK;
  const resolvedTones = (tones ?? STATUS_TONES_FALLBACK) as Record<
    TaskStatus,
    Tone
  >;
  const rows = [...data.rows].sort((a, b) => b.count - a.count);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const denom = data.denominator;

  if (rows.length === 0) {
    return (
      <section
        className="rounded-section bg-surface-card border border-hairline p-8"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <Header />
        <p className="mt-3 text-body-lg text-ink-subtle">
          No data for the current filter.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-section bg-surface-card border border-hairline p-7"
      style={{
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        opacity: 0,
        animation: "fadeUp 500ms ease-out 500ms forwards",
      }}
    >
      <Header />

      {/* One big proportional stacked bar — each segment is its own
          link to the filtered task list. Visual share of the whole
          reads at a glance; hover brightens the segment. */}
      <div className="mt-6">
        <div
          className="relative flex w-full overflow-hidden"
          style={{
            height: 56,
            borderRadius: 14,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          {rows.map((r, i) => {
            const tone = resolvedTones[r.status];
            const widthPct = totalCount > 0 ? (r.count / totalCount) * 100 : 0;
            if (widthPct === 0) return null;
            return (
              <Link
                key={r.status}
                href={`/tasks?status=${r.status}` as Route}
                aria-label={`${resolvedLabels[r.status]}: ${r.count} tasks`}
                className="dist-segment relative flex items-center justify-center transition-all"
                style={{
                  width: `${widthPct}%`,
                  background: `linear-gradient(180deg, var(--color-${tone}), var(--color-${tone}-deep))`,
                  borderRight:
                    i < rows.length - 1
                      ? "1.5px solid rgba(255,255,255,0.6)"
                      : "none",
                  animation: `barGrow 900ms cubic-bezier(.2,.8,.2,1) ${300 + i * 80}ms backwards`,
                  transformOrigin: "left",
                }}
              >
                {widthPct > 6 && (
                  <span
                    className="tabular-nums font-black"
                    style={{
                      fontFamily: "var(--font-display), system-ui, sans-serif",
                      fontSize: 18,
                      color: "#ffffff",
                      textShadow: "0 1px 2px rgba(0,0,0,0.22)",
                    }}
                  >
                    {r.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Compact stat grid — each tile is a click target for that status.
          3 columns desktop, 2 on tablet. */}
      <ul className="mt-5 grid grid-cols-3 gap-3 max-md:grid-cols-2">
        {rows.map((r, i) => (
          <StatTile
            key={r.status}
            row={r}
            index={i}
            denom={denom}
            label={resolvedLabels[r.status]}
            tone={resolvedTones[r.status]}
          />
        ))}
      </ul>
    </section>
  );
}

function Header() {
  return (
    <header>
      <h2 className="text-display-lg text-ink-strong">
        <span aria-hidden className="mr-2">
          📊
        </span>
        Status Distribution
      </h2>
      <p className="text-body-lg text-ink-subtle mt-1">
        Tasks by current status — click any segment to filter
      </p>
    </header>
  );
}

function StatTile({
  row,
  index,
  denom,
  label,
  tone,
}: {
  row: StatusDistribution;
  index: number;
  denom: number;
  label: string;
  tone: Tone;
}) {
  const animated = useCountUp(row.count, 900 + index * 70);
  const pct = denom > 0 ? (row.count / denom) * 100 : 0;
  return (
    <li>
      <Link
        href={`/tasks?status=${row.status}` as Route}
        className="dist-tile group relative flex flex-col gap-1 p-4 rounded-chip bg-surface-soft transition-all overflow-hidden"
        style={{
          border: "1px solid var(--color-hairline)",
        }}
      >
        {/* Channel-color side rail on the left */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0"
          style={{
            width: 4,
            background: `linear-gradient(180deg, var(--color-${tone}), var(--color-${tone}-deep))`,
          }}
        />
        <span
          className="uppercase font-black tracking-[0.06em] pl-3"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 13,
            color: `var(--color-${tone}-deep)`,
          }}
        >
          {label}
        </span>
        <div className="flex items-baseline justify-between gap-2 pl-3">
          <span
            className="tabular-nums font-black leading-none text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 36,
            }}
          >
            {animated}
          </span>
          <span
            className="tabular-nums font-bold"
            style={{
              fontFamily: "var(--font-mono-display), ui-monospace, monospace",
              fontSize: 14,
              color: "var(--color-ink-muted)",
            }}
          >
            {denom > 0 ? `${pct.toFixed(1)}%` : "—"}
          </span>
        </div>
      </Link>
    </li>
  );
}
