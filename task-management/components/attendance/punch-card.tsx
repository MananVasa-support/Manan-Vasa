"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LogIn,
  LogOut,
  Loader2,
  MapPin,
  MapPinOff,
  LocateFixed,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { punchAttendance } from "@/app/(app)/attendance/actions";

type Coords = { lat: number; lng: number; accuracyM: number };

type LocState =
  | { phase: "idle" }
  | { phase: "locating" }
  | { phase: "granted"; coords: Coords }
  | { phase: "denied"; message: string }
  | { phase: "error"; message: string };

/** Haversine metres — mirrors lib/geo so the card can show live distance feedback. */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Punch card — live clock + one-tap check-in/out. Presence is enforced entirely
 * by the office geofence (location): the buttons stay disabled until the browser
 * reports a GPS fix, and the server rejects any fix outside the radius. No Wi-Fi
 * gate, no biometric — a punch is just: enable location → tap.
 */
export function PunchCard({
  todayLabel,
  inLabel,
  outLabel,
  tz,
  geofenceEnabled,
  officeLat,
  officeLng,
  radiusM,
}: {
  todayLabel: string;
  inLabel: string | null;
  outLabel: string | null;
  tz: string;
  /** True when the admin has set office coordinates (location is required). */
  geofenceEnabled: boolean;
  officeLat: number | null;
  officeLng: number | null;
  radiusM: number;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [loc, setLoc] = React.useState<LocState>({ phase: "idle" });

  // On mount, read the permission state so we can show the right CTA upfront.
  // When already granted we auto-fetch a fix so the buttons are ready to tap.
  React.useEffect(() => {
    let cancelled = false;
    if (!("geolocation" in navigator)) {
      setLoc({ phase: "error", message: "This browser has no location support." });
      return;
    }
    if (!("permissions" in navigator) || !navigator.permissions?.query) {
      return; // No Permissions API (older Safari) — leave on "idle", user taps Enable.
    }
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        if (status.state === "granted") {
          requestLocation();
        } else if (status.state === "denied") {
          setLoc({ phase: "denied", message: DENIED_MSG });
        }
        // "prompt" → stay idle; the Enable button triggers the prompt.
        status.onchange = () => {
          if (status.state === "granted") requestLocation();
          else if (status.state === "denied") setLoc({ phase: "denied", message: DENIED_MSG });
        };
      })
      .catch(() => {
        /* ignore — fall back to the Enable button */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ask the browser for a high-accuracy fix. Re-prompts in browsers that allow
   *  it even after a prior denial, so the user is never stuck. */
  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLoc({ phase: "error", message: "This browser has no location support." });
      return;
    }
    setLoc({ phase: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({
          phase: "granted",
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
          },
        });
      },
      (geErr) => {
        if (geErr.code === geErr.PERMISSION_DENIED) {
          setLoc({ phase: "denied", message: DENIED_MSG });
        } else if (geErr.code === geErr.POSITION_UNAVAILABLE) {
          setLoc({
            phase: "error",
            message: "Couldn't get a location fix. Move near a window or step outside and try again.",
          });
        } else if (geErr.code === geErr.TIMEOUT) {
          setLoc({ phase: "error", message: "Location timed out. Try again." });
        } else {
          setLoc({ phase: "error", message: "Couldn't read your location. Try again." });
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const coords = loc.phase === "granted" ? loc.coords : null;
  // When a fence is configured we require a fix; otherwise punching is allowed
  // even without one (server records location but never blocks).
  const locationReady = geofenceEnabled ? coords != null : true;

  // Live distance feedback when we have both a fix and office coords.
  const distanceM =
    coords && officeLat != null && officeLng != null
      ? distanceMeters(coords.lat, coords.lng, officeLat, officeLng)
      : null;
  const withinFence = distanceM != null ? distanceM <= radiusM : null;

  function punch(kind: "in" | "out") {
    startTransition(async () => {
      try {
        const res = await withNetworkRetry(() =>
          punchAttendance({
            kind,
            note: note.trim() || undefined,
            location: coords ?? undefined,
          }),
        );
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        fireToast({
          message:
            kind === "in" ? "Checked in — have a great day!" : "Checked out. See you tomorrow!",
        });
        setNote("");
        router.refresh();
      } catch (err) {
        fireToast({ message: mapPunchError(err), type: "error" });
      }
    });
  }

  // Presence state → the headline shown under the clock.
  const checkedIn = inLabel !== null;
  const checkedOut = outLabel !== null;
  const status = checkedOut
    ? { label: "Day complete", sub: `In ${inLabel} · Out ${outLabel}`, tone: "#64748b", dot: "#94a3b8" }
    : checkedIn
      ? { label: "You're checked in", sub: `Since ${inLabel} — have a great day`, tone: "#16a34a", dot: "#22c55e" }
      : { label: "Ready to check in", sub: "One tap when you reach the office", tone: "var(--color-altus-red)", dot: "var(--color-altus-red)" };

  return (
    <section
      className="wg-rise relative overflow-hidden rounded-[26px]"
      style={{
        background: "linear-gradient(160deg, #14100E 0%, #1C1512 46%, #0E0B0A 100%)",
        boxShadow: "0 30px 70px -30px rgba(20,16,14,0.75), 0 2px 6px rgba(0,0,0,0.25)",
      }}
    >
      {/* ambient brand-red glow */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(225,6,0,0.30), transparent 70%)", filter: "blur(8px)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }} />

      {/* ── Clock face (dark hero) ── */}
      <div className="relative px-7 pt-8 pb-6 max-md:px-5 text-center">
        <p className="uppercase" style={{ color: "rgba(247,244,237,0.55)", fontFamily: "var(--font-mono-display), var(--font-display)", fontSize: 12, letterSpacing: "0.2em" }}>
          {todayLabel}
        </p>
        <LiveClock tz={tz} />
        <div className="mt-3.5 flex flex-col items-center gap-2.5">
          <span className="inline-flex items-center gap-2 text-[15.5px] font-bold" style={{ color: "#F7F4ED" }}>
            <span aria-hidden className="relative inline-flex size-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping" style={{ background: status.dot }} />
              <span className="relative inline-flex size-2.5 rounded-full" style={{ background: status.dot }} />
            </span>
            {status.label}
          </span>
          <span className="text-[12.5px]" style={{ color: "rgba(247,244,237,0.62)" }}>{status.sub}</span>
          <div className="mt-1"><LocationPill loc={loc} distanceM={distanceM} withinFence={withinFence} radiusM={radiusM} dark /></div>
        </div>
      </div>

      {/* ── Body (light sheet) ── */}
      <div className="relative rounded-t-[26px] px-7 pt-6 pb-7 max-md:px-5" style={{ background: "var(--color-surface-card)", boxShadow: "0 -1px 0 rgba(0,0,0,0.04)" }}>
        <LocationPanel loc={loc} geofenceEnabled={geofenceEnabled} onEnable={requestLocation} />

        <div className="grid grid-cols-2 gap-3 mb-5">
          <Stat label="Checked in" value={inLabel} kind="in" />
          <Stat label="Checked out" value={outLabel} kind="out" />
        </div>

        <label htmlFor="punch-note" className="block text-[13px] font-bold uppercase tracking-wide text-ink-subtle mb-1.5">
          Note / reason <span className="font-medium normal-case text-ink-subtle">(optional)</span>
        </label>
        <input
          id="punch-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. client visit in the morning"
          className="w-full rounded-xl border-2 border-hairline-strong px-3.5 py-2.5 text-[15px] bg-white mb-5 outline-none transition-colors focus:border-[var(--color-altus-red)]"
        />

        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <PunchButton kind="in" done={checkedIn} pending={pending} disabled={!locationReady} onClick={() => punch("in")} />
          <PunchButton kind="out" done={checkedOut} pending={pending} disabled={!locationReady} onClick={() => punch("out")} />
        </div>
        {geofenceEnabled && !locationReady && (
          <p className="mt-3 text-center text-[13px] text-ink-subtle">Enable location above to check in or out.</p>
        )}
      </div>
    </section>
  );
}

const DENIED_MSG =
  "Location is blocked for this site. Tap the lock/location icon in your browser's address bar, set Location to Allow, then tap Try again.";

/** Compact status pill in the clock face. `dark` = sitting on the dark hero. */
function LocationPill({
  loc,
  distanceM,
  withinFence,
  radiusM,
  dark,
}: {
  loc: LocState;
  distanceM: number | null;
  withinFence: boolean | null;
  radiusM: number;
  dark?: boolean;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[12.5px] font-bold backdrop-blur";
  if (loc.phase === "granted") {
    const ok = withinFence !== false;
    const dist = distanceM != null ? `${Math.round(distanceM)}m from office` : "Location ready";
    return (
      <span
        className={base}
        style={
          ok
            ? dark
              ? { background: "rgba(34,197,94,0.16)", color: "#86efac", boxShadow: "inset 0 0 0 1px rgba(134,239,172,0.28)" }
              : { background: "var(--color-green-bg)", color: "var(--color-green-deep)" }
            : dark
              ? { background: "rgba(225,6,0,0.20)", color: "#fca5a5", boxShadow: "inset 0 0 0 1px rgba(252,165,165,0.3)" }
              : { background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: "var(--color-altus-red)" }
        }
      >
        <MapPin size={13} strokeWidth={2.4} /> {dist}
        {withinFence === false ? ` · outside ${radiusM}m` : ""}
      </span>
    );
  }
  if (loc.phase === "locating") {
    return (
      <span className={base} style={dark ? { background: "rgba(255,255,255,0.1)", color: "rgba(247,244,237,0.8)" } : { background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}>
        <Loader2 size={13} strokeWidth={2.4} className="animate-spin" /> Locating…
      </span>
    );
  }
  return (
    <span className={base} style={dark ? { background: "rgba(255,255,255,0.08)", color: "rgba(247,244,237,0.6)" } : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}>
      <MapPinOff size={13} strokeWidth={2.4} /> Location off
    </span>
  );
}

/** The Enable / Try-again / instructions block above the buttons. */
function LocationPanel({
  loc,
  geofenceEnabled,
  onEnable,
}: {
  loc: LocState;
  geofenceEnabled: boolean;
  onEnable: () => void;
}) {
  // Location ready — show a calm confirmation only when a fence is active.
  if (loc.phase === "granted") {
    if (!geofenceEnabled) return null;
    return (
      <div
        className="mb-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold"
        style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
      >
        <CheckCircle2 size={16} strokeWidth={2.3} />
        Location enabled — you&apos;re ready to punch.
      </div>
    );
  }

  const isDenied = loc.phase === "denied";
  const isError = loc.phase === "error";
  const locating = loc.phase === "locating";

  return (
    <div
      className="mb-4 rounded-xl p-4"
      style={{
        background: isDenied || isError
          ? "color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card))"
          : "var(--color-surface-soft)",
        border: "1px solid var(--color-hairline)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
          style={
            isDenied || isError
              ? {
                  background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                  color: "var(--color-altus-red)",
                }
              : { background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red)" }
          }
        >
          {isDenied || isError ? (
            <AlertTriangle size={18} strokeWidth={2.2} />
          ) : (
            <LocateFixed size={18} strokeWidth={2.2} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-ink-strong">
            {isDenied
              ? "Location is blocked"
              : isError
                ? "Couldn't get your location"
                : geofenceEnabled
                  ? "Enable location to punch"
                  : "Enable location (optional)"}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft" style={{ lineHeight: 1.5 }}>
            {isDenied
              ? loc.message
              : isError
                ? loc.message
                : geofenceEnabled
                  ? "Attendance is verified by your location. Tap Enable location and allow access when your browser asks."
                  : "Sharing your location stamps the punch with where you checked in."}
          </p>
          <button
            type="button"
            onClick={onEnable}
            disabled={locating}
            className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 6px 16px -8px rgba(225, 6, 0, 0.55)",
            }}
          >
            {locating ? (
              <>
                <Loader2 size={16} strokeWidth={2.4} className="animate-spin" /> Locating…
              </>
            ) : isDenied || isError ? (
              <>
                <LocateFixed size={16} strokeWidth={2.4} /> Try again
              </>
            ) : (
              <>
                <LocateFixed size={16} strokeWidth={2.4} /> Enable location
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveClock({ tz }: { tz: string }) {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const text = now
    ? new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now)
    : "--:--:--";
  return (
    <p
      className="tabular-nums mt-1.5"
      style={{
        fontFamily: "var(--font-display), system-ui, sans-serif",
        fontSize: 62,
        fontWeight: 800,
        lineHeight: 1.05,
        letterSpacing: "-0.03em",
        color: "#FBFAF7",
        textShadow: "0 2px 24px rgba(225,6,0,0.25)",
      }}
      aria-label="Current time"
    >
      {text}
    </p>
  );
}

function PunchButton({
  kind,
  done,
  pending,
  disabled,
  onClick,
}: {
  kind: "in" | "out";
  done: boolean;
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = pending ? Loader2 : done ? CheckCircle2 : kind === "in" ? LogIn : LogOut;
  const isDisabled = pending || done || disabled;
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={`wg-btn ${isDisabled ? "" : "wg-sheen"} group relative inline-flex h-[60px] items-center justify-center gap-2.5 overflow-hidden rounded-2xl text-[16.5px] font-black text-white disabled:cursor-not-allowed`}
      style={{
        background: done
          ? "linear-gradient(135deg, #334155, #1e293b)"
          : kind === "in"
            ? "linear-gradient(135deg, #16A34A, #15803D)"
            : "linear-gradient(135deg, #E10600, #A80400)",
        boxShadow: done
          ? "none"
          : kind === "in"
            ? "0 14px 30px -12px rgba(22,163,74,0.6)"
            : "0 14px 30px -12px rgba(225,6,0,0.6)",
        opacity: isDisabled && !done ? 0.4 : 1,
      }}
    >
      <Icon size={21} strokeWidth={2.5} className={pending ? "animate-spin" : "transition-transform group-enabled:group-hover:scale-110"} />
      {done ? (kind === "in" ? "Checked in" : "Checked out") : kind === "in" ? "Check in" : "Check out"}
    </button>
  );
}

function Stat({ label, value, kind }: { label: string; value: string | null; kind: "in" | "out" }) {
  const has = value != null;
  const accent = kind === "in" ? "#16a34a" : "var(--color-altus-red)";
  const Icon = kind === "in" ? LogIn : LogOut;
  return (
    <div
      className="rounded-2xl px-4 py-3.5 text-center transition-colors"
      style={{
        background: has ? `color-mix(in srgb, ${accent} 7%, var(--color-surface-card))` : "var(--color-surface-soft)",
        boxShadow: has ? `inset 0 0 0 1px color-mix(in srgb, ${accent} 22%, transparent)` : "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      <div className="flex items-center justify-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide" style={{ color: has ? accent : "var(--color-ink-subtle)" }}>
        <Icon size={12} strokeWidth={2.6} /> {label}
      </div>
      <div className="mt-1 tabular-nums font-black" style={{ fontSize: 24, color: has ? "var(--color-ink-strong)" : "var(--color-ink-subtle)" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function isNetworkError(err: unknown): boolean {
  const e = err as Error | undefined;
  return e instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(e?.message ?? "");
}

async function withNetworkRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isNetworkError(err)) {
      await new Promise((r) => setTimeout(r, 800));
      return fn();
    }
    throw err;
  }
}

function mapPunchError(err: unknown): string {
  const e = err as Error | undefined;
  if (isNetworkError(err)) return "Couldn't reach the server. Check your connection, reload, and try again.";
  return e?.message || "Punch failed. Please try again.";
}
