import { CalendarDays } from "lucide-react";

/**
 * Current-month attendance calendar — one colour-coded cell per graded day
 * (P / H·D / A / W-O / holiday / leave), with late/early markers and a per-week
 * worked-hours bar toward the 54h weekly target (Sir's rule). Pure display; the
 * grading comes pre-computed from `getEmployeeMonthStatus` so it never re-derives.
 */

export interface MonthCell {
  date: string;
  day: number;
  weekday: number; // 0=Sun..6=Sat
  code: string;
  late: boolean;
  leftEarly: boolean;
  isWeeklyOff: boolean;
  inAt: string | null;
  outAt: string | null;
  workedMinutes: number;
  future: boolean;
}

const WEEK_TARGET_MIN = 54 * 60;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Mon-first index (0..6) for a JS weekday (0=Sun..6=Sat). */
function monIndex(weekday: number): number {
  return (weekday + 6) % 7;
}

interface CellStyle {
  bg: string;
  fg: string;
  label: string;
}
function codeStyle(c: MonthCell): CellStyle {
  if (c.future) return { bg: "transparent", fg: "var(--color-ink-subtle)", label: "" };
  switch (c.code) {
    case "P":
      return { bg: "color-mix(in srgb, #15803d 12%, #fff)", fg: "#15803d", label: "Present" };
    case "HP":
      return { bg: "color-mix(in srgb, #0d9488 14%, #fff)", fg: "#0f766e", label: "Worked a holiday/off" };
    case "H/D":
    case "H-H/D":
      return { bg: "color-mix(in srgb, #b45309 14%, #fff)", fg: "#b45309", label: "Half day" };
    case "A":
    case "LWP":
      return { bg: "color-mix(in srgb, #b91c1c 12%, #fff)", fg: "#b91c1c", label: c.code === "A" ? "Absent" : "Leave (unpaid)" };
    case "W/O":
      return { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)", label: "Weekly off" };
    case "H":
      return { bg: "color-mix(in srgb, #2563eb 12%, #fff)", fg: "#1d4ed8", label: "Holiday" };
    case "PL":
    case "CO":
      return { bg: "color-mix(in srgb, #7c3aed 12%, #fff)", fg: "#6d28d9", label: c.code === "PL" ? "Paid leave" : "Comp-off" };
    case "incomplete":
      return { bg: "color-mix(in srgb, #b45309 8%, #fff)", fg: "#b45309", label: "Incomplete (no check-out)" };
    default:
      return { bg: "transparent", fg: "var(--color-ink-subtle)", label: "" };
  }
}

function fmtHrs(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function MonthCalendar({ cells, monthLabel, compact }: { cells: MonthCell[]; monthLabel: string; compact?: boolean }) {
  if (cells.length === 0) {
    return null;
  }
  const wkCol = compact ? "38px" : "84px";
  // Build a Mon-first grid with leading blanks for the 1st's offset.
  const lead = monIndex(cells[0]!.weekday);
  const slots: (MonthCell | null)[] = [...Array(lead).fill(null), ...cells];
  const weeks: (MonthCell | null)[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

  return (
    <section
      className={`wg-rise bg-surface-card ${compact ? "rounded-[20px] p-4" : "rounded-[22px] p-6 max-md:p-4"}`}
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)", animationDelay: "120ms" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-grid size-7 place-items-center rounded-lg" style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: "#A80400" }}>
          <CalendarDays size={15} strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {monthLabel}
          </h2>
          <p className="text-[11px] font-medium text-ink-subtle">Each week totals toward 54h</p>
        </div>
      </div>

      {/* weekday header */}
      <div className="grid gap-1 pb-1" style={{ gridTemplateColumns: `repeat(7,minmax(0,1fr)) ${wkCol}` }}>
        {DOW.map((d) => (
          <div key={d} className="text-center text-[9px] font-black uppercase tracking-wide text-ink-subtle">{d.slice(0, 1)}</div>
        ))}
        <div className="text-right text-[9px] font-black uppercase tracking-wide text-ink-subtle">Wk</div>
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => {
          const worked = week.reduce((s, c) => s + (c && !c.future ? c.workedMinutes : 0), 0);
          const pct = Math.min(100, Math.round((worked / WEEK_TARGET_MIN) * 100));
          const hit = worked >= WEEK_TARGET_MIN;
          return (
            <div key={wi} className="grid gap-1" style={{ gridTemplateColumns: `repeat(7,minmax(0,1fr)) ${wkCol}` }}>
              {week.map((c, ci) => {
                if (!c) return <div key={ci} className={`${compact ? "h-9" : "aspect-square"} rounded-md`} />;
                const st = codeStyle(c);
                const title = c.future
                  ? `${c.date} · upcoming`
                  : `${c.date} · ${st.label}${c.inAt ? ` · in ${c.inAt}` : ""}${c.outAt ? ` · out ${c.outAt}` : ""}${c.late ? " · late" : ""}${c.leftEarly ? " · left early" : ""}`;
                return (
                  <div
                    key={ci}
                    title={title}
                    className={`relative flex ${compact ? "h-9" : "aspect-square"} items-center justify-center rounded-md border text-center`}
                    style={{
                      background: st.bg,
                      borderColor: c.future ? "var(--color-hairline)" : "color-mix(in srgb, " + st.fg + " 22%, transparent)",
                      opacity: c.future ? 0.5 : 1,
                    }}
                  >
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: c.future ? "var(--color-ink-subtle)" : st.fg }}>{c.day}</span>
                    {(c.late || c.leftEarly) && !c.future && (
                      <span className="absolute right-0.5 top-0.5 flex gap-px">
                        {c.late && <span className="size-1 rounded-full" style={{ background: "#b45309" }} title="Late" />}
                        {c.leftEarly && <span className="size-1 rounded-full" style={{ background: "#be123c" }} title="Left early" />}
                      </span>
                    )}
                  </div>
                );
              })}
              {/* week 54h bar */}
              <div className="flex flex-col justify-center gap-0.5 pl-0.5">
                <span className="text-right text-[10px] font-black tabular-nums leading-none" style={{ color: hit ? "#15803d" : "var(--color-ink-soft)" }}>{fmtHrs(worked)}</span>
                <div className="h-1 overflow-hidden rounded-full bg-surface-track">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: hit ? "linear-gradient(90deg,#16a34a,#15803d)" : "#94a3b8" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold text-ink-muted">
        <LegendDot c="#15803d" label="Present" />
        <LegendDot c="#b45309" label="Half" />
        <LegendDot c="#b91c1c" label="Absent" />
        <LegendDot c="#2563eb" label="Holiday" />
        <LegendDot c="#7c3aed" label="Leave" />
        <LegendDot c="#94a3b8" label="W-off" />
      </div>
    </section>
  );
}

function LegendDot({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}
