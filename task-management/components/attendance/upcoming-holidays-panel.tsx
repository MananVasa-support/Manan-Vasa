import { CalendarHeart, ArrowRight, PartyPopper } from "lucide-react";

/**
 * Right-rail "what's next off" list on the attendance home. Rows are
 * pre-filtered to upcoming, active holidays by the page; this is pure display.
 */
export interface UpcomingHoliday {
  date: string; // YYYY-MM-DD
  label: string;
  /** Days from today (0 = today). */
  inDays: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(date: string): { day: string; mon: string; dow: string } {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12));
  return {
    day: String(d ?? 1).padStart(2, "0"),
    mon: MONTHS[(m ?? 1) - 1] ?? "",
    dow: WEEKDAYS[dt.getUTCDay()] ?? "",
  };
}

function whenLabel(inDays: number): string {
  if (inDays <= 0) return "Today";
  if (inDays === 1) return "Tomorrow";
  if (inDays < 7) return `In ${inDays} days`;
  const weeks = Math.round(inDays / 7);
  return weeks <= 1 ? "Next week" : `In ${weeks} weeks`;
}

export function UpcomingHolidaysPanel({ holidays }: { holidays: UpcomingHoliday[] }) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-5 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: "180ms",
      }}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="inline-grid size-9 place-items-center rounded-xl"
          style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: "#A80400" }}
        >
          <CalendarHeart size={17} strokeWidth={2.4} />
        </span>
        <div>
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Upcoming Holidays
          </h2>
          <p className="text-[12px] font-medium text-ink-subtle">Company calendar</p>
        </div>
      </div>

      {holidays.length === 0 ? (
        <div className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border border-solid border-hairline-strong bg-surface-soft px-4 py-6 text-center">
          <PartyPopper size={20} strokeWidth={2} className="text-ink-soft" aria-hidden />
          <p className="text-[13px] font-medium text-ink-muted">No holidays coming up.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {holidays.map((h) => {
            const p = parts(h.date);
            return (
              <li
                key={h.date + h.label}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-soft"
              >
                <span
                  className="inline-grid size-11 shrink-0 place-items-center rounded-xl leading-none"
                  style={{
                    background: "color-mix(in srgb, #E10600 8%, transparent)",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, #E10600 16%, transparent)",
                  }}
                >
                  <span className="text-[15px] font-black tabular-nums text-[var(--color-altus-red-deep)]">
                    {p.day}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--color-altus-red-deep)]/80">
                    {p.mon}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-ink-strong">{h.label}</p>
                  <p className="text-[12px] font-medium text-ink-subtle">
                    {p.dow} · {whenLabel(h.inDays)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <a
        href="/holidays"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-pill py-2 text-[13px] font-bold text-ink-muted transition-colors hover:text-[var(--color-altus-red-deep)] hover:bg-surface-soft outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/40"
      >
        View all <ArrowRight size={14} strokeWidth={2.6} />
      </a>
    </section>
  );
}
