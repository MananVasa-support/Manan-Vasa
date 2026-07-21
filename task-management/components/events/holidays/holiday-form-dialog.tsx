"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { fireToast } from "@/lib/toast";
import { HOLIDAY_APPLIES_TO_LABELS, type HolidayAppliesTo } from "@/db/enums";
import type { Holiday } from "@/lib/monthly-events/types";
import { createHoliday, updateHoliday } from "@/app/(app)/events/holidays/actions";
import { HolidayModal } from "./modal-shell";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const APPLIES_TO_OPTIONS = (
  Object.keys(HOLIDAY_APPLIES_TO_LABELS) as HolidayAppliesTo[]
).map((v) => ({ value: v, label: HOLIDAY_APPLIES_TO_LABELS[v] }));

interface Props {
  fyStartYear: number;
  /** Editing an existing row, or null for a fresh create. */
  holiday: Holiday | null;
  onClose: () => void;
  /** Called after a successful create/update so the parent can refresh. */
  onSaved: () => void;
}

export function HolidayFormDialog({ fyStartYear, holiday, onClose, onSaved }: Props) {
  const isEdit = holiday !== null;
  const [name, setName] = React.useState(holiday?.name ?? "");
  const [dateISO, setDateISO] = React.useState<string>(holiday?.holidayDate ?? "");
  const [appliesTo, setAppliesTo] = React.useState<HolidayAppliesTo>(
    holiday?.appliesTo ?? "all",
  );
  const [isOptional, setIsOptional] = React.useState(holiday?.isOptional ?? false);
  const [isOfficeClosed, setIsOfficeClosed] = React.useState(
    holiday?.isOfficeClosed ?? true,
  );
  const [isFestivalMarker, setIsFestivalMarker] = React.useState(
    holiday?.isFestivalMarker ?? false,
  );
  const [isExamMarker, setIsExamMarker] = React.useState(
    holiday?.isExamMarker ?? false,
  );
  const [notes, setNotes] = React.useState(holiday?.notes ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [calOpen, setCalOpen] = React.useState(false);

  const selectedDate = dateISO ? parseISO(dateISO) : undefined;
  const weekday = dateISO ? format(parseISO(dateISO), "EEEE") : null;
  // Default the calendar to the relevant FY window (Apr fyStartYear).
  const defaultMonth = selectedDate ?? new Date(fyStartYear, 3, 1);

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!dateISO) {
      setError("Pick a date.");
      return;
    }
    const payload = {
      name: name.trim(),
      fyStartYear,
      holidayDate: dateISO,
      appliesTo,
      isOptional,
      isOfficeClosed,
      isFestivalMarker,
      isExamMarker,
      notes: notes.trim() || null,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateHoliday({ id: holiday!.id, ...payload })
        : await createHoliday(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: isEdit ? "Holiday updated." : `${payload.name} added.` });
      onSaved();
      onClose();
    });
  }

  return (
    <HolidayModal
      title={isEdit ? "Edit holiday" : "New holiday"}
      subtitle={`FY${String(fyStartYear).slice(2)} · Apr ${fyStartYear} – Mar ${fyStartYear + 1}`}
      accent={`linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="bg-surface-card inline-flex h-10 items-center rounded-chip px-4 text-[14px] font-semibold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            onClick={submit}
            disabled={pending}
            className="brand-btn inline-flex h-10 items-center rounded-chip px-5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add holiday"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Holiday name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            placeholder="Diwali"
            className="h-11 w-full rounded-chip border border-hairline bg-surface-card px-3.5 text-[15px] text-ink-strong outline-none transition-all placeholder:text-ink-subtle focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-2 rounded-chip border border-hairline bg-surface-card px-3.5 text-left text-[15px] text-ink-strong outline-none transition-all hover:border-hairline-strong focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
                >
                  <CalendarDays size={16} className="shrink-0 text-ink-subtle" />
                  <span className={dateISO ? "" : "text-ink-subtle"}>
                    {dateISO ? format(parseISO(dateISO), "d MMM yyyy") : "Pick date"}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3">
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  defaultMonth={defaultMonth}
                  onSelect={(d) => {
                    if (d) setDateISO(format(d, "yyyy-MM-dd"));
                    setCalOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>
          <Field label="Weekday" hint="Auto from the date.">
            <div className="flex h-11 items-center rounded-chip border border-hairline bg-surface-soft/60 px-3.5 text-[15px] font-semibold text-ink-muted">
              {weekday ?? "—"}
            </div>
          </Field>
        </div>

        <Field label="Applies to" hint="Nothing is tagged Hindu-only by default — you tag exactly the ones Sir marks.">
          <Select
            options={APPLIES_TO_OPTIONS}
            value={appliesTo}
            onValueChange={(v) => setAppliesTo(v as HolidayAppliesTo)}
            searchable={false}
          />
        </Field>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-hairline bg-surface-soft/40 p-3.5">
          <FlagRow label="Office closed" checked={isOfficeClosed} onChange={setIsOfficeClosed} />
          <FlagRow label="Optional" checked={isOptional} onChange={setIsOptional} />
          <FlagRow label="Festival marker" checked={isFestivalMarker} onChange={setIsFestivalMarker} />
          <FlagRow label="Exam marker (Siaa)" checked={isExamMarker} onChange={setIsExamMarker} />
        </div>
        <p className="-mt-1.5 text-[12.5px] text-ink-soft">
          Office-closed days auto-block the calendar as a locked all-day banner.
        </p>

        <Field label="Notes" hint="Optional.">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={4000}
            placeholder="verify date"
            className="h-11 w-full rounded-chip border border-hairline bg-surface-card px-3.5 text-[15px] text-ink-strong outline-none transition-all placeholder:text-ink-subtle focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
          />
        </Field>

        {error && (
          <div
            role="alert"
            className="rounded-chip border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[13.5px] font-medium text-[#A80400]"
          >
            {error}
          </div>
        )}
      </div>
    </HolidayModal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] text-ink-soft">{hint}</p>}
    </div>
  );
}

function FlagRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-medium text-ink-strong">
      <Checkbox checked={checked} onChange={onChange} ariaLabel={label} />
      {label}
    </label>
  );
}
