import { headers } from "next/headers";
import { LayoutGrid } from "lucide-react";
import { LiveIndicator } from "./live-indicator";
import { MainNavServer } from "./main-nav-server";
import { NavHistoryButtons } from "./nav-history-buttons";
import { MobileMenuServer } from "./mobile-menu-server";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { NewTaskTrigger } from "@/components/header/new-task-trigger";
import { GlobalSearch } from "@/components/header/global-search";
import { getCurrentEmployee } from "@/lib/auth/current";
import { workspaceForPath } from "@/lib/workspaces";
import { MODULE_THEME } from "@/lib/module-theme";

/** "#rrggbb" → "r g b" (the triplet form the nav-pill CSS expects). */
function hexTriplet(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
}

/**
 * Light glassy application header — single row, ~72px tall.
 *
 * Cyan triangle mark + bold "Altus Corp" wordmark on the left, primary
 * nav centered with airy spacing, right cluster carries live indicator +
 * actions + avatar. Frosted-glass white surface with a single hairline
 * bottom border — no decorative washes, no rainbow strip. The nav-pill
 * colors flip to ink-on-light via `.header-light` scope.
 *
 * `generatedAt` is accepted to keep the prop contract stable for callers
 * but no longer rendered.
 */
export async function DashboardHeader({
  generatedAt: _generatedAt,
}: { generatedAt: Date }) {
  const me = await getCurrentEmployee();
  const isAdmin = me?.isAdmin ?? false;

  // MODULE COLOUR (meeting 2026-06-29): tint the whole header — nav pills,
  // active state, accents — to the CURRENT module's signature colour, so you
  // always know which module you're in. The pills read `--vp-cyan*`, so
  // overriding those three vars on the header re-tints everything with zero
  // CSS-rule churn. WMS keeps the default Altus red (no override).
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const ws = workspaceForPath(pathname);
  const theme = ws && ws !== "wms" ? MODULE_THEME[ws] : null;
  const moduleVars = theme
    ? ({
        "--vp-cyan": hexTriplet(theme.accent),
        "--vp-cyan-deep": hexTriplet(theme.accentDeep),
        "--vp-cyan-tint": `color-mix(in srgb, ${theme.accent} 12%, transparent)`,
      } as React.CSSProperties)
    : undefined;

  const ModuleIcon = theme?.Icon;

  return (
    <header
      className={`sticky top-0 z-50 header-light${theme ? " nav-themed" : ""}`}
      style={moduleVars}
    >
      <div
        className="relative"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid var(--color-hairline)",
        }}
      >
        <div className="relative w-full h-[96px] px-6 max-md:h-[72px] max-md:px-4 flex items-center gap-4 2xl:gap-6 max-md:gap-3">
          {/* LEFT-MOST: Back / Forward history pills (md+ only).
              On mobile, replaced by the hamburger menu (same slot). */}
          <NavHistoryButtons />
          <MobileMenuServer isAdmin={isAdmin} />

          {/* LEFT: Altus Corp logo — always returns to the WMS home page
              (/dashboard), from any workspace. The image is the brand mark; the
              logo already includes the name. */}
          <a href="/dashboard" className="flex items-center shrink-0" aria-label="Back to WMS home">
            <img
              src="/logo.png"
              alt="Altus Corp"
              className="h-16 w-auto max-md:h-14"
              style={{ display: "block" }}
            />
          </a>

          {/* Explicit "Back to Hub" — black, always visible, on every module so
              there's a clear, consistent way back to the workspace switchboard. */}
          <a
            href="/hub"
            aria-label="Back to Hub"
            className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.98] hover:brightness-125 max-md:px-3 max-md:py-2"
            style={{ background: "#000", color: "#fff", boxShadow: "0 6px 16px -8px rgba(0,0,0,0.45)" }}
          >
            <LayoutGrid size={17} strokeWidth={2.4} />
            <span>Back to Hub</span>
          </a>

          {/* MODULE IDENTITY — a bold, module-coloured badge shown on EVERY page
              of a non-WMS module, so you always know exactly where you are. */}
          {theme && ModuleIcon && (
            <span
              className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-extrabold uppercase tracking-[0.04em] text-white max-md:px-3 max-md:py-1.5 max-md:text-[12.5px]"
              style={{
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDeep})`,
                boxShadow: `0 6px 16px -8px ${theme.accentDeep}`,
              }}
            >
              <ModuleIcon size={16} strokeWidth={2.6} aria-hidden />
              {theme.label}
            </span>
          )}

          {/* CENTER: primary pill nav — visible on every desktop width (and
              under zoom). It stays centred while it fits; when space gets tight
              it scrolls horizontally FROM THE LEFT (w-max + mx-auto) so pills
              are never clipped, never overlap, and never disappear. Collapses
              to the hamburger drawer only on real phones (max-md). */}
          <div className="flex-1 min-w-0 overflow-x-auto nav-scroll max-md:hidden">
            <div className="flex w-max mx-auto">
              <MainNavServer />
            </div>
          </div>

          {/* RIGHT: search + live indicator + actions + avatar. Every item is
              shrink-0; secondary chrome (Live / Admin pill) hides below 2xl and
              the search collapses to an icon there too, so the nav always has
              room and nothing ever overlaps. */}
          <div className="flex items-center gap-2.5 2xl:gap-3 shrink-0 max-xl:ml-auto max-md:gap-1.5">
            <GlobalSearch />
            <span className="max-2xl:hidden">
              <LiveIndicator />
            </span>
            <NewTaskTrigger />
            <UserMenuServer />
          </div>
        </div>
      </div>
    </header>
  );
}
