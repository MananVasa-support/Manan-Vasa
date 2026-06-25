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

  return (
    <section
      className="rounded-section bg-surface-card overflow-hidden"
      style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      {/* Clock face */}
      <div
        className="px-6 pt-6 pb-5 max-md:px-4 text-center"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--color-altus-red) 4%, var(--color-surface-card)) 0%, var(--color-surface-card) 100%)",
        }}
      >
        <p
          className="uppercase text-ink-subtle"
          style={{ fontFamily: "var(--font-mono-display)", fontSize: 12.5, letterSpacing: "0.12em" }}
        >
          {todayLabel}
        </p>
        <LiveClock tz={tz} />
        <div className="mt-3 flex items-center justify-center">
          <LocationPill loc={loc} distanceM={distanceM} withinFence={withinFence} radiusM={radiusM} />
        </div>
      </div>

      <div className="px-6 pb-6 max-md:px-4">
        {/* Location enablement / recovery */}
        <LocationPanel
          loc={loc}
          geofenceEnabled={geofenceEnabled}
          onEnable={requestLocation}
        />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat label="Checked in" value={inLabel} />
          <Stat label="Checked out" value={outLabel} />
        </div>

        <label htmlFor="punch-note" className="block text-[13.5px] font-semibold text-ink-soft mb-1.5">
          Note / reason <span className="font-normal text-ink-subtle">(optional)</span>
        </label>
        <input
          id="punch-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. client visit in the morning"
          className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white mb-4"
        />

        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <PunchButton
            kind="in"
            done={inLabel !== null}
            pending={pending}
            disabled={!locationReady}
            onClick={() => punch("in")}
          />
          <PunchButton
            kind="out"
            done={outLabel !== null}
            pending={pending}
            disabled={!locationReady}
            onClick={() => punch("out")}
          />
        </div>
        {geofenceEnabled && !locationReady && (
          <p className="mt-3 text-center text-[13px] text-ink-subtle">
            Enable location above to check in or out.
          </p>
        )}
      </div>
    </section>
  );
}

const DENIED_MSG =
  "Location is blocked for this site. Tap the lock/location icon in your browser's address bar, set Location to Allow, then tap Try again.";

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
  if (loc.phase === "granted") {
    const ok = withinFence !== false;
    const dist = distanceM != null ? `${Math.round(distanceM)}m from office` : "Location ready";
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[13px] font-bold"
        style={
          ok
            ? { background: "var(--color-green-bg)", color: "var(--color-green-deep)" }
            : {
                background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)",
                color: "var(--color-altus-red)",
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
      <span
        className="inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[13px] font-bold"
        style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}
      >
        <Loader2 size={13} strokeWidth={2.4} className="animate-spin" /> Locating…
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[13px] font-bold"
      style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
    >
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
      className="text-ink-strong tabular-nums mt-1"
      style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 650, lineHeight: 1.1, letterSpacing: "-0.02em" }}
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
  const Icon = pending ? Loader2 : kind === "in" ? LogIn : LogOut;
  return (
    <button
      type="button"
      disabled={pending || done || disabled}
      onClick={onClick}
      className="inline-flex h-14 items-center justify-center gap-2.5 rounded-xl text-[16px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-40"
      style={{
        background: kind === "in" ? "linear-gradient(135deg, #16A34A, #15803D)" : "linear-gradient(135deg, #E10600, #A80400)",
      }}
    >
      <Icon size={20} strokeWidth={2.3} className={pending ? "animate-spin" : undefined} />
      {done ? (kind === "in" ? "Checked in" : "Checked out") : kind === "in" ? "Check in" : "Check out"}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl px-4 py-3 text-center" style={{ background: "var(--color-surface-soft)" }}>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="mt-1 tabular-nums font-bold" style={{ fontSize: 22, color: value ? "var(--color-ink-strong)" : "var(--color-ink-subtle)" }}>
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
