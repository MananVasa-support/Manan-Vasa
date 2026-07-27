"use client";

import * as React from "react";
import { Check, X, Minus, EyeOff } from "lucide-react";
import { StarRating } from "@/components/hr/candidate/star-rating";
import type { PassFail } from "@/lib/hr/candidate/evaluation-v2";

const RED = "var(--color-altus-red)";

/**
 * A keyboard-accessible wrapper around the shared StarRating. The stars keep
 * their click-for-half behaviour; the wrapper adds a focusable slider surface so
 * arrows / Home / End move the value (0..10 in 0.5 steps). When `muted` (Can't
 * Say) the stars render read-only and dimmed and are excluded from the average.
 */
export function RatingControl({
  label,
  value,
  onChange,
  muted = false,
  size = 22,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  muted?: boolean;
  size?: number;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (muted) return;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(10, value + 0.5);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, value - 0.5);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 10;
        break;
      case "PageUp":
        next = Math.min(10, value + 1);
        break;
      case "PageDown":
        next = Math.max(0, value - 1);
        break;
      default:
        return;
    }
    if (next !== null) {
      e.preventDefault();
      onChange(next);
    }
  }

  return (
    <div
      role="slider"
      tabIndex={muted ? -1 : 0}
      aria-label={`${label} — rate 0 to 10`}
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={value}
      aria-valuetext={value > 0 ? `${value} out of 10` : "not rated"}
      aria-disabled={muted || undefined}
      onKeyDown={onKeyDown}
      className="ev2-rating inline-flex rounded-lg outline-none"
      style={{ opacity: muted ? 0.35 : 1, filter: muted ? "grayscale(1)" : "none", transition: "opacity 0.2s, filter 0.2s" }}
    >
      <StarRating value={value} onChange={onChange} readOnly={muted} size={size} />
    </div>
  );
}

/** The "Can't Say" toggle — mutes a row's stars and drops it from the average. */
export function CantSayToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em] transition-colors"
      style={
        on
          ? { background: "var(--color-ink-strong)", color: "#fff" }
          : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)", border: "1px solid var(--color-hairline)" }
      }
      title={on ? "Counting as Can't Say — click to rate instead" : "Can't judge this one — exclude from the average"}
    >
      <EyeOff size={12} strokeWidth={2.4} /> Can&apos;t say
    </button>
  );
}

const PF_OPTS: { value: PassFail; label: string; icon: React.ReactNode; on: React.CSSProperties }[] = [
  { value: "yes", label: "Yes", icon: <Check size={14} strokeWidth={3} />, on: { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } },
  { value: "no", label: "No", icon: <X size={14} strokeWidth={3} />, on: { background: RED, color: "#fff", borderColor: RED } },
  { value: "na", label: "N-A", icon: <Minus size={14} strokeWidth={3} />, on: { background: "var(--color-ink-soft)", color: "#fff", borderColor: "var(--color-ink-soft)" } },
];

/**
 * A 3-state segmented control (Yes / No / N-A) rendered as an accessible
 * radiogroup — arrows move between options, Space/Enter select.
 */
export function SegmentedPassFail({
  value,
  onChange,
  label,
}: {
  value: PassFail | undefined;
  onChange: (v: PassFail) => void;
  label: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIdx = (idx + dir + PF_OPTS.length) % PF_OPTS.length;
    const opt = PF_OPTS[nextIdx];
    if (opt) {
      onChange(opt.value);
      refs.current[nextIdx]?.focus();
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--color-hairline-strong)" }}
    >
      {PF_OPTS.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-bold transition-colors max-sm:px-2.5"
            style={
              active
                ? { ...opt.on, borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.25)" : "none" }
                : {
                    background: "#fff",
                    color: "var(--color-ink-muted)",
                    borderLeft: i > 0 ? "1px solid var(--color-hairline)" : "none",
                  }
            }
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
