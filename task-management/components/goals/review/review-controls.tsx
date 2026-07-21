"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fyLabel, type RosterMember } from "@/components/goals/cascade/util";
import { fyStartYearOf } from "@/lib/goals/types";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/**
 * Header controls for the Review & Scores page — the same glowing "Viewing"
 * person pill + FY stepper the level boards use, but navigating the review
 * route. A manager/admin (roster > 1) can pick whose scorecard to review; the
 * FY stepper walks financial years. Shareable via ?emp= & ?fy=.
 */
export function ReviewControls({
  roster,
  viewedEmployeeId,
  viewedName,
  myEmployeeId,
  fyStartYear,
}: {
  roster: RosterMember[];
  viewedEmployeeId: string;
  viewedName: string;
  myEmployeeId: string;
  fyStartYear: number;
}) {
  const router = useRouter();
  const fy = fyStartYear;

  const go = React.useCallback(
    (params: { emp?: string; fy?: number }) => {
      const sp = new URLSearchParams();
      const emp = params.emp ?? viewedEmployeeId;
      if (emp && emp !== myEmployeeId) sp.set("emp", emp);
      const fyNext = params.fy ?? fy;
      if (fyNext !== fyStartYearOf(new Date())) sp.set("fy", String(fyNext));
      const qs = sp.toString();
      router.push(`/goals/review${qs ? `?${qs}` : ""}` as Route);
    },
    [router, viewedEmployeeId, myEmployeeId, fy],
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      {/* Name selector — the glowing "Viewing" pill (avatar + unstyled Select). */}
      {roster.length > 1 && (
        <div className="group relative w-[236px] max-md:w-full">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-[2px] rounded-2xl opacity-55 blur-[7px] transition-opacity duration-300 group-hover:opacity-90"
            style={{ background: "linear-gradient(120deg, var(--color-altus-red), #ff5560, var(--color-altus-red-deep))" }}
          />
          <div
            className="relative flex items-center gap-2.5 rounded-2xl px-2.5 py-1.5"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 12%, var(--color-surface-card)), var(--color-surface-card) 70%)",
              border: "1.5px solid color-mix(in srgb, var(--color-altus-red) 32%, transparent)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.78), 0 9px 24px -13px color-mix(in srgb, var(--color-altus-red) 60%, transparent)",
            }}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-black text-white"
              style={{
                background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px var(--color-altus-red)",
              }}
            >
              {viewedName.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="text-[8.5px] font-black uppercase tracking-[0.16em]"
                style={{ color: "var(--color-altus-red-deep)" }}
              >
                Reviewing
              </div>
              <Select
                value={viewedEmployeeId}
                onValueChange={(v) => go({ emp: v })}
                searchable
                searchPlaceholder="Search people…"
                ariaLabel="Review another person's goals"
                unstyled
                className="flex w-full cursor-pointer items-center gap-1 text-left text-[13.5px] font-bold text-ink-strong"
                options={roster.map((r) => ({
                  value: r.id,
                  label: r.id === myEmployeeId ? `${r.name} (me)` : r.name,
                }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* FY stepper */}
      <div
        className="inline-flex items-center overflow-hidden rounded-full"
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid color-mix(in srgb, var(--color-altus-red) 20%, var(--color-hairline))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 2px rgba(15,23,42,0.05)",
        }}
      >
        <button
          type="button"
          aria-label="Previous financial year"
          onClick={() => go({ fy: fy - 1 })}
          className={`cursor-pointer px-2.5 py-1.5 text-ink-subtle transition-colors hover:text-altus-red hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] ${FOCUS_RING}`}
        >
          <ChevronLeft size={17} strokeWidth={2.4} />
        </button>
        <span
          className="px-3.5 py-1.5 text-[13.5px] tabular-nums text-ink-strong"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            borderInline: "1px solid color-mix(in srgb, var(--color-altus-red) 14%, var(--color-hairline))",
          }}
        >
          {fyLabel(fy)}
        </span>
        <button
          type="button"
          aria-label="Next financial year"
          onClick={() => go({ fy: fy + 1 })}
          className={`cursor-pointer px-2.5 py-1.5 text-ink-subtle transition-colors hover:text-altus-red hover:bg-[color-mix(in_srgb,var(--color-altus-red)_8%,transparent)] ${FOCUS_RING}`}
        >
          <ChevronRight size={17} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
