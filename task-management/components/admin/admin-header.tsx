"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { ArrowLeft, LogOut } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { AdminTopNav } from "./admin-top-nav";

interface Props {
  adminName: string;
  adminEmail: string;
  avatarUrl: string | null;
}

/**
 * Light, frosted top header for the admin panel — the dark left sidebar
 * recast as a header bar, matching the main app header (`header-light` scope
 * flips the nav pills to ink-on-light, brand-red accents). Desktop only;
 * `AdminMobileBar` still owns the phone layout.
 */
export function AdminHeader({ adminName, adminEmail, avatarUrl }: Props) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // Continue — the server-side revoke below is what matters.
    }
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/login" as Route);
  }

  const initials = adminName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 header-light max-md:hidden">
      <div
        className="relative"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <div className="relative w-full h-[84px] px-6 2xl:px-8 flex items-center gap-4 2xl:gap-6">
          {/* LEFT: logo + Admin badge → links to the admin overview. */}
          <Link
            href={"/admin" as Route}
            className="flex items-center gap-2.5 shrink-0"
            aria-label="Admin overview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Altus Corp"
              className="h-12 w-auto"
              style={{ display: "block" }}
            />
            <span
              className="inline-flex items-center text-[10px] font-bold uppercase text-white px-2 py-0.5 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 2px 8px rgba(225, 6, 0, 0.35)",
                letterSpacing: "0.08em",
              }}
            >
              Admin
            </span>
          </Link>

          {/* CENTER: grouped category nav. Scrolls from the left if it ever
              gets tight, so nothing is clipped (mirrors the main header). */}
          <div className="flex-1 min-w-0 overflow-x-auto nav-scroll">
            <div className="flex w-max mx-auto">
              <AdminTopNav />
            </div>
          </div>

          {/* RIGHT: back-to-app · identity · sign out. */}
          <div className="flex items-center gap-2.5 2xl:gap-3 shrink-0">
            <Link
              href={"/" as Route}
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-semibold border border-hairline bg-white/70 text-ink-strong hover:border-altus-red transition-colors"
            >
              <ArrowLeft size={15} strokeWidth={2.4} />
              <span className="max-2xl:hidden">Back to app</span>
            </Link>

            <span
              className="inline-flex items-center gap-2.5 rounded-full pl-1 pr-3 py-1 border border-hairline bg-white/70 max-lg:hidden"
            >
              <span
                className="inline-flex rounded-full shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-altus-red), var(--color-rose))",
                  padding: 1.5,
                }}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={adminName}
                    className="h-8 w-8 rounded-full object-cover block"
                  />
                ) : (
                  <span
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #475569, #1f2937)" }}
                  >
                    {initials}
                  </span>
                )}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[13px] font-semibold text-ink-strong truncate max-w-[160px]">
                  {adminName}
                </span>
                <span className="block text-[11.5px] text-ink-subtle truncate max-w-[160px]">
                  {adminEmail}
                </span>
              </span>
            </span>

            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-hairline bg-white/70 text-ink-soft hover:text-altus-red hover:border-altus-red transition-colors"
            >
              <LogOut size={17} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
