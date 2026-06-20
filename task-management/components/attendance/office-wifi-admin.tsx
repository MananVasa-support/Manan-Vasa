"use client";

import * as React from "react";
import { Wifi, Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { captureOfficeWifiAction, removeOfficeWifiAction } from "@/app/(app)/attendance/actions";
import { fireToast } from "@/lib/toast";
import { useRouter } from "next/navigation";

/**
 * Admin-only "Office Wi-Fi" setup, shown on the attendance page. The admin taps
 * "Add this Wi-Fi" while physically on the office network → its public IP is
 * saved, and from then on attendance can only be marked from that network.
 * `currentIp` is the IP the server saw for THIS page load; `onList` = whether
 * it's already trusted.
 */
export function OfficeWifiAdmin({
  allowlist,
  currentIp,
}: {
  allowlist: string[];
  currentIp: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const active = allowlist.length > 0;
  const currentTrusted = currentIp != null && allowlist.includes(currentIp);

  function capture() {
    setBusy(true);
    captureOfficeWifiAction()
      .then((r) => {
        if (!r.ok) fireToast({ message: r.error, type: "error" });
        else fireToast({ message: `Saved ${r.ip} as office Wi-Fi.`, type: "success" });
        router.refresh();
      })
      .finally(() => setBusy(false));
  }
  function remove(ip: string) {
    setBusy(true);
    removeOfficeWifiAction(ip)
      .then((r) => {
        if (!r.ok) fireToast({ message: r.error, type: "error" });
        router.refresh();
      })
      .finally(() => setBusy(false));
  }

  return (
    <section
      className="mt-6 rounded-section bg-surface-card p-6 max-md:p-4"
      style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <Wifi size={18} className="text-ink-soft" />
        <h2 className="text-display-2xs text-ink-strong">Office Wi-Fi gate (admin)</h2>
        <span
          className="ml-auto rounded-pill px-2.5 py-0.5 text-[12px] font-bold"
          style={
            active
              ? { background: "color-mix(in srgb, var(--color-green-deep) 12%, transparent)", color: "var(--color-green-deep)" }
              : { background: "color-mix(in srgb, var(--color-amber-deep,#B45309) 14%, transparent)", color: "var(--color-amber-deep,#B45309)" }
          }
        >
          {active ? "ACTIVE" : "OFF — anyone can punch"}
        </span>
      </div>
      <p className="text-[14px] text-ink-soft mb-4 max-w-[60ch]">
        When active, staff can only mark attendance from these office networks — mock GPS
        can&apos;t beat it. Stand on the office Wi-Fi and tap <strong>Add this Wi-Fi</strong>.
        Your current network IP: <span className="font-mono text-ink-strong">{currentIp ?? "unknown"}</span>
        {currentTrusted && <span className="text-[var(--color-green-deep)] font-semibold"> · trusted ✓</span>}
      </p>

      {allowlist.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1.5">
          {allowlist.map((ip) => (
            <li
              key={ip}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-[14px]"
              style={{ background: "var(--color-surface-soft, rgba(15,23,42,0.03))" }}
            >
              <ShieldCheck size={15} style={{ color: "var(--color-green-deep)" }} />
              <span className="font-mono text-ink-strong">{ip}</span>
              <button
                type="button"
                onClick={() => remove(ip)}
                disabled={busy}
                aria-label={`Remove ${ip}`}
                className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-ink-subtle hover:text-altus-red disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={14} /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={capture}
        disabled={busy || currentTrusted}
        className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-50 cursor-pointer"
        style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.6} />}
        {currentTrusted ? "This Wi-Fi is already trusted" : "Add this Wi-Fi as office"}
      </button>
    </section>
  );
}
