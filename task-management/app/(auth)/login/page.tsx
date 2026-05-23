import { redirect } from "next/navigation";
import type { Route } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { LoginShowcase } from "@/components/auth/login-showcase";
import { LoginRightFade } from "@/components/auth/login-right-fade";
import { LoginRightPanel } from "@/components/auth/login-right-panel";
import { getCurrentEmployee } from "@/lib/auth/current";

/**
 * The login page is the founder's first impression of the product, so it gets
 * its own full-bleed split-screen treatment that intentionally breaks out of
 * the shared `(auth)/layout.tsx` shell.
 *
 * How we escape the parent layout: we render a `fixed inset-0 z-50` surface
 * that covers the entire viewport, painting our own background. The parent
 * layout's drifting radial washes still exist in the DOM but are visually
 * occluded — this keeps the other auth pages (forgot-password / set-password
 * / welcome) on the shared canvas, untouched.
 *
 * Below 1024px the left showcase collapses to a thin top hero band so the
 * form gets full-screen real estate on phones/tablets.
 *
 * Guard: if the visitor already has a valid Firebase session cookie, they
 * shouldn't see the login form at all — bounce them to the dashboard so
 * they don't end up on a broken state where any internal link silently
 * "logs them in".
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
    <div className="fixed inset-0 z-50 flex bg-[#0B0F1E] max-lg:flex-col">
      {/* ────────── LEFT — visual showcase (~58%) ────────── */}
      <div className="relative max-lg:hidden lg:basis-[58%] lg:flex-grow-0 lg:flex-shrink-0">
        <LoginShowcase />
      </div>

      {/* Compact mobile hero band — replaces the showcase below lg */}
      <div className="relative h-[160px] w-full overflow-hidden bg-[#0B0F1E] lg:hidden">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 50% 100%, rgba(225, 6, 0, 0.40), transparent 65%), linear-gradient(180deg, #0B1B24 0%, #0F2030 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgb(168, 4, 0) 20%, rgb(244, 85, 77) 50%, rgb(168, 4, 0) 80%, transparent 100%)",
            boxShadow: "0 0 10px rgba(225, 6, 0, 0.55)",
          }}
        />
        <div className="relative z-10 flex h-full flex-col items-start justify-center px-6">
          <h1
            className="font-serif text-white"
            style={{
              fontStyle: "italic",
              fontSize: 44,
              lineHeight: 0.95,
              letterSpacing: "-0.03em",
              fontWeight: 500,
            }}
          >
            Altus{" "}
            <span
              style={{
                display: "inline-block",
                paddingRight: "0.18em",
                background:
                  "linear-gradient(110deg, #F4554D, #E10600 50%, #A80400)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Corp.
            </span>
          </h1>
          <p
            className="mt-1"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}
          >
            Operations clarity for the Altus Corp team.
          </p>
        </div>
      </div>

      {/* ────────── RIGHT — form surface (~42%) ────────── */}
      <div
        className="relative flex flex-1 flex-col bg-[#FAFBFC] lg:basis-[42%] lg:flex-grow-0"
        style={{
          boxShadow: "inset 1px 0 0 rgba(15, 23, 42, 0.06)",
        }}
      >
        {/* Top hairline */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-0 h-px"
          style={{ background: "rgba(15, 23, 42, 0.06)" }}
        />

        <LoginRightFade />

        <LoginRightPanel>
          {reason === "idle" && (
            <div
              role="status"
              className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-body"
            >
              You were signed out after a period of inactivity. Please sign in to continue.
            </div>
          )}
          <LoginForm />
        </LoginRightPanel>
      </div>
    </div>
  );
}
