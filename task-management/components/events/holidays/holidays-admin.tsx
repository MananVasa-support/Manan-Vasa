"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { format, parseISO } from "date-fns";
import { Plus, Pencil, Trash2, Lock, Sparkles, GraduationCap } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { HOLIDAY_APPLIES_TO_LABELS, type HolidayAppliesTo } from "@/db/enums";
import type { Holiday } from "@/lib/monthly-events/types";
import { deleteHoliday } from "@/app/(app)/events/holidays/actions";
import { HolidayFormDialog } from "./holiday-form-dialog";
import { ReligionEditor, type EmployeeReligionRow } from "./religion-editor";
import { religionCounts } from "./personalise";

const ACCENT = "#0891b2";
const ACCENT_DEEP = "#0e7490";

const APPLIES_TO_STYLE: Record<HolidayAppliesTo, { bg: string; fg: string }> = {
  all: { bg: "#e0f2fe", fg: "#0369a1" },
  hindu_only: { bg: "#ffedd5", fg: "#c2410c" },
  christian: { bg: "#ede9fe", fg: "#6d28d9" },
  muslim: { bg: "#dcfce7", fg: "#15803d" },
  custom: { bg: "#f1f5f9", fg: "#475569" },
};

interface Props {
  fyStartYear: number;
  holidays: Holiday[];
  employees: EmployeeReligionRow[];
}

const FY_OPTIONS = [2026, 2027] as const;

export function HolidaysAdmin({ fyStartYear, holidays, employees }: Props) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Holiday | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const counts = religionCounts(holidays);

  function refresh() {
    router.refresh();
  }

  function switchFy(fy: number) {
    router.push(`/events/holidays?fy=${fy}` as Route);
  }

  function onDelete(h: Holiday) {
    if (!window.confirm(`Delete "${h.name}" (${format(parseISO(h.holidayDate), "d MMM yyyy")})?`))
      return;
    setPendingDelete(h.id);
    startTransition(async () => {
      const res = await deleteHoliday(h.id);
      setPendingDelete(null);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${h.name} deleted.` });
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* FY switcher + add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-pill border border-hairline bg-surface-card p-1">
          {FY_OPTIONS.map((fy) => {
            const active = fy === fyStartYear;
            return (
              <button
                key={fy}
                type="button"
                onClick={() => switchFy(fy)}
                className="rounded-pill px-4 py-1.5 text-[13.5px] font-bold transition-colors"
                style={
                  active
                    ? { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, color: "#fff" }
                    : { color: "var(--color-ink-muted, #64748b)" }
                }
              >
                FY{String(fy).slice(2)}
                <span className="ml-1.5 font-medium opacity-80">
                  Apr&nbsp;{fy}–Mar&nbsp;{fy + 1}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          <Plus size={17} strokeWidth={2.6} />
          Add holiday
        </button>
      </div>

      {/* Per-religion count preview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((c) => (
          <div
            key={c.key}
            className="rounded-2xl border border-hairline bg-surface-card p-4"
          >
            <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft">
              {c.label}
            </div>
            <div
              className="mt-1 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 30,
                lineHeight: 1,
              }}
            >
              {c.count}
            </div>
            <div className="mt-1 text-[12px] text-ink-soft">holidays</div>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-[12.5px] text-ink-soft">
        Sanity-check: each person&apos;s set should land around 15–16. Hindu =
        base + Hindu-only; others = base + their add-ons, minus Hindu-only.
      </p>

      {/* Holiday table */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft/50 text-left text-[12px] font-bold uppercase tracking-[0.05em] text-ink-soft">
                <th className="px-4 py-3">Holiday</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Weekday</th>
                <th className="px-4 py-3">Applies to</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holidays.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-soft">
                    No holidays for this financial year yet. Add one, or run the
                    seed script.
                  </td>
                </tr>
              ) : (
                holidays.map((h) => {
                  const d = parseISO(h.holidayDate);
                  const style = APPLIES_TO_STYLE[h.appliesTo] ?? APPLIES_TO_STYLE.custom;
                  return (
                    <tr
                      key={h.id}
                      className="border-b border-hairline last:border-0 hover:bg-surface-soft/40"
                    >
                      <td className="px-4 py-3 font-semibold text-ink-strong">
                        {h.name}
                        {h.notes ? (
                          <span className="ml-2 text-[12px] font-normal text-ink-soft">
                            {h.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-muted">
                        {format(d, "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{format(d, "EEEE")}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex rounded-pill px-2.5 py-0.5 text-[12px] font-bold"
                          style={{ background: style.bg, color: style.fg }}
                        >
                          {HOLIDAY_APPLIES_TO_LABELS[h.appliesTo]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-ink-soft">
                          {h.isOfficeClosed && (
                            <span title="Office closed — auto-blocks the calendar">
                              <Lock size={15} />
                            </span>
                          )}
                          {h.isFestivalMarker && (
                            <span title="Festival marker" style={{ color: ACCENT_DEEP }}>
                              <Sparkles size={15} />
                            </span>
                          )}
                          {h.isExamMarker && (
                            <span title="Exam marker (Siaa)" style={{ color: "#c2410c" }}>
                              <GraduationCap size={15} />
                            </span>
                          )}
                          {h.isOptional && (
                            <span className="rounded-pill bg-surface-soft px-2 py-0.5 text-[11px] font-bold">
                              OPT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(h)}
                            aria-label={`Edit ${h.name}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(h)}
                            disabled={pendingDelete === h.id}
                            aria-label={`Delete ${h.name}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-[#FEF2F2] hover:text-[#A80400] disabled:opacity-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Religion editor */}
      <ReligionEditor employees={employees} />

      {(creating || editing) && (
        <HolidayFormDialog
          fyStartYear={fyStartYear}
          holiday={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
