"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { EnablePushButton } from "@/components/pwa/enable-push-button";

const DISMISS_KEY = "vp_install_banner_dismissed";

/**
 * M4 Commit 3c — dismissible "Enable push notifications" banner shown
 * on /welcome (right after the celebration). Dismissal is persisted in
 * localStorage so a user who clicks the X never sees it again on that
 * device, even if they revisit /welcome via a back-button.
 */
export function InstallPushBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // localStorage blocked (Safari private mode etc.) — show anyway.
    }
    // Defer one tick so the welcome animation doesn't fight us.
    const t = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!visible) return null;

  return (
    <div
      className="mt-10 flex items-center justify-between gap-4 rounded-2xl px-5 py-4"
      style={{
        background: "rgba(255, 255, 255, 0.7)",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <div className="min-w-0 flex-1">
        <h3
          className="font-serif"
          style={{
            fontStyle: "italic",
            fontSize: 18,
            color: "#0F172A",
            lineHeight: 1.2,
          }}
        >
          Stay in the loop, even when the tab&apos;s closed
        </h3>
        <p
          className="mt-1 text-[13px] leading-[1.5]"
          style={{ color: "var(--color-ink-subtle)" }}
        >
          Enable browser notifications for task assignments, approvals, and
          comments. You can turn them off anytime in /profile.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <EnablePushButton />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-md p-1.5 text-[#94A3B8] hover:bg-[#F5F5F7] hover:text-[#0F172A]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
