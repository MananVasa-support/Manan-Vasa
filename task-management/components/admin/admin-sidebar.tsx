"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { LogOut, ShieldCheck, type LucideIcon } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ADMIN_TOP_LEVEL, ADMIN_GROUPS, isAdminNavActive } from "./admin-nav-config";

/**
 * Admin panel LEFT SIDEBAR — matches the vertical rail every other module uses
 * (logo + module identity · Back to Hub · grouped vertical nav pills · user
 * footer). Replaces the old frosted top header. Desktop only; `AdminMobileBar`
 * still owns the phone layout. Nav items come from `admin-nav-config` so the
 * sidebar and the (legacy) top nav can never drift apart.
 */
export function AdminSidebar({
  adminName,
  adminEmail,
  avatarUrl,
}: {
  adminName: string;
  adminEmail: string;
  avatarUrl: string | null;
  /** Kept on the contract so AdminShell still compiles unchanged; no longer
   *  read here since the "Back to Hub" pill was removed from this rail. */
  backHref?: string;
}) {
  const pathname = usePathname();

  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      /* server-side revoke below is what matters */
    }
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.replace("/login");
  }

  const initials = adminName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const Pill = ({ href, label, Icon, active }: { href: Route; label: string; Icon: LucideIcon; active: boolean }) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-bold transition-colors ${
        active ? "text-white" : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
      }`}
      style={active ? { background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 6px 16px -10px rgba(225,6,0,0.6)" } : undefined}
    >
      <Icon size={16} strokeWidth={2.3} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <aside
      className="sticky top-0 z-30 flex h-screen w-[248px] shrink-0 flex-col bg-surface-card max-md:hidden"
      style={{ borderRight: "1px solid var(--color-hairline)" }}
    >
      {/* ── Brand: logo + Admin identity ── */}
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        {/* `justify-center` on the full-width link centres the mark in the rail.
            The link stays a block-level flex row at the same place in the column,
            and the image keeps its own h-11 sizing, so nothing below shifts. */}
        <Link href={"/dashboard" as Route} className="flex w-full items-center justify-center" aria-label="Back to WMS home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Altus Corp" className="h-11 w-auto" style={{ display: "block" }} />
        </Link>
        <span className="inline-flex items-center gap-1.5 text-[16px] font-black" style={{ color: "var(--color-altus-red)", fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}>
          <ShieldCheck size={17} strokeWidth={2.6} /> Admin
        </span>
      </div>

      {/* The "Back to Hub" pill used to sit here; removed. The logo above still
          links out (to /dashboard), and the admin header keeps its own Hub link. */}

      <div className="mx-4 mb-1 border-t" style={{ borderColor: "var(--color-hairline)" }} />

      {/* ── Grouped vertical nav ── */}
      <nav aria-label="Admin" className="nav-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {ADMIN_TOP_LEVEL.map((it) => (
          <Pill key={it.href} href={it.href} label={it.label} Icon={it.Icon} active={isAdminNavActive(pathname, it)} />
        ))}
        {ADMIN_GROUPS.map((g) => (
          <div key={g.label} className="mt-2.5">
            <div className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-[0.09em] text-ink-subtle">
              <g.Icon size={12} strokeWidth={2.6} /> {g.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {g.items.map((it) => (
                <Pill key={it.href} href={it.href} label={it.label} Icon={it.Icon} active={isAdminNavActive(pathname, it)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer: identity + sign out ── */}
      <div className="mt-auto flex items-center gap-2.5 border-t px-3 py-3" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="inline-flex shrink-0 rounded-full" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-rose))", padding: 1.5 }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={adminName} className="block h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: "linear-gradient(135deg, #475569, #1f2937)" }}>
              {initials}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-bold text-ink-strong">{adminName}</span>
          <span className="block truncate text-[11px] text-ink-subtle">{adminEmail}</span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="inline-flex size-9 items-center justify-center rounded-full border border-hairline bg-white/70 text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
        >
          <LogOut size={16} strokeWidth={2.2} />
        </button>
      </div>
    </aside>
  );
}
