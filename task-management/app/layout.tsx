import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Roboto, Bricolage_Grotesque, JetBrains_Mono, Fraunces } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AppToaster } from "@/components/ui/sonner-toaster";
import { Providers } from "@/components/providers";
import { DisplayScaleProvider } from "@/components/layout/display-scale-provider";
import { RegisterSW } from "@/components/pwa/register-sw";
import { RouteProgress } from "@/components/layout/route-progress";
import { getCurrentEmployee } from "@/lib/auth/current";
import { accentVars, resolveAccent } from "@/lib/appearance";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  display: "swap",
});

// Display font for the KPI hero numerals and section headlines. Variable
// weight + optical sizing means it holds up at 160px without looking
// stretched. Picked over Inter / system-ui so the dashboard has a
// recognisable typographic voice instead of generic-sans aesthetics.
const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

// Monospace voice for eyebrow labels + small caps in the holographic
// strip. Pairs against Bricolage's geometric curves for tension.
// Uses --font-mono-display (not --font-mono) so the existing @theme
// fallback chain stays intact for any code path that wants generic
// monospace.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-display",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Editorial serif for the Weekly Goals board (member names, section title,
// goal titles only — body text stays on the existing sans). Exposed as
// --font-editorial; consumed inline by the weekly-goals components.
const fraunces = Fraunces({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: ["400", "600", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Altus Corp — Work Management Dashboard",
  description: "Altus Corp work management dashboard",
  metadataBase: new URL("https://altus-corp-dashboard.vercel.app"),
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom up to 5x for accessibility; never disable user scaling.
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Profile v2 — stamp density + accent from the user's prefs. Theme is
  // intentionally light-only (no dark mode); the `theme` column on
  // employees is kept but unused.
  // Defense in depth: there is NO error boundary above the root layout, so a
  // genuine DB failure here would crash the entire app shell. `getCurrentEmployee`
  // already self-heals a stale connection via withRetry; if it STILL throws we
  // fall back to null → default prefs render instead of a hard crash. The (app)
  // layout's requireUser still enforces auth/redirect downstream.
  const me = await getCurrentEmployee().catch(() => null);
  const density = me?.density ?? "cozy";
  // Map the user's accent onto the brand accent CSS variables the whole app
  // consumes (--color-altus-red*, --vp-cyan*). For the default red this
  // reproduces globals.css exactly, so default users see no change.
  const htmlStyle = accentVars(resolveAccent(me?.accent)) as React.CSSProperties;

  return (
    <html
      lang="en"
      className={`${roboto.variable} ${bricolage.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}
      data-density={density}
      style={htmlStyle}
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning is scoped to <html>/<body> because
          common browser extensions (Grammarly, password managers, ad-blockers)
          decorate these elements with bookkeeping attributes like
          `__processed_<uuid>__` before React hydrates. The diff is in
          attributes only, never in our subtree, so suppressing here is
          safe and React's normal hydration warnings still apply
          everywhere else. */}
      <body suppressHydrationWarning>
        {/* Display-scale's geometric `zoom` was removed — a non-unity zoom on
            <html> double-applies to Radix/floating-ui portaled panels and threw
            every dropdown/popover off toward a corner. This inline script now
            only CLEARS any stale zoom a previous build may have left, pre-paint,
            so an open tab self-heals on next load. See DisplayScaleProvider. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{document.documentElement.style.zoom='';}catch(e){}})();",
          }}
        />
        <DisplayScaleProvider />
        {/* Global navigation progress bar — fires on every in-app link click
            across ALL route groups (app, admin, auth). Wrapped in Suspense
            because it reads useSearchParams. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {/* NuqsAdapter wires nuqs's useQueryState into the Next App Router
            so URL-as-state hooks (settings tabs, filter bars, etc.) work.
            Required by nuqs v2+ — without it any client component calling
            useQueryState throws "nuqs requires an adapter". */}
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
        <AppToaster />
        <RegisterSW />
        {/* Phase 0.3 — Vercel Speed Insights. Auto-no-ops outside Vercel
            (no env vars needed); on Vercel it records real-user Core Web
            Vitals per route, accessible from the project dashboard. */}
        <SpeedInsights />
        {/* Vercel Web Analytics — tracks page views and custom events.
            Auto-no-ops outside Vercel (no env vars needed); on Vercel it
            records visitor analytics per route, accessible from the project
            dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}
