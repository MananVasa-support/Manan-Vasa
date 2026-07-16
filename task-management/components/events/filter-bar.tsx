"use client";

/**
 * Calendar filter bar (design §2 extension). A horizontal row above the grid
 * that narrows the visible events by Status, Source and two flags (obligation-
 * linked / locked), on top of the category legend on the left. Empty = show all;
 * each group is independent and combines (AND across groups, OR within a group).
 * Batch-TYPE filtering (PS/BSS/Conclave/Graduate) is the `Batch` source pill +
 * the category legend, since batch events carry their type as their category.
 */
import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { EventStatus, EventSource } from "@/db/enums";
import { cn } from "@/lib/utils";

export interface CalendarFilters {
  status: Set<EventStatus>;
  source: Set<EventSource>;
  obligationOnly: boolean;
  lockedOnly: boolean;
}

export function emptyFilters(): CalendarFilters {
  return { status: new Set(), source: new Set(), obligationOnly: false, lockedOnly: false };
}

export function filtersActiveCount(f: CalendarFilters): number {
  return f.status.size + f.source.size + (f.obligationOnly ? 1 : 0) + (f.lockedOnly ? 1 : 0);
}

const STATUS_OPTS: { id: EventStatus; label: string }[] = [
  { id: "confirmed", label: "Confirmed" },
  { id: "tentative", label: "Tentative" },
];
const SOURCE_OPTS: { id: EventSource; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "batch", label: "Batch" },
  { id: "holiday", label: "Holiday" },
  { id: "obligation", label: "Obligation" },
];

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-pill px-3 py-1 text-[12.5px] font-semibold transition-colors",
        active
          ? "text-white"
          : "border border-hairline bg-surface-soft text-ink-muted hover:border-hairline-strong hover:text-ink-strong",
      )}
      style={active ? { background: "var(--color-altus-red, #c8102e)" } : undefined}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

export function FilterBar({
  filters,
  onToggleStatus,
  onToggleSource,
  onToggleFlag,
  onClear,
}: {
  filters: CalendarFilters;
  onToggleStatus: (s: EventStatus) => void;
  onToggleSource: (s: EventSource) => void;
  onToggleFlag: (flag: "obligationOnly" | "lockedOnly") => void;
  onClear: () => void;
}) {
  const count = filtersActiveCount(filters);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-hairline bg-surface-card px-3 py-2">
      <span className="flex items-center gap-1.5 text-[12px] font-bold text-ink-strong">
        <SlidersHorizontal size={14} strokeWidth={2.4} className="text-ink-soft" />
        Filters
      </span>

      <Group label="Status">
        {STATUS_OPTS.map((o) => (
          <Pill key={o.id} active={filters.status.has(o.id)} onClick={() => onToggleStatus(o.id)}>
            {o.label}
          </Pill>
        ))}
      </Group>

      <Group label="Source">
        {SOURCE_OPTS.map((o) => (
          <Pill key={o.id} active={filters.source.has(o.id)} onClick={() => onToggleSource(o.id)}>
            {o.label}
          </Pill>
        ))}
      </Group>

      <Group label="Only">
        <Pill active={filters.obligationOnly} onClick={() => onToggleFlag("obligationOnly")}>
          Obligation-linked
        </Pill>
        <Pill active={filters.lockedOnly} onClick={() => onToggleFlag("lockedOnly")}>
          Locked
        </Pill>
      </Group>

      {count > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
        >
          <X size={13} strokeWidth={2.6} />
          Clear ({count})
        </button>
      )}
    </div>
  );
}
