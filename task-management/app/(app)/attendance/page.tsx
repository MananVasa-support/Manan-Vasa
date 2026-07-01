import { MapPin, ShieldCheck, CalendarCheck, CalendarDays, LogIn, LogOut } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { PunchCard } from "@/components/attendance/punch-card";
import { TeamDatePicker } from "@/components/attendance/team-date-picker";
import { TeamPunchButton } from "@/components/attendance/team-punch-button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  listMyAttendance,
  listTeamAttendanceForDate,
  type DayPunches,
  type PunchDetail,
  type TeamAttendanceRow,
} from "@/lib/queries/attendance";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { formatTimeInTz, localDateString } from "@/lib/format";

export const dynamic = "force-dynamic";

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
    listMyAttendance(me.id, since),
    me.isAdmin ? listTeamAttendanceForDate(teamDate) : Promise.resolve(null),
    getOrgSettings(),
  ]);

  const todayRow = myDays.find((d) => d.date === today);
  const presentDays = myDays.filter((d) => d.in).length;
  const lastOut = myDays.find((d) => d.out)?.out ?? null;
  const firstName = me.name.split(" ")[0] ?? me.name;

  // Location-only geofence: the punch buttons stay disabled until the browser
  // reports a GPS fix; when office coords are set the server rejects any fix
  // outside the radius. When no coords are configured the fence is off (punch
  // from anywhere) — the card still captures location but never blocks.
  const geofenceEnabled = settings.officeLat != null && settings.officeLng != null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[880px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
          >
            <CalendarCheck size={13} strokeWidth={2.6} /> Employees · Attendance
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px,3.6vw,46px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            Good to see you, {firstName}
          </h1>
          <p className="mt-1.5 text-[15.5px] font-medium text-ink-muted">
            Enable location and punch in from the office — one check-in and one check-out per day.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <HeroStat icon={<CalendarDays size={16} />} label="Present · 14 days" value={String(presentDays)} accent="#16a34a" />
            <HeroStat icon={<LogIn size={16} />} label="Today · check-in" value={todayRow?.in ? formatTimeInTz(todayRow.in.at, tz) : "—"} accent="var(--color-altus-red)" />
            <HeroStat icon={<LogOut size={16} />} label="Last check-out" value={lastOut ? formatTimeInTz(lastOut.at, tz) : "—"} accent="#334155" />
          </div>
        </header>

        <PunchCard
          todayLabel={labelForDate(today)}
          inLabel={todayRow?.in ? formatTimeInTz(todayRow.in.at, tz) : null}
          outLabel={todayRow?.out ? formatTimeInTz(todayRow.out.at, tz) : null}
          tz={tz}
          geofenceEnabled={geofenceEnabled}
          officeLat={settings.officeLat}
          officeLng={settings.officeLng}
          radiusM={settings.attendanceRadiusM}
        />

        <MyLog days={myDays} tz={tz} />

        {team && (
          <TeamSection
            team={team}
            date={teamDate}
            tz={tz}
            canQuickPunch={isSuperAdmin(me.email) && teamDate === today}
          />
        )}
      </main>
      <DashboardFooter />
    </>
  );
}

/**
 * Punch time + verification badge: green shield = biometric-verified,
 * blue pin = location captured without biometric. Hover shows the distance
 * from office when a geofence was active.
 */
function PunchTime({ punch, tz }: { punch: PunchDetail | null; tz: string }) {
  if (!punch) return <>—</>;
  const dist =
    punch.distanceM != null ? `${Math.round(punch.distanceM)}m from office` : null;
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-soft">
      {formatTimeInTz(punch.at, tz)}
      {punch.verifyMethod === "biometric" ? (
        <span
          title={`Biometric-verified${dist ? ` · ${dist}` : ""}`}
          aria-label={`Biometric-verified${dist ? ` · ${dist}` : ""}`}
          className="inline-flex"
        >
          <ShieldCheck
            size={14}
            strokeWidth={2.4}
            style={{ color: "var(--color-green-deep)" }}
          />
        </span>
      ) : punch.verifyMethod === "gps_only" ? (
        <span
          title={`Location-verified${dist ? ` · ${dist}` : ""}`}
          aria-label={`Location-verified${dist ? ` · ${dist}` : ""}`}
          className="inline-flex"
        >
          <MapPin
            size={14}
            strokeWidth={2.4}
            style={{ color: "var(--color-blue-deep)" }}
          />
        </span>
      ) : null}
    </span>
  );
}

function HeroStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-2xl bg-surface-card px-4 py-3"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
        <span style={{ color: accent }}>{icon}</span> {label}
      </div>
      <div className="mt-0.5 tabular-nums font-black text-ink-strong" style={{ fontSize: 22 }}>{value}</div>
    </div>
  );
}

function MyLog({ days, tz }: { days: DayPunches[]; tz: string }) {
  return (
    <section
      className="wg-rise mt-6 rounded-[22px] bg-surface-card p-6 max-md:p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)", animationDelay: "80ms" }}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="inline-grid size-9 place-items-center rounded-xl" style={{ background: "color-mix(in srgb, #16a34a 10%, transparent)", color: "#15803d" }}>
          <CalendarDays size={18} strokeWidth={2.3} />
        </span>
        <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 21, letterSpacing: "-0.02em" }}>
          My last 14 days
        </h2>
      </div>
      {days.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-ink-subtle">No punches yet — your log starts with today&apos;s first check-in.</p>
      ) : (
        <ul className="space-y-1.5">
          {days.map((d, i) => {
            const note = [d.in?.note, d.out?.note].filter(Boolean).join(" · ");
            return (
              <li
                key={d.date}
                className="wg-rise flex items-center gap-4 rounded-xl px-3.5 py-2.5 transition-colors hover:bg-surface-soft max-sm:flex-wrap"
                style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
              >
                <div className="w-[128px] shrink-0 text-[14px] font-bold text-ink-strong">{labelForDate(d.date)}</div>
                <div className="flex flex-1 items-center gap-2 flex-wrap">
                  <PunchChip kind="in" punch={d.in} tz={tz} />
                  <PunchChip kind="out" punch={d.out} tz={tz} />
                </div>
                {note && <div className="text-[12.5px] text-ink-subtle max-w-[30ch] truncate max-sm:w-full" title={note}>{note}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** A premium in/out chip with time + verification badge. */
function PunchChip({ kind, punch, tz }: { kind: "in" | "out"; punch: PunchDetail | null; tz: string }) {
  const Icon = kind === "in" ? LogIn : LogOut;
  const accent = kind === "in" ? "#16a34a" : "var(--color-altus-red)";
  if (!punch) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-semibold text-ink-subtle" style={{ background: "var(--color-surface-soft)" }}>
        <Icon size={12} strokeWidth={2.4} /> {kind === "in" ? "In" : "Out"} —
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
      {punch.verifyMethod === "biometric" ? (
        <ShieldCheck size={12} strokeWidth={2.6} style={{ color: "var(--color-green-deep)" }} />
      ) : punch.verifyMethod === "gps_only" ? (
        <MapPin size={12} strokeWidth={2.6} style={{ color: "var(--color-blue-deep)" }} />
      ) : null}
    </span>
  );
}

function TeamSection({
  team,
  date,
  tz,
  canQuickPunch,
}: {
  team: TeamAttendanceRow[];
  date: string;
  tz: string;
  /** Super-admin viewing today — show inline Check in / Check out controls. */
  canQuickPunch: boolean;
}) {
  const present = team.filter((r) => r.in).length;
  return (
    <section
      className="mt-6 rounded-section bg-surface-card p-6 max-md:p-4"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-display-2xs text-ink-strong">Team — {labelForDate(date)}</h2>
          <p className="text-[14px] text-ink-subtle mt-1">
            {present} of {team.length} checked in
          </p>
        </div>
        <TeamDatePicker date={date} />
      </div>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-wide text-ink-subtle">
            <th className="py-2 pr-3 font-semibold">Employee</th>
            <th className="py-2 pr-3 font-semibold">In</th>
            <th className="py-2 pr-3 font-semibold">Out</th>
            <th className="py-2 font-semibold max-md:hidden">Notes</th>
          </tr>
        </thead>
        <tbody>
          {team.map((r) => (
            <tr
              key={r.employeeId}
              className="border-t"
              style={{ borderColor: "var(--color-hairline)" }}
            >
              <td className="py-2.5 pr-3">
                <span className="inline-flex items-center gap-2.5 text-ink-strong">
                  <EmployeeAvatar name={r.name} size="sm" />
                  {r.name}
                </span>
              </td>
              <td className="py-2.5 pr-3 tabular-nums">
                {r.in ? (
                  <PunchTime punch={r.in} tz={tz} />
                ) : canQuickPunch ? (
                  <TeamPunchButton
                    employeeId={r.employeeId}
                    logDate={date}
                    kind="in"
                    name={r.name}
                    tz={tz}
                  />
                ) : (
                  <span
                    className="rounded-pill px-2 py-0.5 text-[12px] font-semibold"
                    style={{
                      background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
                      color: "var(--color-altus-red)",
                    }}
                  >
                    Absent
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3 tabular-nums text-ink-soft">
                {r.out ? (
                  <PunchTime punch={r.out} tz={tz} />
                ) : canQuickPunch && r.in ? (
                  <TeamPunchButton
                    employeeId={r.employeeId}
                    logDate={date}
                    kind="out"
                    name={r.name}
                    tz={tz}
                  />
                ) : (
                  <PunchTime punch={r.out} tz={tz} />
                )}
              </td>
              <td className="py-2.5 text-ink-subtle max-md:hidden">
                {[r.in?.note, r.out?.note].filter(Boolean).join(" · ") || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
