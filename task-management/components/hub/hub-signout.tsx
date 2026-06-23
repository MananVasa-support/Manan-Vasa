"use client";

import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { LogOut } from "lucide-react";

/**
 * Tiny sign-out affordance for the Hub front door. The Hub itself is a Server
 * Component and renders no app nav; this is the single interactive control on
 * the page. Same revoke path as the header user-menu: best-effort Firebase
 * sign-out, then the authoritative server-side session revoke, then to /login.
 *
 * Styled as a small neobrutalist "chip" — ink border + hard offset shadow that
 * presses on hover/focus, matching the cards. Keyboard-reachable with a visible
 * focus ring; the press state shows on :focus-visible too.
 */
export function HubSignOut() {
  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // Continue regardless — the server-side revoke below is what matters.
    }
    await fetch("/api/auth/signout", { method: "POST" });
    // HARD nav so the next user on this browser can't be served cached pages.
    window.location.replace("/login");
  }

  return (
    <button type="button" onClick={handleSignOut} className="hub-chip">
      <LogOut size={15} strokeWidth={2.6} aria-hidden />
      Sign out
    </button>
  );
}
