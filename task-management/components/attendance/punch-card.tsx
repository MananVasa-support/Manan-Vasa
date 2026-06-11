"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Fingerprint,
  LogIn,
  LogOut,
  Loader2,
  MapPin,
  MapPinOff,
  ShieldCheck,
} from "lucide-react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import { fireToast } from "@/lib/toast";
import { distanceMeters } from "@/lib/geo";
import {
  punchAttendance,
  startBiometricSetup,
  finishBiometricSetup,
  startBiometricPunch,
} from "@/app/(app)/attendance/actions";

interface Office {
  lat: number;
  lng: number;
  radiusM: number;
}

interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
}

/**
 * Biometric punch kiosk — live clock, geofence status, fingerprint-gated
 * check-in/out. The server re-verifies everything (distance + WebAuthn
 * assertion); what's here is the honest preview of what the server will say.
 */
export function PunchCard({
  todayLabel,
  inLabel,
  outLabel,
  tz,
  office,
  hasCredential,
}: {
  todayLabel: string;
  inLabel: string | null;
  outLabel: string | null;
  tz: string;
  office: Office | null;
  hasCredential: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [settingUp, setSettingUp] = React.useState(false);
  const [bioSupported, setBioSupported] = React.useState<boolean | null>(null);
  const [fix, setFix] = React.useState<Fix | null>(null);
  const [fixError, setFixError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    if (!browserSupportsWebAuthn()) {
      setBioSupported(false);
    } else {
      platformAuthenticatorIsAvailable().then((ok) => alive && setBioSupported(ok));
    }
    return () => {
      alive = false;
    };
  }, []);

  // Warm location fix for the live geofence chip (punch always refetches).
  React.useEffect(() => {
    if (!office) return;
    getPosition()
      .then((f) => {
        setFix(f);
        setFixError(null);
      })
      .catch((e: Error) => setFixError(e.message));
  }, [office]);

  const liveDistance =
    office && fix
      ? distanceMeters(fix.lat, fix.lng, office.lat, office.lng)
      : null;
  const inRange = liveDistance != null && office != null && liveDistance <= office.radiusM;

  async function setUpBiometric() {
    setSettingUp(true);
    try {
      const start = await startBiometricSetup();
      if (!start.ok) throw new Error(start.error);
      const response = await startRegistration({ optionsJSON: start.options });
      const label = guessDeviceLabel();
      const finish = await finishBiometricSetup(response, label);
      if (!finish.ok) throw new Error(finish.error);
      fireToast({ message: "Biometric punch enabled on this device." });
      router.refresh();
    } catch (err) {
      const e = err as Error & { name?: string };
      fireToast({
        message:
          e.name === "NotAllowedError"
            ? "Setup cancelled."
            : e.message || "Could not set up biometric punch.",
        type: "error",
      });
    } finally {
      setSettingUp(false);
    }
  }

  function punch(kind: "in" | "out") {
    startTransition(async () => {
      try {
        // 1. Fresh GPS fix (required when an office geofence is set).
        let location: Fix | undefined;
        if (office) {
          location = await getPosition();
          setFix(location);
          setFixError(null);
          const d = distanceMeters(location.lat, location.lng, office.lat, office.lng);
          if (d > office.radiusM) {
            fireToast({
              message: `You're ${Math.round(d)}m from the office — punches register only within ${office.radiusM}m.`,
              type: "error",
            });
            return;
          }
        } else {
          location = await getPosition().catch(() => undefined);
        }

        // 2. Fingerprint / Face ID when this account has a registered device.
        let assertion;
        if (hasCredential) {
          const opts = await startBiometricPunch();
          if (!opts.ok) throw new Error(opts.error);
          if (opts.options) {
            assertion = await startAuthentication({ optionsJSON: opts.options });
          }
        }

        // 3. Server verifies both gates and writes the row.
        const res = await punchAttendance({
          kind,
          note: note.trim() || undefined,
          location,
          assertion,
        });
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
        const e = err as Error & { name?: string };
        fireToast({
          message:
            e.name === "NotAllowedError"
              ? "Biometric check cancelled."
              : e.message || "Punch failed.",
          type: "error",
        });
      }
    });
  }

  return (
    <section
      className="rounded-section bg-surface-card overflow-hidden"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
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
          style={{
            fontFamily: "var(--font-mono-display)",
            fontSize: 12.5,
            letterSpacing: "0.12em",
          }}
        >
          {todayLabel}
        </p>
        <LiveClock tz={tz} />

        {/* Status chips */}
        <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
          {office &&
            (fixError ? (
              <Chip tone="amber" icon={<MapPinOff size={13} strokeWidth={2.4} />}>
                {fixError}
              </Chip>
            ) : liveDistance == null ? (
              <Chip tone="slate" icon={<MapPin size={13} strokeWidth={2.4} />}>
                Locating…
              </Chip>
            ) : inRange ? (
              <Chip tone="green" icon={<MapPin size={13} strokeWidth={2.4} />}>
                {Math.round(liveDistance)}m from office · in range
              </Chip>
            ) : (
              <Chip tone="red" icon={<MapPinOff size={13} strokeWidth={2.4} />}>
                {Math.round(liveDistance)}m away · outside {office.radiusM}m
              </Chip>
            ))}
          {hasCredential ? (
            <Chip tone="green" icon={<ShieldCheck size={13} strokeWidth={2.4} />}>
              Biometric ready
            </Chip>
          ) : bioSupported ? (
            <button
              type="button"
              onClick={setUpBiometric}
              disabled={settingUp}
              className="inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[13px] font-bold text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--color-altus-red)" }}
            >
              {settingUp ? (
                <Loader2 size={13} strokeWidth={2.4} className="animate-spin" />
              ) : (
                <Fingerprint size={13} strokeWidth={2.4} />
              )}
              Enable biometric punch
            </button>
          ) : bioSupported === false ? (
            <Chip tone="slate" icon={<Fingerprint size={13} strokeWidth={2.4} />}>
              No fingerprint sensor on this device
            </Chip>
          ) : null}
        </div>
      </div>

      <div className="px-6 pb-6 max-md:px-4">
        {/* Today's punches */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat label="Checked in" value={inLabel} />
          <Stat label="Checked out" value={outLabel} />
        </div>

        <label
          htmlFor="punch-note"
          className="block text-[13.5px] font-semibold text-ink-soft mb-1.5"
        >
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
            biometric={hasCredential}
            onClick={() => punch("in")}
          />
          <PunchButton
            kind="out"
            done={outLabel !== null}
            pending={pending}
            biometric={hasCredential}
            onClick={() => punch("out")}
          />
        </div>
      </div>
    </section>
  );
}

function LiveClock({ tz }: { tz: string }) {
  // Render a stable placeholder on the server; tick only after mount so
  // there's no hydration mismatch.
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const text = now
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
    : "--:--:--";
  return (
    <p
      className="text-ink-strong tabular-nums mt-1"
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 52,
        fontWeight: 650,
        lineHeight: 1.1,
        letterSpacing: "-0.02em",
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
  biometric,
  onClick,
}: {
  kind: "in" | "out";
  done: boolean;
  pending: boolean;
  biometric: boolean;
  onClick: () => void;
}) {
  const Icon = pending ? Loader2 : biometric ? Fingerprint : kind === "in" ? LogIn : LogOut;
  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={onClick}
      className="inline-flex h-14 items-center justify-center gap-2.5 rounded-xl text-[16px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-40"
      style={{
        background:
          kind === "in"
            ? "linear-gradient(135deg, #16A34A, #15803D)"
            : "linear-gradient(135deg, #E10600, #A80400)",
      }}
    >
      <Icon size={20} strokeWidth={2.3} className={pending ? "animate-spin" : undefined} />
      {done
        ? kind === "in"
          ? "Checked in"
          : "Checked out"
        : kind === "in"
          ? "Check in"
          : "Check out"}
    </button>
  );
}

function Chip({
  tone,
  icon,
  children,
}: {
  tone: "green" | "red" | "amber" | "slate";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[13px] font-bold"
      style={{
        background: `var(--color-${tone}-bg)`,
        color: `var(--color-${tone}-deep)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-center"
      style={{ background: "var(--color-surface-soft)" }}
    >
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </div>
      <div
        className="mt-1 tabular-nums font-bold"
        style={{
          fontSize: 22,
          color: value ? "var(--color-ink-strong)" : "var(--color-ink-subtle)",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function getPosition(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Location not supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location access denied — allow it to punch."
              : "Couldn't get your location — try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Mac/.test(ua)) return "Mac";
  return "This device";
}
