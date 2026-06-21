"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Loader2, Wifi } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { punchAttendance } from "@/app/(app)/attendance/actions";

/**
 * Punch card — live clock + one-tap check-in/out. Presence is enforced entirely
 * by the office Wi-Fi IP gate (server-side, on the page + the punch action).
 * No location tracking, no biometric — a punch is just: on the office Wi-Fi → tap.
 */
export function PunchCard({
  todayLabel,
  inLabel,
  outLabel,
  tz,
}: {
  todayLabel: string;
  inLabel: string | null;
  outLabel: string | null;
  tz: string;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function punch(kind: "in" | "out") {
    startTransition(async () => {
      try {
        const res = await withNetworkRetry(() =>
          punchAttendance({ kind, note: note.trim() || undefined }),
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
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[13px] font-bold"
            style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
          >
            <Wifi size={13} strokeWidth={2.4} /> On office Wi-Fi
          </span>
        </div>
      </div>

      <div className="px-6 pb-6 max-md:px-4">
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
          <PunchButton kind="in" done={inLabel !== null} pending={pending} onClick={() => punch("in")} />
          <PunchButton kind="out" done={outLabel !== null} pending={pending} onClick={() => punch("out")} />
        </div>
      </div>
    </section>
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
  onClick,
}: {
  kind: "in" | "out";
  done: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const Icon = pending ? Loader2 : kind === "in" ? LogIn : LogOut;
  return (
    <button
      type="button"
      disabled={pending || done}
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
