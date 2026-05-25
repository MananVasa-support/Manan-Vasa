"use client";

import * as React from "react";
import { Calendar, Clock, Repeat } from "lucide-react";
import {
  TASK_RECURRENCES,
  RECURRENCE_LABELS,
  type TaskRecurrence,
} from "@/db/enums";

export interface ScheduleValue {
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  recurrence: TaskRecurrence | null;
  /** RRULE-lite detail, e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=2026-12-31". */
  recurrenceRule: string | null;
}

interface Props {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
}

const WEEKDAYS = [
  { code: "SU", label: "S" },
  { code: "MO", label: "M" },
  { code: "TU", label: "T" },
  { code: "WE", label: "W" },
  { code: "TH", label: "T" },
  { code: "FR", label: "F" },
  { code: "SA", label: "S" },
] as const;
const WD_FULL: Record<string, string> = {
  SU: "Sunday", MO: "Monday", TU: "Tuesday", WE: "Wednesday",
  TH: "Thursday", FR: "Friday", SA: "Saturday",
};
const NTH = ["first", "second", "third", "fourth", "last"];

interface RuleParts {
  byday: string[];          // weekly weekday codes
  monthlyMode: "day" | "weekday";
  until: string | null;     // yyyy-mm-dd or null (never)
}

function parseRule(rule: string | null): RuleParts {
  const parts: RuleParts = { byday: [], monthlyMode: "day", until: null };
  if (!rule) return parts;
  for (const seg of rule.split(";")) {
    const [k, v] = seg.split("=");
    if (k === "BYDAY" && v) {
      // Monthly nth-weekday looks like "2MO"; weekly looks like "MO,WE".
      if (/^\d/.test(v)) parts.monthlyMode = "weekday";
      else parts.byday = v.split(",").filter(Boolean);
    }
    if (k === "UNTIL" && v) parts.until = v;
  }
  return parts;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Split an ISO Date into the two strings the date + time inputs need.
 *  We store ISO in the form state but display local YYYY-MM-DD + HH:mm
 *  so the user gets the same numbers they typed. */
function isoToDateParts(d: Date | null): { date: string; time: string } {
  if (!d) return { date: "", time: "" };
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function partsToIso(
  date: string,
  time: string,
  allDay: boolean,
): Date | null {
  if (!date) return null;
  // For all-day events default to noon so timezone wrap-arounds don't
  // push the date off-by-one (same trick the due-date input uses).
  const t = allDay ? "12:00" : time && time.length > 0 ? time : "09:00";
  const d = new Date(`${date}T${t}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Human-readable summary of the recurrence selection. */
function recurrenceSummary(
  freq: string,
  rule: RuleParts,
  anchor: Date,
): string | null {
  if (freq === "none") return null;
  let base: string;
  if (freq === "daily") base = "Repeats daily";
  else if (freq === "weekly") {
    const days = rule.byday.length
      ? rule.byday
          .slice()
          .sort((a, b) => WEEKDAYS.findIndex((w) => w.code === a) - WEEKDAYS.findIndex((w) => w.code === b))
          .map((c) => WD_FULL[c]?.slice(0, 3))
          .join(", ")
      : "";
    base = days ? `Repeats weekly on ${days}` : "Repeats weekly";
  } else if (freq === "monthly") {
    base =
      rule.monthlyMode === "weekday"
        ? `Repeats monthly on the ${NTH[Math.min(Math.ceil(anchor.getDate() / 7), 5) - 1]} ${WD_FULL[WEEKDAYS[anchor.getDay()]!.code]}`
        : `Repeats monthly on day ${anchor.getDate()}`;
  } else if (freq === "yearly") base = "Repeats yearly";
  else base = "Repeats";
  if (rule.until) base += `, until ${rule.until}`;
  return base;
}

function formatDuration(start: Date | null, end: Date | null): string | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin === 0) return "0 min";
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin - days * 60 * 24) / 60);
  const mins = totalMin - days * 60 * 24 - hours * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(" ");
}

/**
 * Google-Calendar-style scheduling block. Self-contained: parent only
 * needs to give us a ScheduleValue + an onChange. No DB writes happen
 * here — that's the calling form's job at submit time.
 *
 * NOT wired to any real calendar API. Two-way Google Calendar sync is
 * a separate, much-bigger task; this is metadata only.
 */
export function ScheduleSection({ value, onChange }: Props) {
  const startParts = isoToDateParts(value.startsAt);
  const endParts = isoToDateParts(value.endsAt);
  const duration = formatDuration(value.startsAt, value.endsAt);

  function setAllDay(next: boolean) {
    onChange({ ...value, allDay: next });
  }
  function setStartDate(d: string) {
    onChange({
      ...value,
      startsAt: partsToIso(d, startParts.time, value.allDay),
    });
  }
  function setStartTime(t: string) {
    onChange({
      ...value,
      startsAt: partsToIso(startParts.date, t, value.allDay),
    });
  }
  function setEndDate(d: string) {
    onChange({
      ...value,
      endsAt: partsToIso(d, endParts.time, value.allDay),
    });
  }
  function setEndTime(t: string) {
    onChange({
      ...value,
      endsAt: partsToIso(endParts.date, t, value.allDay),
    });
  }
  const rule = parseRule(value.recurrenceRule);
  const anchor = value.startsAt ?? new Date();

  // Encode the current frequency + sub-options into recurrence + recurrenceRule.
  function emit(freq: TaskRecurrence, next: Partial<RuleParts>) {
    if (freq === "none") {
      onChange({ ...value, recurrence: null, recurrenceRule: null });
      return;
    }
    const r: RuleParts = { ...rule, ...next };
    const segs = [`FREQ=${freq.toUpperCase()}`];
    if (freq === "weekly" && r.byday.length > 0) {
      segs.push(`BYDAY=${r.byday.join(",")}`);
    }
    if (freq === "monthly") {
      if (r.monthlyMode === "weekday") {
        const nth = Math.min(Math.ceil(anchor.getDate() / 7), 5);
        const wd = WEEKDAYS[anchor.getDay()]!.code;
        segs.push(`BYDAY=${nth}${wd}`);
      } else {
        segs.push(`BYMONTHDAY=${anchor.getDate()}`);
      }
    }
    if (r.until) segs.push(`UNTIL=${r.until}`);
    onChange({ ...value, recurrence: freq, recurrenceRule: segs.join(";") });
  }

  function setFreq(freq: TaskRecurrence) {
    // Sensible default: weekly seeds the start day as the checked weekday.
    if (freq === "weekly" && rule.byday.length === 0) {
      emit(freq, { byday: [WEEKDAYS[anchor.getDay()]!.code] });
    } else {
      emit(freq, {});
    }
  }
  function toggleWeekday(code: string) {
    const byday = rule.byday.includes(code)
      ? rule.byday.filter((c) => c !== code)
      : [...rule.byday, code];
    emit("weekly", { byday });
  }
  function setMonthlyMode(mode: "day" | "weekday") {
    emit("monthly", { monthlyMode: mode });
  }
  function setUntil(until: string) {
    emit((value.recurrence ?? "daily") as TaskRecurrence, { until: until || null });
  }

  const freq = value.recurrence ?? "none";
  const summary = recurrenceSummary(freq, rule, anchor);

  return (
    <div
      className="rounded-section p-5"
      style={{
        border: "1px solid var(--color-hairline)",
        background: "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="inline-flex items-center gap-2.5 uppercase font-black tracking-[0.10em]"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 17,
            color: "rgb(var(--vp-cyan-deep))",
          }}
        >
          <Calendar size={22} strokeWidth={2.2} />
          Schedule
        </span>
        {duration && (
          <span
            className="tabular-nums font-black"
            style={{ fontSize: 14, color: "var(--color-ink-muted)" }}
          >
            Duration · {duration}
          </span>
        )}
      </div>

      <label
        className="inline-flex items-center gap-2 cursor-pointer select-none mb-4"
        style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink-strong)" }}
      >
        <input
          type="checkbox"
          checked={value.allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-4"
          style={{ accentColor: "rgb(168, 4, 0)" }}
        />
        All day
      </label>

      {/* Start row */}
      <div className="grid grid-cols-[80px_1fr_1fr] gap-3 items-center mb-3 max-md:grid-cols-1 max-md:gap-2">
        <span
          className="uppercase font-bold tracking-[0.08em]"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: 12,
            color: "var(--color-ink-muted)",
          }}
        >
          Start
        </span>
        <input
          type="date"
          value={startParts.date}
          onChange={(e) => setStartDate(e.target.value)}
          className="nt-input"
        />
        {!value.allDay && (
          <input
            type="time"
            value={startParts.time}
            onChange={(e) => setStartTime(e.target.value)}
            className="nt-input"
          />
        )}
      </div>

      {/* End row */}
      <div className="grid grid-cols-[80px_1fr_1fr] gap-3 items-center mb-4 max-md:grid-cols-1 max-md:gap-2">
        <span
          className="uppercase font-bold tracking-[0.08em]"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: 12,
            color: "var(--color-ink-muted)",
          }}
        >
          End
        </span>
        <input
          type="date"
          value={endParts.date}
          onChange={(e) => setEndDate(e.target.value)}
          className="nt-input"
        />
        {!value.allDay && (
          <input
            type="time"
            value={endParts.time}
            onChange={(e) => setEndTime(e.target.value)}
            className="nt-input"
          />
        )}
      </div>

      {/* Repeat row */}
      <div className="grid grid-cols-[80px_1fr] gap-3 items-center max-md:grid-cols-1 max-md:gap-2">
        <span
          className="inline-flex items-center gap-1.5 uppercase font-bold tracking-[0.08em]"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: 12,
            color: "var(--color-ink-muted)",
          }}
        >
          <Repeat size={12} strokeWidth={2.4} />
          Repeat
        </span>
        <select
          value={freq}
          onChange={(e) => setFreq(e.target.value as TaskRecurrence)}
          className="nt-input"
        >
          {TASK_RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {/* Weekly → weekday chips (MWF etc.) */}
      {freq === "weekly" && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap pl-[92px] max-md:pl-0">
          {WEEKDAYS.map((d, i) => {
            const on = rule.byday.includes(d.code);
            return (
              <button
                key={d.code + i}
                type="button"
                onClick={() => toggleWeekday(d.code)}
                aria-pressed={on}
                aria-label={WD_FULL[d.code]}
                className="h-9 w-9 rounded-full text-[13px] font-bold transition-colors"
                style={{
                  background: on ? "rgb(168, 4, 0)" : "var(--color-surface-soft)",
                  color: on ? "#fff" : "var(--color-ink-soft)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Monthly → on day-of-month vs nth weekday */}
      {freq === "monthly" && (
        <div className="mt-3 flex flex-col gap-2 pl-[92px] max-md:pl-0">
          <label className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink-strong cursor-pointer">
            <input type="radio" name="monthly-mode" checked={rule.monthlyMode === "day"} onChange={() => setMonthlyMode("day")} style={{ accentColor: "rgb(168, 4, 0)" }} />
            Monthly on day {anchor.getDate()}
          </label>
          <label className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink-strong cursor-pointer">
            <input type="radio" name="monthly-mode" checked={rule.monthlyMode === "weekday"} onChange={() => setMonthlyMode("weekday")} style={{ accentColor: "rgb(168, 4, 0)" }} />
            Monthly on the {NTH[Math.min(Math.ceil(anchor.getDate() / 7), 5) - 1]} {WD_FULL[WEEKDAYS[anchor.getDay()]!.code]}
          </label>
        </div>
      )}

      {/* Ends — never (default) or on a date */}
      {freq !== "none" && (
        <div className="mt-3 flex items-center gap-3 pl-[92px] max-md:pl-0">
          <span className="text-[13px] font-semibold text-ink-muted">Ends</span>
          <select
            value={rule.until ? "until" : "never"}
            onChange={(e) => setUntil(e.target.value === "never" ? "" : ymd(new Date(anchor.getTime() + 90 * 86400000)))}
            className="nt-input"
            style={{ maxWidth: 160 }}
          >
            <option value="never">Never</option>
            <option value="until">On date…</option>
          </select>
          {rule.until && (
            <input
              type="date"
              value={rule.until}
              onChange={(e) => setUntil(e.target.value)}
              className="nt-input"
              style={{ maxWidth: 180 }}
            />
          )}
        </div>
      )}

      {summary && (
        <p className="mt-3 text-[13px] font-semibold pl-[92px] max-md:pl-0" style={{ color: "rgb(var(--vp-cyan-deep))" }}>
          {summary}
        </p>
      )}

      <p
        className="mt-4 font-semibold"
        style={{
          fontSize: 13,
          color: "var(--color-ink-muted)",
          lineHeight: 1.5,
        }}
      >
        Internal scheduling only — not synced to any external calendar.
        Use the deadline (<strong>Due Date</strong>) above for the
        commitment; this block describes when the work happens.
      </p>
    </div>
  );
}
