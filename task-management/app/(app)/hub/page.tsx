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
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/auth/current";
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
    label: "Admin",
    desc: "People, settings, payroll & the control room.",
    href: "/hub/admin" as Route,
    Icon: ShieldCheck,
    tone: "hub-red",
  },
  {
    index: "02",
    label: "WMS",
    desc: "The work dashboard — tasks, goals & the daily loop.",
    href: "/hub/wms" as Route,
    Icon: LayoutDashboard,
    tone: "hub-ink",
  },
  {
    index: "03",
    label: "Employees",
    desc: "Attendance, leave, salary & the team roster.",
    href: "/hub/employees" as Route,
    Icon: Users,
    tone: "hub-blue",
  },
  {
    index: "04",
    label: "Sales",
    desc: "Collections, references & breakthroughs — and more to come.",
    href: "/hub/sales" as Route,
    Icon: TrendingUp,
    tone: "hub-green",
  },
  {
    index: "05",
    label: "Marketing",
    desc: "The index today — campaigns & reach landing next.",
    href: "/hub/marketing" as Route,
    Icon: Megaphone,
    tone: "hub-amber",
  },
  {
    index: "06",
    label: "Training",
    desc: "Onboarding, courses & skills — being built now.",
    href: "/hub/training" as Route,
    Icon: GraduationCap,
    tone: "hub-purple",
    soon: true,
  },
];

export default async function HubPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0] ?? me.name;

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
        {CARDS.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`hub-card ${c.tone}`}
            aria-label={
              c.soon ? `${c.label} — coming soon` : `Open ${c.label}`
            }
          >
            <span className="hub-card-top">
              <span className="hub-index">{c.index}</span>
              {c.soon ? (
                <span className="hub-soon">SOON</span>
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
          </Link>
        ))}
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
        min-height: 100dvh;
        background:
          radial-gradient(120% 120% at 0% 0%, #fdfaf3 0%, #f6f1e6 55%, #efe8d8 100%);
        color: var(--color-ink-strong);
        padding: clamp(20px, 4vw, 44px);
        display: flex;
        flex-direction: column;
        gap: clamp(28px, 4vw, 48px);
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

      /* ---- hero ---- */
      .hub-hero { max-width: 760px; }
      .hub-eyebrow {
        display: inline-block;
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 12px; font-weight: 700; letter-spacing: 0.26em;
        color: var(--color-altus-red);
        background: #fff;
        border: 2.5px solid var(--color-ink-strong);
        padding: 5px 11px;
        box-shadow: 4px 4px 0 var(--color-ink-strong);
      }
      .hub-title {
        font-family: var(--font-display, var(--font-serif), Georgia, serif);
        margin: 18px 0 0;
        font-size: clamp(40px, 7vw, 76px);
        line-height: 0.95;
        letter-spacing: -0.03em;
        font-weight: 800;
        text-transform: uppercase;
        color: var(--color-ink-strong);
      }
      .hub-sub {
        margin: 14px 0 0;
        font-size: clamp(15px, 1.5vw, 18px);
        color: var(--color-ink-muted);
        max-width: 48ch;
        line-height: 1.5;
      }

      /* ---- grid ---- */
      .hub-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: clamp(16px, 2vw, 26px);
      }
      @media (max-width: 1024px) { .hub-grid { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 640px)  { .hub-grid { grid-template-columns: 1fr; } }

      /* ---- card (the poster button) ---- */
      .hub-card {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 28px;
        min-height: 248px;
        padding: 24px;
        border: 3px solid var(--color-ink-strong);
        border-radius: 16px;
        text-decoration: none;
        overflow: hidden;
        box-shadow: 8px 8px 0 var(--color-ink-strong);
        transition: transform 130ms cubic-bezier(0.2,0.7,0.3,1),
                    box-shadow 130ms cubic-bezier(0.2,0.7,0.3,1);
      }
      .hub-card:hover,
      .hub-card:focus-visible {
        transform: translate(8px, 8px);
        box-shadow: 0 0 0 var(--color-ink-strong);
      }
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

      .hub-icon-wrap { display: flex; }
      .hub-icon { width: 54px; height: 54px; }

      .hub-card-foot { display: flex; flex-direction: column; gap: 6px; }
      .hub-label {
        font-family: var(--font-display, var(--font-serif), Georgia, serif);
        font-size: clamp(28px, 3vw, 34px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.01em;
        text-transform: uppercase;
      }
      .hub-desc { font-size: 14px; line-height: 1.45; opacity: 0.9; max-width: 28ch; }

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
