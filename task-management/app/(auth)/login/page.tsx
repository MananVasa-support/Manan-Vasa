import { redirect } from "next/navigation";
import type { Route } from "next";
import { AnimatedBrandBackdrop } from "@/components/auth/animated-brand-backdrop";
import { LoginFormGlass } from "@/components/auth/login-form-glass";
import { getCurrentEmployee } from "@/lib/auth/current";

/**
 * /login — the founder's first impression.
 *
 * Layer stack (back-to-front):
 *   1. Warm-dark canvas with a red radial glow in the lower-right
 *   2. Fine dot grid + SVG noise for atmosphere
 *   3. AnimatedBrandBackdrop — the looping logo + wordmark "video"
 *      (logo orbits to the left, "Altus Corp." wordmark to the right)
 *   4. The enlarged glass card carrying the LoginFormGlass
 *
 * Escapes the shared `(auth)/layout.tsx` shell with `fixed inset-0 z-50`
 * so the parent's drifting radial washes don't bleed through. Sibling
 * auth routes (forgot-password, set-password, welcome) still render on
 * the shared light canvas — untouched.
 *
 * Guard: signed-in employees are redirected to the dashboard so a
 * bookmarked /login never serves them a stale form.
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const me = await getCurrentEmployee();
  if (me && me.isActive) {
    redirect("/" as Route);
  }

  const sp = await searchParams;
  const reason = firstString(sp["reason"]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* ── Layer 1 — warm-dark canvas with red radial ── */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 75% 95%, rgba(225, 6, 0, 0.55), transparent 55%), radial-gradient(ellipse 60% 60% at 20% 10%, rgba(168, 4, 0, 0.25), transparent 60%), linear-gradient(135deg, #0E0B0A 0%, #1A0F0C 50%, #0B0708 100%)",
        }}
      />
      {/* Layer 2a — fine dot grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Layer 2b — subtle film grain */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* ── Layer 3 — animated brand backdrop ── */}
      <AnimatedBrandBackdrop />

      {/* Top brand pip — sits above the animation but well clear of the card.
          Mirrors the dashboard header's red triangle so the visual handshake
          between login and signed-in state is consistent. */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-8 py-6 max-md:px-5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderBottom: "10px solid #E10600",
              filter: "drop-shadow(0 0 10px rgba(225, 6, 0, 0.7))",
            }}
          />
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.24em",
              color: "rgba(255,255,255,0.85)",
              fontFamily: "var(--font-mono-display)",
              fontWeight: 700,
            }}
          >
            ALTUS · CORP
          </span>
        </div>
        <span
          className="max-md:hidden"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "rgba(255,255,255,0.40)",
            fontFamily: "var(--font-mono-display)",
          }}
        >
          OPERATIONS · CLARITY
        </span>
      </div>

      {/* ── Layer 4 — the enlarged glass card ── */}
      <main className="relative z-20 flex h-full w-full items-center justify-center px-6 py-20 max-md:px-4 max-md:py-16">
        <div
          className="w-full max-w-[660px] p-14 max-md:p-9"
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            backdropFilter: "blur(28px) saturate(180%)",
            WebkitBackdropFilter: "blur(28px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            borderRadius: 24,
            // Layered shadow + inner highlights for the genuine "glass plate"
            // depth: a deep ambient drop, a subtle white sheen along the top
            // edge, and a soft red bottom-glow tying the card to the canvas.
            boxShadow:
              "0 40px 100px -20px rgba(0, 0, 0, 0.60), 0 1px 0 rgba(255, 255, 255, 0.10) inset, 0 -28px 80px -40px rgba(225, 6, 0, 0.30) inset",
          }}
        >
          {reason === "idle" && (
            <div
              role="status"
              className="mb-5 rounded-lg px-4 py-3"
              style={{
                background: "rgba(245, 158, 11, 0.10)",
                border: "1px solid rgba(245, 158, 11, 0.40)",
                color: "#FDE68A",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              You were signed out after a period of inactivity. Please sign in
              to continue.
            </div>
          )}
          <LoginFormGlass />
        </div>
      </main>

      {/* Bottom signature */}
      <div
        aria-hidden
        className="absolute bottom-5 left-0 right-0 z-10 text-center"
        style={{
          fontSize: 10,
          letterSpacing: "0.24em",
          color: "rgba(255,255,255,0.30)",
          fontFamily: "var(--font-mono-display)",
          fontWeight: 600,
        }}
      >
        © {new Date().getFullYear()} ALTUS CORP · CONFIDENTIAL
      </div>
    </div>
  );
}
