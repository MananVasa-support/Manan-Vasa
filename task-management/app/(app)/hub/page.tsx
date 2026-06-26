import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  TrendingUp,
  Megaphone,
  GraduationCap,
  ArrowRight,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { HubSignOut } from "@/components/hub/hub-signout";

/**
 * THE FRONT DOOR — post-login Hub launcher.
 *
 * Minimal-neobrutalist "switchboard": six poster cards on warm paper, each a
 * physical button that presses into the page on hover/focus. The palette is
 * deliberately restrained — paper + ink, with Altus red as the SINGLE accent
 * (index, and the press state) — so it reads premium/editorial, not playful.
 *
 * Pure Server Component + CSS — no client JS for the cards, no new queries
 * beyond requireUser() (already resolved + cache()'d by the (app) layout). The
 * only interactive island is the small sign-out chip.
 */

type Card = {
  /** Mono index shown top-left ("01"…"06") — encodes launch order, not decor. */
  index: string;
  /** Workspace id — drives the entry link and the access check. */
  ws: WorkspaceId;
  label: string;
  desc: string;
  href: Route;
  Icon: LucideIcon;
  soon?: boolean;
};

const CARDS: Card[] = [
  {
    index: "01",
    ws: "admin",
    label: "Admin",
    desc: "People, settings, payroll & the control room.",
    href: "/ws/admin" as Route,
    Icon: ShieldCheck,
  },
  {
    index: "02",
    ws: "wms",
    label: "WMS",
    desc: "The work dashboard — tasks, goals & the daily loop.",
    href: "/ws/wms" as Route,
    Icon: LayoutDashboard,
  },
  {
    index: "03",
    ws: "employees",
    label: "Employees",
    desc: "Attendance, leave, salary & the team roster.",
    href: "/ws/employees" as Route,
    Icon: Users,
  },
  {
    index: "04",
    ws: "sales",
    label: "Sales",
    desc: "Collections, references & breakthroughs — and more to come.",
    href: "/ws/sales" as Route,
    Icon: TrendingUp,
  },
  {
    index: "05",
    ws: "marketing",
    label: "Marketing",
    desc: "The index today — campaigns & reach landing next.",
    href: "/ws/marketing" as Route,
    Icon: Megaphone,
  },
  {
    index: "06",
    ws: "training",
    label: "Training",
    desc: "Material library, tests, induction & feedback.",
    href: "/ws/training" as Route,
    Icon: GraduationCap,
  },
];

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;

  // Rooms the user can't enter (Sales = department-gated, Admin = admins only)
  // stay VISIBLE but locked + non-clickable, like a SOON card. Server-side the
  // /ws handler + the destination layouts enforce it too — this is just the door.
  const access = accessFor(me);

  // NOTE: Accounts is no longer a hub room — it now lives as a section inside
  // Admin (the "Accounts" pill in the admin header, super-admins only).

  return (
    <main className="hub-root">
      <HubStyles />

      {/* Header — logo + greeting + sign-out. No app nav: this is a clean door. */}
      <header className="hub-header">
        <div className="hub-brand">
          <Image
            src="/logo.png"
            alt="Altus Corp"
            width={132}
            height={40}
            priority
            className="hub-logo"
          />
        </div>
        <div className="hub-header-right">
          <span className="hub-hello">
            Hi, <strong>{firstName}</strong>
          </span>
          <HubSignOut />
        </div>
      </header>

      {/* Hero */}
      <section className="hub-hero">
        <span className="hub-eyebrow">ALTUS&nbsp;/&nbsp;WORKSPACES</span>
        <h1 className="hub-title">Choose your workspace</h1>
        <p className="hub-sub">
          Six rooms, one company. Pick where today&rsquo;s work happens.
        </p>
      </section>

      {/* Switchboard */}
      <section className="hub-grid" aria-label="Workspaces">
        {CARDS.map((c) => {
          const locked = !c.soon && !canAccessWorkspace(c.ws, access);
          // Inert = SOON (not built) OR locked (no access). Either way it
          // renders as a non-link card so it can't navigate anywhere.
          const inert = c.soon || locked;
          const inner = (
            <>
              <span className="hub-card-top">
                <span className="hub-index">{c.index}</span>
                {c.soon ? (
                  <span className="hub-soon">SOON</span>
                ) : locked ? (
                  <span className="hub-soon hub-locked">
                    <Lock size={11} strokeWidth={2.8} aria-hidden /> LOCKED
                  </span>
                ) : (
                  <ArrowRight className="hub-go" size={22} strokeWidth={2.6} aria-hidden />
                )}
              </span>

              <span className="hub-icon-wrap" aria-hidden>
                <c.Icon className="hub-icon" strokeWidth={2} />
              </span>

              <span className="hub-card-foot">
                <span className="hub-label">{c.label}</span>
                <span className="hub-desc">{c.desc}</span>
              </span>
            </>
          );

          return inert ? (
            <div
              key={c.label}
              className="hub-card hub-card-soon"
              aria-label={locked ? `${c.label} — no access` : `${c.label} — coming soon`}
              aria-disabled="true"
            >
              {inner}
            </div>
          ) : (
            <Link
              key={c.label}
              href={c.href}
              className="hub-card"
              aria-label={`Open ${c.label}`}
            >
              {inner}
            </Link>
          );
        })}
      </section>
    </main>
  );
}

/**
 * Scoped minimal-neobrutalism. Inlined here (static, no client JS) so the
 * styling travels with the route and never leaks into the rest of the app.
 *
 * Palette: warm paper canvas + cards, ink (near-black) borders/shadows/type,
 * Altus red as the ONLY accent (index, and the pressed state). No per-card
 * color fills — differentiation is the icon + label, not colour.
 *
 * Press model: each card sits lifted on a hard, blur-free ink offset shadow. On
 * hover/:focus-visible it translates by the offset and the shadow collapses to a
 * small red shadow with a red border — the button physically presses in and
 * "comes alive" in brand red. Disabled under prefers-reduced-motion.
 */
function HubStyles() {
  return (
    <style>{`
      .hub-root {
        height: 100dvh;
        overflow: hidden;
        background:
          radial-gradient(120% 120% at 0% 0%, #fdfaf3 0%, #f6f1e6 55%, #efe8d8 100%);
        color: var(--color-ink-strong);
        padding: clamp(16px, 2.4vh, 30px) clamp(20px, 4vw, 44px);
        display: flex;
        flex-direction: column;
        gap: clamp(12px, 2vh, 22px);
        font-family: var(--font-sans), system-ui, sans-serif;
      }

      /* ---- header ---- */
      .hub-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      .hub-brand { display: flex; align-items: center; }
      .hub-logo { height: 38px; width: auto; display: block; }
      .hub-header-right { display: flex; align-items: center; gap: 14px; }
      .hub-hello {
        font-size: 14px;
        color: var(--color-ink-soft);
        letter-spacing: 0.01em;
      }
      .hub-hello strong { color: var(--color-ink-strong); font-weight: 700; }

      /* sign-out chip — same press language as the cards, scaled down */
      .hub-chip {
        display: inline-flex; align-items: center; gap: 7px;
        background: #fff;
        color: var(--color-ink-strong);
        border: 2.5px solid var(--color-ink-strong);
        border-radius: 11px;
        padding: 9px 14px;
        font-size: 13.5px; font-weight: 800; letter-spacing: 0.01em;
        cursor: pointer;
        box-shadow: 4px 4px 0 var(--color-ink-strong);
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease, color 120ms ease;
      }
      .hub-chip:hover,
      .hub-chip:focus-visible {
        transform: translate(2px, 2px);
        box-shadow: 2px 2px 0 var(--color-altus-red);
        border-color: var(--color-altus-red);
        color: var(--color-altus-red);
      }
      .hub-chip:focus-visible {
        outline: 3px solid var(--color-altus-red);
        outline-offset: 3px;
      }

      /* ---- hero (compact — leaves the cards the rest of the screen) ---- */
      .hub-hero { max-width: 900px; flex: 0 0 auto; }
      .hub-eyebrow {
        display: inline-block;
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 11px; font-weight: 700; letter-spacing: 0.24em;
        color: var(--color-altus-red);
        background: #fff;
        border: 2.5px solid var(--color-ink-strong);
        padding: 4px 10px;
        box-shadow: 3px 3px 0 var(--color-ink-strong);
      }
      .hub-title {
        font-family: var(--font-display, var(--font-serif), Georgia, serif);
        margin: 10px 0 0;
        font-size: clamp(28px, 3.4vw, 46px);
        line-height: 0.96;
        letter-spacing: -0.03em;
        font-weight: 800;
        text-transform: uppercase;
        color: var(--color-ink-strong);
      }
      .hub-sub {
        margin: 7px 0 0;
        font-size: clamp(13px, 1.3vw, 16px);
        color: var(--color-ink-muted);
        max-width: 52ch;
        line-height: 1.45;
      }

      /* ---- grid: fills the height left after header + hero. Six cards run as
             2 rows of 3; auto rows so it scales without clipping. ---- */
      .hub-grid {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-auto-rows: 1fr;
        gap: clamp(12px, 1.6vw, 22px);
      }

      /* ---- card (the poster button) — warm paper, ink frame, red on press ---- */
      .hub-card {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
        min-height: 0;
        padding: clamp(16px, 1.6vw, 24px);
        background: #fcfaf4;
        color: var(--color-ink-strong);
        border: 3px solid var(--color-ink-strong);
        border-radius: 16px;
        text-decoration: none;
        box-shadow: 6px 6px 0 var(--color-ink-strong);
        transition: transform 140ms cubic-bezier(0.2,0.7,0.3,1),
                    box-shadow 140ms cubic-bezier(0.2,0.7,0.3,1),
                    border-color 140ms ease, background 140ms ease;
        animation: hubRise 0.5s cubic-bezier(0.2,0.7,0.3,1) both;
      }
      /* staggered entrance */
      .hub-grid > :nth-child(1) { animation-delay: 0.02s; }
      .hub-grid > :nth-child(2) { animation-delay: 0.07s; }
      .hub-grid > :nth-child(3) { animation-delay: 0.12s; }
      .hub-grid > :nth-child(4) { animation-delay: 0.17s; }
      .hub-grid > :nth-child(5) { animation-delay: 0.22s; }
      .hub-grid > :nth-child(6) { animation-delay: 0.27s; }

      .hub-card:hover,
      .hub-card:focus-visible {
        transform: translate(5px, 5px);
        box-shadow: 1px 1px 0 var(--color-altus-red);
        border-color: var(--color-altus-red);
        background: color-mix(in srgb, var(--color-altus-red) 4%, #fcfaf4);
      }
      .hub-card:focus-visible {
        outline: 3px solid var(--color-altus-red);
        outline-offset: 4px;
      }

      .hub-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .hub-index {
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 14px; font-weight: 800; letter-spacing: 0.14em;
        color: var(--color-altus-red);
      }
      .hub-go {
        color: var(--color-ink-strong);
        opacity: 0.5;
        transition: transform 140ms ease, color 140ms ease, opacity 140ms ease;
      }
      .hub-card:hover .hub-go,
      .hub-card:focus-visible .hub-go {
        transform: translateX(4px);
        color: var(--color-altus-red);
        opacity: 1;
      }

      .hub-icon-wrap { display: flex; }
      .hub-icon {
        width: clamp(34px, 2.9vw, 46px);
        height: clamp(34px, 2.9vw, 46px);
        color: var(--color-ink-strong);
      }

      .hub-card-foot { display: flex; flex-direction: column; gap: 5px; }
      .hub-label {
        font-family: var(--font-display, var(--font-serif), Georgia, serif);
        font-size: clamp(22px, 2.4vw, 32px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.01em;
        text-transform: uppercase;
        color: var(--color-ink-strong);
      }
      .hub-desc {
        font-size: clamp(12px, 1.05vw, 14px);
        line-height: 1.45;
        color: var(--color-ink-muted);
        max-width: 30ch;
      }

      /* ---- inert (locked / soon): muted paper, no press, no red accent ---- */
      .hub-card-soon {
        cursor: default;
        background: #f6f2e9;
        border-color: var(--color-hairline-strong);
        box-shadow: 4px 4px 0 var(--color-hairline-strong);
        color: var(--color-ink-muted);
      }
      .hub-card-soon:hover,
      .hub-card-soon:focus-visible {
        transform: none;
        box-shadow: 4px 4px 0 var(--color-hairline-strong);
        border-color: var(--color-hairline-strong);
        background: #f6f2e9;
      }
      .hub-card-soon .hub-index { color: var(--color-ink-subtle); }
      .hub-card-soon .hub-icon { color: var(--color-ink-soft); }
      .hub-card-soon .hub-label { color: var(--color-ink-soft); }

      .hub-soon {
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 11px; font-weight: 800; letter-spacing: 0.16em;
        padding: 3px 8px;
        border: 2px solid var(--color-hairline-strong);
        border-radius: 999px;
        color: var(--color-ink-subtle);
        background: transparent;
      }
      .hub-locked { display: inline-flex; align-items: center; gap: 5px; }

      @keyframes hubRise {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: none; }
      }

      /* ---- narrow screens: let it scroll, collapse columns ---- */
      @media (max-width: 1024px) {
        .hub-root { height: auto; min-height: 100dvh; overflow: visible; }
        .hub-grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: none; }
        .hub-card { min-height: 196px; }
      }
      @media (max-width: 640px) {
        .hub-grid { grid-template-columns: 1fr; }
      }

      @media (prefers-reduced-motion: reduce) {
        .hub-card { animation: none; }
        .hub-card, .hub-chip, .hub-go { transition: none; }
        .hub-card:hover, .hub-card:focus-visible { transform: none; }
        .hub-chip:hover, .hub-chip:focus-visible { transform: none; }
        /* still snap to the red pressed state so the affordance reads */
        .hub-card:hover, .hub-card:focus-visible { box-shadow: 2px 2px 0 var(--color-altus-red); }
        .hub-card:hover .hub-go, .hub-card:focus-visible .hub-go { transform: none; }
      }
    `}</style>
  );
}
