import { headers, cookies } from "next/headers";
import { LayoutGrid } from "lucide-react";
import { SidebarRail } from "./sidebar-rail";
import { LiveIndicator } from "./live-indicator";
import { MainNavServer } from "./main-nav-server";
import { NavHistoryButtons } from "./nav-history-buttons";
import { MobileMenuServer } from "./mobile-menu-server";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { NewTaskTrigger } from "@/components/header/new-task-trigger";
import { GlobalSearch } from "@/components/header/global-search";
import { getCurrentEmployee } from "@/lib/auth/current";
import { workspaceForPath, WORKSPACE_LANDING } from "@/lib/workspaces";
import { MODULE_THEME } from "@/lib/module-theme";

/**
 * Vertical LEFT-RAIL navigation (Sir's "left → right" layout, used by every
 * module except WMS). It carries EVERY detail the top header has, stacked:
 * history · logo → module identity · Back to Hub · search · the primary nav
 * (reusing MainNav's `drawer` variant of full-width vertical pills) · then Live
 * + user menu pinned to the bottom.
 *
 * COLOUR POLICY (Sir): the module colour is reserved for IDENTITY only — the
 * module title/wordmark here + the module names on the hub. Everything else,
 * including the nav pills (which are "buttons"), uses the brand Altus red. So we
 * DON'T override the pill `--vp-cyan*` vars (they default to Altus red); only the
 * wordmark carries `theme.accent`.
 */
export async function DashboardSidebar() {
  const me = await getCurrentEmployee();
  const isAdmin = me?.isAdmin ?? false;

  const pathname = (await headers()).get("x-pathname") ?? "/";
  const ws = workspaceForPath(pathname);
  const theme = ws && ws !== "wms" ? MODULE_THEME[ws] : null;
  const ModuleIcon = theme?.Icon;
  // Collapsed state persists in a cookie so the server renders the right width
  // on first paint (no flicker); the client toggle updates both.
  const collapsed = (await cookies()).get("sidebar_collapsed")?.value === "1";

  return (
   <>
    {/* Mobile (< md): the rail is hidden, so give phones a slim top bar with the
        hamburger drawer (same nav). The (app) layout offsets content with pt. */}
    <div
      className="md:hidden fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-3 px-4 header-light"
      style={{
        backgroundColor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--color-hairline)",
      }}
    >
      <MobileMenuServer isAdmin={isAdmin} />
      <img src="/logo.png" alt="Altus Corp" className="h-8 w-auto" />
      {theme && (
        <span className="font-extrabold tracking-tight" style={{ color: theme.accentDeep, fontSize: 16 }}>
          {theme.label}
        </span>
      )}
    </div>

    {/* Desktop (md+): the left rail — an IN-FLOW flex child (sticky, full height),
        so page content is offset by its real width and can NEVER slide under it.
        SidebarRail owns the collapse toggle + width; the icon-only look is CSS
        keyed off its data-collapsed (globals.css). */}
    <SidebarRail defaultCollapsed={collapsed}>
      {/* ── Brand block: history · logo · module identity ── */}
      <div className="sidebar-brand flex flex-col gap-3 px-4 pt-4 pb-3">
        <div className="sidebar-collapsible-hide flex items-center justify-between gap-2">
          <NavHistoryButtons />
          <GlobalSearch workspace={ws} />
        </div>

        <a
          href={ws ? WORKSPACE_LANDING[ws] : "/dashboard"}
          className="sidebar-logo flex items-center"
          aria-label="Go to this module's home"
        >
          <img src="/logo.png" alt="Altus Corp" className="h-14 w-auto" style={{ display: "block" }} />
        </a>

        {/* Module identity — the big animated module wordmark (same as header). */}
        {theme && ModuleIcon && (
          <span className="module-wordmark inline-flex items-center gap-2.5" aria-label={theme.label}>
            <span
              className="module-wordmark-icon inline-grid place-items-center rounded-2xl text-white"
              style={{
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDeep})`,
                boxShadow: `0 8px 20px -8px ${theme.accentDeep}`,
                width: 40,
                height: 40,
              }}
            >
              <ModuleIcon size={20} strokeWidth={2.6} aria-hidden />
            </span>
            <span
              className="module-wordmark-text leading-none"
              style={
                {
                  "--mw-a": theme.accent,
                  "--mw-b": theme.accentDeep,
                  fontSize: "clamp(18px, 1.5vw, 22px)",
                } as React.CSSProperties
              }
            >
              {theme.label}
            </span>
          </span>
        )}
      </div>

      {/* ── Back to Hub — full-width, same black pill as the header ── */}
      <div className="sidebar-hub px-4 pb-3">
        <a
          href="/hub"
          aria-label="Back to Hub"
          title="Back to Hub"
          className="sidebar-hub-btn inline-flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.98] hover:brightness-125"
          style={{ background: "#000", boxShadow: "0 6px 16px -8px rgba(0,0,0,0.45)" }}
        >
          <LayoutGrid size={17} strokeWidth={2.4} />
          <span className="sidebar-collapsible-hide">Back to Hub</span>
        </a>
      </div>

      <div className="mx-4 mb-1 border-t" style={{ borderColor: "var(--color-hairline)" }} />

      {/* ── Primary nav — vertical pills (MainNav drawer variant), scrollable ── */}
      <nav aria-label="Primary" className="sidebar-nav nav-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <MainNavServer variant="drawer" />
        {/* New Task is a WMS-only action. */}
        {ws === "wms" && (
          <div className="mt-2 sidebar-collapsible-hide">
            <NewTaskTrigger />
          </div>
        )}
      </nav>

      {/* ── Bottom: Live status + user menu, pinned ── */}
      <div
        className="sidebar-foot mt-auto flex items-center justify-between gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--color-hairline)" }}
      >
        <span className="sidebar-collapsible-hide contents">
          <LiveIndicator />
        </span>
        <UserMenuServer />
      </div>
    </SidebarRail>
   </>
  );
}
