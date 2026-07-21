import {
  MapPin,
  ShieldCheck,
  CalendarCheck,
  LogIn,
  LogOut,
  MoveRight,
  Activity,
  Users,
  ClipboardList,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { PunchCard } from "@/components/attendance/punch-card";
import { TodayPanel } from "@/components/attendance/today-panel";
import { AttendanceKpiStrip } from "@/components/attendance/attendance-kpi-strip";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { RemoteCheckInTrigger } from "@/components/attendance/remote-checkin-trigger";
import { TeamDatePicker } from "@/components/attendance/team-date-picker";
import {
  AttTeamRoster,
  type RosterPunch,
  type RosterRow,
} from "@/components/attendance/att-team-roster";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  listMyAttendance,
  listTeamAttendanceForDate,
  type DayPunches,
  type PunchDetail,
} from "@/lib/queries/attendance";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { getSelfAttendanceSummary } from "@/lib/queries/attendance-summary";
import { getEmployeeMonthStatus } from "@/lib/queries/attendance-status";
import { withRetry } from "@/lib/db/with-timeout";
import { formatTimeInTz, localDateString } from "@/lib/format";

export const dynamic = "force-dynamic";

// The attendance page load must never crash — a stale pooled connection here
// stops the user reaching the check-in/out button. Retry each read on a fresh
// connection.
const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DAY_LABEL_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
};

/** "2026-06-10" → "Wed, 10 Jun 2026" without timezone drift. */
function labelForDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", DAY_LABEL_FMT).format(
    new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12)),
  );
}

/** "2026-06-10" → { dow: "Wed", dm: "10 Jun" } for the timeline rail. */
function splitDateLabel(date: string): { dow: string; dm: string } {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12));
  return {
    dow: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(dt),
    dm: new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(dt),
  };
}

/** Worked milliseconds for a day (needs both punches, out after in). */
function workedMs(d: DayPunches): number | null {
  if (!d.in || !d.out) return null;
  const ms = d.out.at.getTime() - d.in.at.getTime();
  return ms > 0 ? ms : null;
}

/** 27_120_000 → "7h 32m" */
function fmtDur(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();
  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  // My last 14 calendar days.
  const since = localDateString(tz, new Date(Date.now() - 13 * 86_400_000));

  const rawDate = typeof sp.date === "string" ? sp.date : today;
  const teamDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

  const [curYear, curMonth] = today.split("-").map(Number) as [number, number];

  const [myDays, team, settings, selfSummary, monthStatus] = await Promise.all([
    withRetry(() => listMyAttendance(me.id, since), { ...RETRY, label: "att-mydays" }),
    me.isAdmin
      ? withRetry(() => listTeamAttendanceForDate(teamDate), { ...RETRY, label: "att-team" })
      : Promise.resolve(null),
    withRetry(() => getOrgSettings(), { ...RETRY, label: "att-settings" }),
    withRetry(() => getSelfAttendanceSummary(me.id), { ...RETRY, label: "att-self" }),
    withRetry(() => getEmployeeMonthStatus(me.id, curYear, curMonth, today), { ...RETRY, label: "att-month" }),
  ]);

  // Month calendar cells (client-safe) — colour-coded per graded day.
  const monthCells = monthStatus.days.map((d) => ({
    date: d.logDate,
    day: Number(d.logDate.slice(8, 10)),
    weekday: d.weekday,
    code: d.code,
    late: d.late,
    leftEarly: d.leftEarly,
    isWeeklyOff: d.isWeeklyOff,
    inAt: d.inAt,
    outAt: d.outAt,
    workedMinutes: d.workedMinutes,
    future: d.logDate > today,
  }));

  const todayRow = myDays.find((d) => d.date === today);
  const firstName = me.name.split(" ")[0] ?? me.name;

  // Most recent punch across the loaded window → "Last punch" line in the hero.
  let lastPunchLabel: string | null = null;
  for (const d of myDays) {
    const latest =
      d.out && d.in
        ? (d.out.at > d.in.at ? { p: d.out, kind: "out" as const } : { p: d.in, kind: "in" as const })
        : d.out
          ? { p: d.out, kind: "out" as const }
          : d.in
            ? { p: d.in, kind: "in" as const }
            : null;
    if (latest) {
      const when = d.date === today ? "today" : labelForDate(d.date);
      lastPunchLabel = `${latest.kind === "in" ? "Check-in" : "Check-out"} · ${when} at ${formatTimeInTz(latest.p.at, tz)}`;
      break;
    }
  }

  // Location-only geofence: the punch control stays disabled until the browser
  // reports a GPS fix; when office coords are set the server rejects any fix
  // outside the radius. When no coords are configured the fence is off (punch
  // from anywhere) — the card still captures location but never blocks.
  const geofenceEnabled = settings.officeLat != null && settings.officeLng != null;

  // Today's punches (for the status chip + Today panel).
  const inLabel = todayRow?.in ? formatTimeInTz(todayRow.in.at, tz) : null;
  const outLabel = todayRow?.out ? formatTimeInTz(todayRow.out.at, tz) : null;
  const inISO = todayRow?.in ? todayRow.in.at.toISOString() : null;
  const outISO = todayRow?.out ? todayRow.out.at.toISOString() : null;
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(curYear, curMonth - 1, 1)),
  );

  // Serialize the team rows for the client roster (search lives client-side).
  const rosterRows: RosterRow[] | null = team
    ? team.map((r) => ({
        employeeId: r.employeeId,
        name: r.name,
        avatarUrl: r.avatarUrl,
        in: toRosterPunch(r.in, tz),
        out: toRosterPunch(r.out, tz),
        note: [r.in?.note, r.out?.note].filter(Boolean).join(" · "),
      }))
    : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Page header ── */}
        <header className="mb-6 wg-rise flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              <CalendarCheck size={13} strokeWidth={2.6} /> Employees · Attendance
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px,3.6vw,46px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              Good to see you, {firstName}
            </h1>
          </div>
          {me.isAdmin && (
            <a
              href="/attendance/dashboard"
              className="brand-btn wg-btn shrink-0 inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)", boxShadow: "0 8px 20px -10px color-mix(in srgb, #A80400 70%, transparent)" }}
            >
              <ClipboardList size={15} strokeWidth={2.4} /> Att Report
            </a>
          )}
        </header>

        {/* ── How am I doing — full-width KPI bar across the top ── */}
        <div className="mb-5">
          <AttendanceKpiStrip data={selfSummary} />
        </div>

        {/* ── Two balanced halves: attendance box (left) · today/calendar (right) ── */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          {/* FIRST HALF — the attendance box + WFH / on-site log (fills the space
              under the punch card, per Sir) */}
          <div className="flex flex-col gap-5">
            <PunchCard
              todayLabel={labelForDate(today)}
              inLabel={todayRow?.in ? formatTimeInTz(todayRow.in.at, tz) : null}
              outLabel={todayRow?.out ? formatTimeInTz(todayRow.out.at, tz) : null}
              tz={tz}
              geofenceEnabled={geofenceEnabled}
              officeLat={settings.officeLat}
              officeLng={settings.officeLng}
              radiusM={settings.attendanceRadiusM}
              lastPunchLabel={lastPunchLabel}
            />
            <RemoteCheckInTrigger hasCheckedIn={!!todayRow?.in} hasCheckedOut={!!todayRow?.out} />
          </div>

          {/* SECOND HALF — Today ring · this month's calendar */}
          <div className="flex flex-col gap-5">
            <TodayPanel inLabel={inLabel} outLabel={outLabel} inISO={inISO} outISO={outISO} fullDayHours={9} />
            <MonthCalendar cells={monthCells} monthLabel={monthLabel} compact />
          </div>
        </div>

        {rosterRows && (
          <section
            className="wg-rise mt-5 rounded-[22px] bg-surface-card p-6 max-md:p-4"
            style={{
              boxShadow:
                "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
              animationDelay: "160ms",
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span
                  className="inline-grid size-9 place-items-center rounded-xl"
                  style={{
                    background: "color-mix(in srgb, #E10600 10%, transparent)",
                    color: "#A80400",
                  }}
                >
                  <Users size={18} strokeWidth={2.3} />
                </span>
                <div>
                  <h2
                    className="text-ink-strong"
                    style={{
                      fontFamily: "var(--font-display), system-ui, sans-serif",
                      fontWeight: 900,
                      fontSize: 21,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.1,
                    }}
                  >
                    Team
                  </h2>
                  <p className="text-[13px] font-medium text-ink-subtle">{labelForDate(teamDate)}</p>
                </div>
              </div>
              <TeamDatePicker date={teamDate} />
            </div>
            <AttTeamRoster
              rows={rosterRows}
              date={teamDate}
              tz={tz}
              canQuickPunch={isSuperAdmin(me.email) && teamDate === today}
            />
          </section>
        )}
      </main>
      <DashboardFooter />
    </>
  );
}

function toRosterPunch(p: PunchDetail | null, tz: string): RosterPunch | null {
  if (!p) return null;
  return {
    label: formatTimeInTz(p.at, tz),
    verify: p.verifyMethod,
    distanceM: p.distanceM,
  };
}

/* ─────────────────────────── Recent activity ─────────────────────────── */

/** Small in/out time chip with verification badge, used on the timeline. */
function PunchChip({
  kind,
  punch,
  tz,
}: {
  kind: "in" | "out";
  punch: PunchDetail | null;
  tz: string;
}) {
  const Icon = kind === "in" ? LogIn : LogOut;
  const accent = kind === "in" ? "#16a34a" : "var(--color-altus-red)";
  if (!punch) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-semibold text-ink-subtle"
        style={{ background: "var(--color-surface-soft)" }}
      >
        <Icon size={12} strokeWidth={2.4} /> —
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums"
      style={{ background: `color-mix(in srgb, ${accent} 9%, transparent)`, color: accent }}
    >
      <Icon size={12} strokeWidth={2.6} />
      {formatTimeInTz(punch.at, tz)}
      <VerifyBadge verify={punch.verifyMethod} distanceM={punch.distanceM} />
    </span>
  );
}

function VerifyBadge({
  verify,
  distanceM,
  size = 12,
}: {
  verify: "biometric" | "gps_only" | "none";
  distanceM: number | null;
  size?: number;
}) {
  const dist = distanceM != null ? ` · ${Math.round(distanceM)}m from office` : "";
  if (verify === "biometric") {
    return (
      <span title={`Biometric-verified${dist}`} aria-label={`Biometric-verified${dist}`} className="inline-flex">
        <ShieldCheck size={size} strokeWidth={2.6} style={{ color: "var(--color-green-deep)" }} />
      </span>
    );
  }
  if (verify === "gps_only") {
    return (
      <span title={`Location-verified${dist}`} aria-label={`Location-verified${dist}`} className="inline-flex">
        <MapPin size={size} strokeWidth={2.6} style={{ color: "var(--color-blue-deep)" }} />
      </span>
    );
  }
  return null;
}

function MyTimeline({ days, tz, today }: { days: DayPunches[]; tz: string; today: string }) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-5 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: "120ms",
      }}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="inline-grid size-9 place-items-center rounded-xl"
          style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: "#A80400" }}
        >
          <Activity size={18} strokeWidth={2.3} />
        </span>
        <div>
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 21,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Recent activity
          </h2>
          <p className="text-[13px] font-medium text-ink-subtle">Last 14 days</p>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-ink-subtle">
          No punches yet — your log starts with today&apos;s first check-in.
        </p>
      ) : (
        <ol className="space-y-1">
          {days.map((d, i) => (
            <TimelineRow key={d.date} day={d} tz={tz} today={today} index={i} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineRow({
  day: d,
  tz,
  today,
  index,
}: {
  day: DayPunches;
  tz: string;
  today: string;
  index: number;
}) {
  const ms = workedMs(d);
  const { dow, dm } = splitDateLabel(d.date);
  const note = [d.in?.note, d.out?.note].filter(Boolean).join(" · ");
  const isToday = d.date === today;

  const status = d.in && d.out
    ? { label: "Full day", accent: "#16a34a", live: false }
    : d.in
      ? isToday
        ? { label: "On the clock", accent: "#16a34a", live: true }
        : { label: "No check-out", accent: "var(--color-altus-red)", live: false }
      : { label: "No check-in", accent: "var(--color-altus-red)", live: false };

  const stripe = d.in ? "#16a34a" : "var(--color-altus-red)";

  return (
    <li
      className="wg-rise relative flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl py-2.5 pl-5 pr-3.5 transition-colors hover:bg-surface-soft"
      style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
    >
      {/* status stripe */}
      <span
        aria-hidden
        className="absolute left-1 top-2 bottom-2 w-[3px] rounded-full"
        style={{ background: `linear-gradient(180deg, ${stripe}, color-mix(in srgb, ${stripe} 45%, transparent))` }}
      />

      {/* date rail */}
      <div className="w-[70px] shrink-0 leading-tight">
        <div className="text-[13.5px] font-black text-ink-strong">{isToday ? "Today" : dow}</div>
        <div className="text-[12px] font-semibold tabular-nums text-ink-subtle">{dm}</div>
      </div>

      {/* in → out */}
      <div className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
        <PunchChip kind="in" punch={d.in} tz={tz} />
        <MoveRight aria-hidden size={14} strokeWidth={2.2} className="shrink-0 text-ink-subtle max-sm:hidden" />
        <PunchChip kind="out" punch={d.out} tz={tz} />
        {note && (
          <span className="min-w-0 truncate text-[12.5px] text-ink-subtle max-w-[26ch]" title={note}>
            {note}
          </span>
        )}
      </div>

      {/* worked hours + status */}
      <div className="ml-auto flex shrink-0 items-center gap-2.5 max-sm:w-full max-sm:justify-between">
        <span
          className="tabular-nums text-[14px] font-black text-ink-strong"
          title={ms != null ? "Hours worked (check-out − check-in)" : undefined}
        >
          {ms != null ? fmtDur(ms) : "—"}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
          style={{
            background: `color-mix(in srgb, ${status.accent} 9%, transparent)`,
            color: status.accent,
          }}
        >
          {status.live && (
            <span aria-hidden className="relative inline-flex size-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:hidden"
                style={{ background: status.accent }}
              />
              <span className="relative inline-flex size-1.5 rounded-full" style={{ background: status.accent }} />
            </span>
          )}
          {status.label}
        </span>
      </div>
    </li>
  );
}
