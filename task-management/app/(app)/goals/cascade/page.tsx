import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Target, ArrowLeft, Layers } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { MODULE_THEME } from "@/lib/module-theme";
import { requireGoalsAccess } from "@/lib/goals/access";

export const dynamic = "force-dynamic";

const THEME = MODULE_THEME.goals;
const ACCENT = THEME.accent; // #b45309
const ACCENT_DEEP = THEME.accentDeep; // #7c2d12

// PLACEHOLDER shell — the year board (Y→Q→M drill, cross-out, add-extra,
// move-forward) is built by the CASCADE-UI slice.
export default async function GoalsCascadePage() {
  await requireGoalsAccess();
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        {/* Module masthead — signature animated wordmark */}
        <header className="wg-rise flex items-center gap-3">
          <span
            className="module-wordmark-icon inline-grid size-11 place-items-center rounded-2xl text-white"
            style={{
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
              boxShadow: `0 10px 24px -10px ${ACCENT_DEEP}`,
            }}
          >
            <Target size={22} strokeWidth={2.6} aria-hidden />
          </span>
          <span
            className="module-wordmark-text leading-none"
            style={
              {
                "--mw-a": ACCENT,
                "--mw-b": ACCENT_DEEP,
                fontSize: "clamp(26px, 3vw, 38px)",
              } as React.CSSProperties
            }
          >
            The Cascade
          </span>
        </header>

        {/* Branded coming-soon panel */}
        <section
          className="wg-rise relative mt-8 overflow-hidden rounded-section border border-dashed p-12 text-center max-md:p-8"
          style={{
            animationDelay: "80ms",
            borderColor: "var(--color-hairline-strong)",
            background: `radial-gradient(ellipse 80% 130% at 50% 0%, color-mix(in srgb, ${ACCENT} 8%, transparent), transparent 62%), var(--color-surface-card)`,
          }}
        >
          {/* faint top accent seam */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP}, transparent)` }}
          />
          <span
            className="wg-ring-glow mx-auto inline-grid size-16 place-items-center rounded-2xl"
            style={{
              color: ACCENT_DEEP,
              background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 22%, transparent)`,
            }}
          >
            <Layers size={30} strokeWidth={2.2} />
          </span>
          <h1
            className="mt-5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(24px, 3vw, 34px)",
              letterSpacing: "-0.02em",
            }}
          >
            The year board is landing next
          </h1>
          <p className="mx-auto mt-2.5 max-w-[52ch] text-[15px] font-medium leading-relaxed text-ink-muted">
            Plan the year, auto-divide it into quarters, months and weeks, then drill
            Year → Quarter → Month with cross-out, add-extra and carry-forward — all in
            one connected board. It is being wired up now.
          </p>
          <Link
            href={"/goals" as Route}
            className="wg-btn wg-sheen mt-6 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <ArrowLeft size={16} strokeWidth={2.6} /> Back to Goals
          </Link>
        </section>
      </main>
      <DashboardFooter />
    </>
  );
}
