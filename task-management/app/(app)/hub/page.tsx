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
  ArrowUpRight,
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
 * A neobrutalist "switchboard": six big poster cards, each a physical button
 * that presses into the page on hover/focus. Pure Server Component + CSS — no
 * client JS for the cards, no new queries beyond requireUser() (which the (app)
 * layout already resolved and cache()'d, so this is free). The only interactive
 * island is the small sign-out chip.
 *
 * Auth/gates are handled by the (app) layout — we do NOT re-check here.
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
  /** Card class → flat color block + on-fill text color (see globals-scoped CSS). */
  tone:
    | "hub-red"
    | "hub-ink"
    | "hub-blue"
    | "hub-green"
    | "hub-amber"
    | "hub-purple";
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
    tone: "hub-red",
  },
  {
    index: "02",
    ws: "wms",
    label: "WMS",
    desc: "The work dashboard — tasks, goals & the daily loop.",
    href: "/ws/wms" as Route,
    Icon: LayoutDashboard,
    tone: "hub-ink",
  },
  {
    index: "03",
    ws: "employees",
    label: "Employees",
    desc: "Attendance, leave, salary & the team roster.",
    href: "/ws/employees" as Route,
    Icon: Users,
    tone: "hub-blue",
  },
  {
    index: "04",
    ws: "sales",
    label: "Sales",
    desc: "Collections, references & breakthroughs — and more to come.",
    href: "/ws/sales" as Route,
    Icon: TrendingUp,
    tone: "hub-green",
  },
  {
    index: "05",
    ws: "marketing",
    label: "Marketing",
    desc: "The index today — campaigns & reach landing next.",
    href: "/ws/marketing" as Route,
    Icon: Megaphone,
    tone: "hub-amber",
  },
  {
    index: "06",
    ws: "training",
    label: "Training",
    desc: "Material library, tests, induction & feedback.",
    href: "/ws/training" as Route,
    Icon: GraduationCap,
    tone: "hub-purple",
  },
];

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;

  // Rooms the user can't enter (Sales = department-gated, Admin = admins only)
  // stay VISIBLE but locked + non-clickable, like a SOON card. Server-side the
  // /ws handler + the destination layouts enforce it too — this is just the door.
  const access = accessFor(me);

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
                  <Lock size={12} strokeWidth={2.8} aria-hidden /> LOCKED
                </span>
              ) : (
                <ArrowUpRight className="hub-go" size={22} strokeWidth={2.8} aria-hidden />
              )}
            </span>

            <span className="hub-icon-wrap" aria-hidden>
              <c.Icon className="hub-icon" strokeWidth={2.2} />
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
              className={`hub-card hub-card-soon ${c.tone}`}
              aria-label={locked ? `${c.label} — no access` : `${c.label} — coming soon`}
              aria-disabled="true"
            >
              {inner}
            </div>
          ) : (
            <Link
              key={c.label}
              href={c.href}
              className={`hub-card ${c.tone}`}
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
 * Scoped neobrutalism. Inlined here (static, no client JS) so the showcase
 * styling travels with the route and never leaks into the rest of the app.
 *
 * Press model: the card sits lifted on a hard, blur-free offset shadow. On
 * hover OR :focus-visible it translates by the shadow offset and the shadow
 * collapses — the button physically presses into the page. Disabled under
 * prefers-reduced-motion (no transform), but the shadow/focus state still
 * reads so the affordance survives.
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
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .hub-chip:hover,
      .hub-chip:focus-visible {
        transform: translate(2px, 2px);
        box-shadow: 2px 2px 0 var(--color-ink-strong);
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

      /* ---- grid: fills the height left after header + hero ---- */
      .hub-grid {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(2, 1fr);
        gap: clamp(12px, 1.6vw, 22px);
      }

      /* ---- card (the poster button) ---- */
      .hub-card {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 10px;
        min-height: 0;
        padding: clamp(14px, 1.5vw, 22px);
        border: 3px solid var(--color-ink-strong);
        border-radius: 16px;
        text-decoration: none;
        overflow: hidden;
        box-shadow: 6px 6px 0 var(--color-ink-strong);
        transition: transform 130ms cubic-bezier(0.2,0.7,0.3,1),
                    box-shadow 130ms cubic-bezier(0.2,0.7,0.3,1);
      }
      .hub-card-soon { cursor: default; }
      .hub-card:hover,
      .hub-card:focus-visible {
        transform: translate(6px, 6px);
        box-shadow: 0 0 0 var(--color-ink-strong);
      }
      /* SOON card is inert — no press. */
      .hub-card-soon:hover { transform: none; box-shadow: 6px 6px 0 var(--color-ink-strong); }
      .hub-card:focus-visible {
        outline: 4px solid var(--color-ink-strong);
        outline-offset: 5px;
      }
      /* subtle paper grain corner so the flat blocks feel printed, not digital */
      .hub-card::after {
        content: "";
        position: absolute;
        right: -40px; bottom: -40px;
        width: 140px; height: 140px;
        border-radius: 50%;
        background: rgba(255,255,255,0.10);
        pointer-events: none;
      }

      .hub-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .hub-index {
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 15px; font-weight: 700; letter-spacing: 0.12em;
        opacity: 0.82;
      }
      .hub-go { opacity: 0.9; transition: transform 130ms ease; }
      .hub-card:hover .hub-go,
      .hub-card:focus-visible .hub-go { transform: translate(3px, -3px); }

      .hub-soon {
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 12px; font-weight: 800; letter-spacing: 0.18em;
        padding: 4px 9px;
        border: 2.5px solid currentColor;
        border-radius: 999px;
        background: rgba(0,0,0,0.16);
      }
      /* LOCKED badge — same chip as SOON, with the lock glyph inline. */
      .hub-locked {
        display: inline-flex; align-items: center; gap: 5px;
      }

      .hub-icon-wrap { display: flex; }
      .hub-icon { width: clamp(34px, 3vw, 48px); height: clamp(34px, 3vw, 48px); }

      .hub-card-foot { display: flex; flex-direction: column; gap: 5px; }
      .hub-label {
        font-family: var(--font-display, var(--font-serif), Georgia, serif);
        font-size: clamp(22px, 2.4vw, 32px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.01em;
        text-transform: uppercase;
      }
      .hub-desc {
        font-size: clamp(12px, 1.05vw, 14px);
        line-height: 1.4; opacity: 0.9; max-width: 30ch;
      }

      /* ---- narrow screens: one page is impractical with 6 cards → let it
             scroll, and collapse to fewer columns. ---- */
      @media (max-width: 1024px) {
        .hub-root { height: auto; min-height: 100dvh; overflow: visible; }
        .hub-grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: none; }
        .hub-card { min-height: 200px; }
      }
      @media (max-width: 640px) {
        .hub-grid { grid-template-columns: 1fr; }
      }

      /* ---- tones: flat bold color blocks, on-brand tokens, AA text ---- */
      .hub-red   { background: var(--color-altus-red);  color: #fff; }
      .hub-ink   { background: var(--color-ink-strong); color: #fff; }
      .hub-blue  { background: var(--color-blue-deep);  color: #fff; }
      .hub-green { background: var(--color-green-deep); color: #fff; }
      .hub-amber { background: var(--color-amber);      color: var(--color-ink-strong); }
      .hub-purple{ background: var(--color-purple-deep);color: #fff; }
      /* amber is light — keep its soon-tag legible on the fill */
      .hub-amber .hub-soon { background: rgba(15,23,42,0.12); }

      @media (prefers-reduced-motion: reduce) {
        .hub-card, .hub-chip, .hub-go { transition: none; }
        .hub-card:hover, .hub-card:focus-visible { transform: none; }
        .hub-chip:hover, .hub-chip:focus-visible { transform: none; }
        /* still collapse the shadow so the press reads as a state change */
        .hub-card:hover, .hub-card:focus-visible { box-shadow: 2px 2px 0 var(--color-ink-strong); }
        .hub-card:hover .hub-go, .hub-card:focus-visible .hub-go { transform: none; }
      }
    `}</style>
  );
}
