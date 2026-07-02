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
  Fingerprint,
  History,
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

/** Module identity: Employees = green. */
const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

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
 * by the office geofence (location): the punch disc stays disabled until the
 * browser reports a GPS fix, and the server rejects any fix outside the radius.
 * No Wi-Fi gate, no biometric — a punch is just: enable location → tap.
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
  lastPunchLabel,
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
  /** Most recent punch across the loaded window, pre-formatted server-side. */
  lastPunchLabel?: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [loc, setLoc] = React.useState<LocState>({ phase: "idle" });

  // On mount, read the permission state so we can show the right CTA upfront.
  // When already granted we auto-fetch a fix so the disc is ready to tap.
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

  // Presence state → the disc mode + the headline under it.
  const checkedIn = inLabel !== null;
  const checkedOut = outLabel !== null;
  const mode: DiscMode = checkedIn && checkedOut ? "done" : checkedIn ? "out" : "in";
  const status =
    mode === "done"
      ? { label: "Day complete", sub: `In ${inLabel} · Out ${outLabel}`, dot: "#94a3b8" }
      : mode === "out"
        ? { label: `Checked in · since ${inLabel}`, sub: "Tap the dial when you're heading out", dot: "var(--color-green)" }
        : { label: "Ready to check in", sub: "One tap when you reach the office", dot: GREEN };

  const discDisabled = pending || mode === "done" || !locationReady;

  return (
    <section
      className="wg-rise relative overflow-hidden rounded-[28px]"
      style={{
        background:
          "linear-gradient(168deg, #ffffff 0%, var(--color-surface-card) 42%, #f2faf5 78%, #ecf8f1 100%)",
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.9), 0 30px 70px -34px rgba(21,128,61,0.30), 0 8px 28px -20px rgba(15,23,42,0.18)",
      }}
    >
      {/* ambient washes — green module identity; a warm leaving-tint once on the clock */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -right-20 h-72 w-72 rounded-full"
        style={{
          background:
            mode === "out"
              ? "radial-gradient(circle, rgba(225,6,0,0.09), transparent 70%)"
              : "radial-gradient(circle, rgba(34,197,94,0.16), transparent 70%)",
          filter: "blur(10px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(22,163,74,0.10), transparent 70%)", filter: "blur(12px)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${GREEN} 40%, transparent), transparent)` }}
      />

      {/* ── Light hero: clock + punch disc ── */}
      <div className="relative px-7 pt-8 pb-7 max-md:px-5 text-center">
        <p
          className="uppercase text-ink-subtle"
          style={{
            fontFamily: "var(--font-mono-display), var(--font-display)",
            fontSize: 12,
            letterSpacing: "0.2em",
          }}
        >
          {todayLabel}
        </p>

        <LiveClock tz={tz} />

        <div className="mt-3 flex justify-center">
          <LocationPill loc={loc} distanceM={distanceM} withinFence={withinFence} radiusM={radiusM} />
        </div>

        <div className="mt-6 flex justify-center">
          <PunchDisc
            mode={mode}
            pending={pending}
            disabled={discDisabled}
            onClick={() => punch(mode === "out" ? "out" : "in")}
          />
        </div>

        <div className="mt-5 flex flex-col items-center gap-1.5">
          <span className="inline-flex items-center gap-2 text-[15.5px] font-bold text-ink-strong">
            <span aria-hidden className="relative inline-flex size-2.5">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping motion-reduce:hidden"
                style={{ background: status.dot }}
              />
              <span className="relative inline-flex size-2.5 rounded-full" style={{ background: status.dot }} />
            </span>
            {status.label}
          </span>
          <span className="text-[12.5px] font-medium text-ink-muted">{status.sub}</span>
          {lastPunchLabel && (
            <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] tabular-nums text-ink-subtle">
              <History size={12} strokeWidth={2.2} aria-hidden /> Last punch: {lastPunchLabel}
            </span>
          )}
        </div>
      </div>

      {/* ── Map · today's punches · note ── */}
      <div className="relative px-7 pb-7 max-md:px-5">
        <div
          aria-hidden
          className="mb-5 h-px w-full"
          style={{ background: "linear-gradient(90deg, transparent, var(--color-hairline-strong), transparent)" }}
        />

        {coords ? (
          <MapPanel coords={coords} distanceM={distanceM} withinFence={withinFence} radiusM={radiusM} />
        ) : (
          <LocationPanel loc={loc} geofenceEnabled={geofenceEnabled} onEnable={requestLocation} />
        )}

        <div className="grid grid-cols-2 gap-3 mb-5">
          <Stat label="Checked in" value={inLabel} kind="in" />
          <Stat label="Checked out" value={outLabel} kind="out" />
        </div>

        <label
          htmlFor="punch-note"
          className="block text-[13px] font-bold uppercase tracking-wide text-ink-subtle mb-1.5"
        >
          Note / reason <span className="font-medium normal-case text-ink-subtle">(optional)</span>
        </label>
        <input
          id="punch-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. client visit in the morning"
          className="w-full rounded-xl border-2 border-hairline-strong px-3.5 py-2.5 text-[15px] bg-white outline-none transition-colors focus:border-[#16a34a]"
        />

        {geofenceEnabled && !locationReady && (
          <p className="mt-4 text-center text-[13px] text-ink-subtle">
            Enable location above — the dial unlocks the moment we have a fix.
          </p>
        )}
        {!checkedIn && !checkedOut && (
          <p className="mt-4 text-center text-[13px] text-ink-subtle">
            Leaving without a morning check-in?{" "}
            <button
              type="button"
              onClick={() => punch("out")}
              disabled={pending || !locationReady}
              className="font-bold underline underline-offset-2 transition-colors disabled:opacity-50"
              style={{ color: "var(--color-altus-red)" }}
            >
              Check out instead
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

const DENIED_MSG =
  "Location is blocked for this site. Tap the lock/location icon in your browser's address bar, set Location to Allow, then tap Try again.";

/* ────────────────────────────── Live map ────────────────────────────── */

/**
 * Free, keyless OpenStreetMap embed of the user's current GPS fix.
 * Purely presentational — coords come from the same fix the punch uses.
 */
function MapPanel({
  coords,
  distanceM,
  withinFence,
  radiusM,
}: {
  coords: Coords;
  distanceM: number | null;
  withinFence: boolean | null;
  radiusM: number;
}) {
  const { lat, lng } = coords;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.004}%2C${lat - 0.0025}%2C${lng + 0.004}%2C${lat + 0.0025}&layer=mapnik&marker=${lat}%2C${lng}`;

  const pill =
    distanceM != null
      ? withinFence
        ? { text: `${Math.round(distanceM)}m from office`, color: GREEN_DEEP, bg: "rgba(236,253,245,0.92)", ring: "rgba(22,163,74,0.35)" }
        : { text: `${Math.round(distanceM)}m from office · outside ${radiusM}m`, color: "var(--color-altus-red)", bg: "rgba(255,255,255,0.92)", ring: "rgba(225,6,0,0.30)" }
      : { text: "Location captured", color: GREEN_DEEP, bg: "rgba(236,253,245,0.92)", ring: "rgba(22,163,74,0.35)" };

  return (
    <div
      className="mb-5 overflow-hidden rounded-2xl bg-surface-card"
      style={{
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${GREEN} 30%, var(--color-hairline)), 0 12px 32px -24px rgba(21,128,61,0.5)`,
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
          <MapPin size={13} strokeWidth={2.6} style={{ color: GREEN }} aria-hidden /> Your location
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold tabular-nums text-ink-subtle">
          <span aria-hidden className="relative inline-flex size-1.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:hidden"
              style={{ background: GREEN }}
            />
            <span className="relative inline-flex size-1.5 rounded-full" style={{ background: GREEN }} />
          </span>
          Live GPS · ±{Math.round(coords.accuracyM)}m
        </span>
      </div>
      <div className="relative">
        <iframe
          src={src}
          title="Map of your current location"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-[240px] w-full border-0 max-md:h-[220px]"
          style={{ filter: "saturate(0.92)" }}
        />
        {/* soft inner ring over the map edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${GREEN} 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.4)` }}
        />
        <span
          className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold tabular-nums backdrop-blur-sm"
          style={{ background: pill.bg, color: pill.color, boxShadow: `inset 0 0 0 1px ${pill.ring}, 0 4px 14px -6px rgba(15,23,42,0.35)` }}
        >
          <MapPin size={12} strokeWidth={2.6} aria-hidden /> {pill.text}
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────────── Punch disc ───────────────────────────── */

type DiscMode = "in" | "out" | "done";

const DISC_STYLE: Record<DiscMode, { bg: string; glow: string; halo: string; ring: string; label: string; sub: string }> = {
  // Check IN = green (module identity + "go").
  in: {
    bg: "linear-gradient(150deg, #2BC964 0%, #16A34A 45%, #15803D 100%)",
    glow: "0 26px 60px -18px rgba(22,163,74,0.55), inset 0 2px 0 rgba(255,255,255,0.30), inset 0 -10px 24px rgba(0,0,0,0.22)",
    halo: "0 0 44px 4px rgba(22,163,74,0.30)",
    ring: "rgba(22,163,74,0.35)",
    label: "Check in",
    sub: "Tap to punch",
  },
  // Check OUT = red (leaving).
  out: {
    bg: "linear-gradient(150deg, #FF2A22 0%, #E10600 45%, #A80400 100%)",
    glow: "0 26px 60px -18px rgba(225,6,0,0.5), inset 0 2px 0 rgba(255,255,255,0.28), inset 0 -10px 24px rgba(0,0,0,0.24)",
    halo: "0 0 44px 4px rgba(225,6,0,0.28)",
    ring: "rgba(225,6,0,0.30)",
    label: "Check out",
    sub: "Tap to punch",
  },
  done: {
    bg: "linear-gradient(150deg, #64748b 0%, #475569 50%, #334155 100%)",
    glow: "0 18px 44px -20px rgba(51,65,85,0.5), inset 0 2px 0 rgba(255,255,255,0.2), inset 0 -10px 24px rgba(0,0,0,0.22)",
    halo: "none",
    ring: "rgba(51,65,85,0.30)",
    label: "Day complete",
    sub: "See you tomorrow",
  },
};

/**
 * The big circular clock-in control. Purely presentational — the tap calls the
 * same punch("in"/"out") flow the old buttons used.
 */
function PunchDisc({
  mode,
  pending,
  disabled,
  onClick,
}: {
  mode: DiscMode;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const s = DISC_STYLE[mode];
  const Icon = pending ? Loader2 : mode === "done" ? CheckCircle2 : mode === "out" ? LogOut : Fingerprint;
  const active = !disabled && mode !== "done";

  return (
    <div className="relative flex size-[224px] items-center justify-center max-sm:size-[192px]">
      {/* concentric rings on the light surface */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${s.ring} 55%, transparent)` }}
      />
      <span
        aria-hidden
        className="absolute inset-[9px] rounded-full"
        style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${s.ring} 30%, transparent)` }}
      />
      {/* slow breathing halo while the dial is armed */}
      {active && (
        <span
          aria-hidden
          className="absolute inset-[12px] rounded-full animate-pulse motion-reduce:animate-none"
          style={{ boxShadow: s.halo }}
        />
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={mode === "done" ? "Day complete" : s.label}
        className={`relative size-[188px] max-sm:size-[156px] rounded-full ${active ? "wg-sheen" : ""} group flex flex-col items-center justify-center gap-1.5 overflow-hidden text-white outline-none transition-transform duration-200 focus-visible:ring-4 ${
          active ? "hover:scale-[1.03] active:scale-[0.98]" : "cursor-not-allowed"
        } motion-reduce:transition-none motion-reduce:hover:scale-100`}
        style={{
          background: s.bg,
          boxShadow: s.glow,
          opacity: disabled && mode !== "done" ? 0.45 : 1,
          ["--tw-ring-color" as string]: s.ring,
        }}
      >
        <Icon
          size={mode === "done" ? 38 : 42}
          strokeWidth={2.1}
          className={pending ? "animate-spin" : ""}
          aria-hidden
        />
        <span
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 19,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
          }}
        >
          {pending ? "Punching…" : s.label}
        </span>
        {!pending && (
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.8 }}>
            {s.sub}
          </span>
        )}
      </button>
    </div>
  );
}

/* ───────────────────────── Location UI (unchanged logic) ───────────────────────── */

/** Compact status pill in the clock face. */
function LocationPill({
  loc,
  distanceM,
  withinFence,
  radiusM,
}: {
  loc: LocState;
  distanceM: number | null;
  withinFence: boolean | null;
  radiusM: number;
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
            ? {
                background: "var(--color-green-bg)",
                color: "var(--color-green-deep)",
                boxShadow: "inset 0 0 0 1px rgba(22,163,74,0.22)",
              }
            : {
                background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
                color: "var(--color-altus-red)",
                boxShadow: "inset 0 0 0 1px rgba(225,6,0,0.2)",
              }
        }
      >
        <MapPin size={13} strokeWidth={2.4} /> {dist}
        {withinFence === false ? ` · outside ${radiusM}m` : ""}
      </span>
    );
  }
  if (loc.phase === "locating") {
    return (
      <span className={base} style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}>
        <Loader2 size={13} strokeWidth={2.4} className="animate-spin" /> Locating…
      </span>
    );
  }
  return (
    <span className={base} style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}>
      <MapPinOff size={13} strokeWidth={2.4} /> Location off
    </span>
  );
}

/** The Enable / Try-again / instructions block — shown until we have a GPS fix
 *  (once a fix arrives the live map takes this slot). */
function LocationPanel({
  loc,
  geofenceEnabled,
  onEnable,
}: {
  loc: LocState;
  geofenceEnabled: boolean;
  onEnable: () => void;
}) {
  // Location ready — the MapPanel replaces this block entirely.
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
      className="mb-5 rounded-2xl p-4"
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
              : { background: `color-mix(in srgb, ${GREEN} 10%, transparent)`, color: GREEN_DEEP }
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
                  ? "Attendance is verified by your location. Tap Enable location and allow access when your browser asks — your live map appears right here."
                  : "Sharing your location stamps the punch with where you checked in — and shows your live map here."}
          </p>
          <button
            type="button"
            onClick={onEnable}
            disabled={locating}
            className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
              boxShadow: "0 6px 16px -8px rgba(22, 163, 74, 0.55)",
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
        fontSize: "clamp(54px, 6.5vw, 78px)",
        fontWeight: 800,
        lineHeight: 1.05,
        letterSpacing: "-0.03em",
        color: "var(--color-ink-strong)",
        textShadow: "0 2px 24px rgba(22,163,74,0.16)",
      }}
      aria-label="Current time"
    >
      {text}
    </p>
  );
}

function Stat({ label, value, kind }: { label: string; value: string | null; kind: "in" | "out" }) {
  const has = value != null;
  const accent = kind === "in" ? GREEN : "var(--color-altus-red)";
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
