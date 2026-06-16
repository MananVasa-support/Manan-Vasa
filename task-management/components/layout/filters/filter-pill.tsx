"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";

/**
 * Pill-card filter trigger: a tinted icon badge, a two-line value/sublabel, and
 * a chevron. Used as the `asChild` trigger for each filter's Popover/dropdown.
 * forwardRef so Radix can attach its trigger props.
 */
export const FilterPill = React.forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode;
    /** The filter's name — small sublabel under the value (e.g. "Status"). */
    name: string;
    /** The current value summary (e.g. "High & Medium", "All Clients"). */
    value: string;
    /** Accent for the badge + value when a selection is active. Defaults to Altus red. */
    tint?: string;
    /** True when this filter has a non-default selection. */
    active?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function FilterPill(
  { icon, name, value, tint = "var(--color-altus-red)", active = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-active={active}
      className={`filter-pill ${className ?? ""}`}
      {...props}
    >
      <span
        className="inline-flex items-center justify-center rounded-[10px] shrink-0"
        style={{
          width: 34,
          height: 34,
          background: active
            ? `color-mix(in srgb, ${tint} 14%, transparent)`
            : "var(--color-hairline)",
          color: active ? tint : "var(--color-ink-subtle)",
        }}
      >
        {icon}
      </span>
      <span className="flex flex-col min-w-0 leading-[1.15]">
        <span
          className="text-[14px] font-semibold truncate max-w-[170px]"
          style={{ color: active ? "var(--color-ink-strong)" : "var(--color-ink-strong)" }}
        >
          {value}
        </span>
        <span className="text-[11.5px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
          {name}
        </span>
      </span>
      <ChevronDown size={15} className="text-ink-subtle shrink-0" />
    </button>
  );
});

/** Summarise a multi-select for the pill's value line: "All X" / "A & B" / "N selected". */
export function summarizeSelection(labels: string[], allWord: string): string {
  if (labels.length === 0) return allWord;
  if (labels.length <= 2) return labels.join(" & ");
  return `${labels.length} selected`;
}
