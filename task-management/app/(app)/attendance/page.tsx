import {
  MapPin,
  ShieldCheck,
  CalendarCheck,
  CalendarDays,
  LogIn,
  LogOut,
  Timer,
  Clock3,
  MoveRight,
  Activity,
  Users,
  ClipboardList,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { PunchCard } from "@/components/attendance/punch-card";
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

/** Monday of the week containing `dateStr` (YYYY-MM-DD, drift-free). */
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

/** Wall-clock minutes-of-day of `at` in tz — for the average check-in stat. */
function minutesInTz(at: Date, tz: string): number | null {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  const m = /^(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  return ((Number(m[1]) % 24) * 60) + Number(m[2]);
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

  const [myDays, team, settings] = await Promise.all([
    withRetry(() => listMyAttendance(me.id, since), { ...RETRY, label: "att-mydays" }),
    me.isAdmin
      ? withRetry(() => listTeamAttendanceForDate(teamDate), { ...RETRY, label: "att-team" })
      : Promise.resolve(null),
    withRetry(() => getOrgSettings(), { ...RETRY, label: "att-settings" }),
  ]);

  const todayRow = myDays.find((d) => d.date === today);
  const firstName = me.name.split(" ")[0] ?? me.name;

  // ── Derived stats (from the already-loaded 14 days — zero extra queries) ──
  const presentDays = myDays.filter((d) => d.in).length;

  const weekStart = mondayOf(today);
  const weekMs = myDays
    .filter((d) => d.date >= weekStart)
    .reduce((sum, d) => sum + (workedMs(d) ?? 0), 0);
  const WEEK_REF_MS = 40 * 3_600_000; // visual reference: standard 40h week

  const completeMs = myDays.map(workedMs).filter((v): v is number => v != null);
  const avgDayMs = completeMs.length
    ? completeMs.reduce((a, b) => a + b, 0) / completeMs.length
    : null;

  const inMinutes = myDays
    .map((d) => (d.in ? minutesInTz(d.in.at, tz) : null))
    .filter((v): v is number => v != null);
  const avgInMin = inMinutes.length
    ? inMinutes.reduce((a, b) => a + b, 0) / inMinutes.length
    : null;

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
              style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
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
              className="wg-btn shrink-0 inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 8px 20px -10px color-mix(in srgb, #15803d 70%, transparent)" }}
            >
              <ClipboardList size={15} strokeWidth={2.4} /> Att Report
            </a>
          )}
        </header>

        {/* ── Full-width working grid: punch hero left · stats + timeline right ── */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          {/* LEFT — punch hero (clock + dial + map + note) */}
          <div className="lg:col-span-7">
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

          {/* RIGHT — derived stats + the 14-day timeline */}
          <div className="flex flex-col gap-5 lg:col-span-5">
            <section className="grid grid-cols-2 gap-3.5">
              <StatCard
                icon={<Timer size={17} strokeWidth={2.4} />}
                accent="var(--color-altus-red)"
                label="This week"
                value={weekMs > 0 ? fmtDur(weekMs) : "—"}
                caption="hours worked"
                progress={weekMs > 0 ? Math.min(weekMs / WEEK_REF_MS, 1) : null}
                delay={0}
              />
              <StatCard
                icon={<CalendarDays size={17} strokeWidth={2.4} />}
                accent="#16a34a"
                label="Present"
                value={`${presentDays}`}
                caption="of last 14 days"
                progress={presentDays / 14}
                delay={60}
              />
              <StatCard
                icon={<LogIn size={17} strokeWidth={2.4} />}
                accent="#15803d"
                label="Avg check-in"
                value={avgInMin != null ? fmtMinutes(avgInMin) : "—"}
                caption={avgInMin != null ? `across ${inMinutes.length} day${inMinutes.length === 1 ? "" : "s"}` : "no check-ins yet"}
                delay={120}
              />
              <StatCard
                icon={<Clock3 size={17} strokeWidth={2.4} />}
                accent="#334155"
                label="Avg day"
                value={avgDayMs != null ? fmtDur(avgDayMs) : "—"}
                caption={avgDayMs != null ? `${completeMs.length} full day${completeMs.length === 1 ? "" : "s"}` : "no full days yet"}
                delay={180}
              />
            </section>

            <MyTimeline days={myDays} tz={tz} today={today} />
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
                    background: "color-mix(in srgb, #16a34a 10%, transparent)",
                    color: "#15803d",
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

/* ────────────────────────────── Stat cards ────────────────────────────── */

function StatCard({
  icon,
  accent,
  label,
  value,
  caption,
  progress,
  delay,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  /** 0–1 fill for the thin bar; omit/null to hide it. */
  progress?: number | null;
  delay: number;
}) {
  const pct = progress != null ? Math.round(Math.max(0, Math.min(progress, 1)) * 100) : null;
  return (
    <div
      className="wg-rise group relative overflow-hidden rounded-[18px] bg-surface-card p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.8), 0 14px 34px -24px rgba(15,23,42,0.4)",
        animationDelay: `${delay}ms`,
      }}
    >
      {/* accent aurora wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full opacity-60 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${accent} 22%, transparent), transparent 68%)` }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span
          className="inline-grid size-10 shrink-0 place-items-center rounded-[13px] text-white"
          style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 62%, black))`, boxShadow: `0 8px 18px -10px ${accent}` }}
        >
          {icon}
        </span>
        {pct != null && (
          <span className="tabular-nums rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
            {pct}%
          </span>
        )}
      </div>
      <div className="relative mt-3 text-[10.5px] font-black uppercase tracking-[0.14em] text-ink-subtle">{label}</div>
      <div
        className="relative mt-0.5 tabular-nums text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.03em", lineHeight: 1 }}
      >
        {value}
      </div>
      <div className="relative mt-1 text-[12px] font-semibold text-ink-subtle">{caption}</div>
      {progress != null && (
        <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }} role="presentation">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 65%, white), ${accent})` }}
          />
        </div>
      )}
    </div>
  );
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
          style={{ background: "color-mix(in srgb, #16a34a 10%, transparent)", color: "#15803d" }}
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
