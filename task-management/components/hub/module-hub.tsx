import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowUpRight, type LucideIcon } from "lucide-react";

/**
 * MODULE SUB-HUB — the second level of the Hub launcher.
 *
 * The top hub (`/hub`) is a loud switchboard of six poster buttons. Each poster
 * opens one of these sub-hubs, which lists that module's features as a board of
 * tiles. Deliberately "neobrutalist-lite": thinner ink borders + shorter
 * hard-offset shadows than the poster cards, so the level hierarchy reads at a
 * glance — you always know you've stepped one room deeper, not sideways.
 *
 * Pure Server Component + scoped CSS. No client JS, no new queries: auth + data
 * are resolved by the (app) layout above. Every tile is a real <Link> (live
 * feature) or a non-interactive panel with a "SOON" tag (not-yet-built), so Tab
 * order is the visual order and the keyboard reaches exactly what's live.
 */

export type Tile = {
  label: string;
  /** lucide icon that fits the feature. */
  Icon: LucideIcon;
  /** Present → live feature, renders as a <Link>. Omit → renders a SOON tile. */
  href?: Route;
};

export type ModuleTone =
  | "mh-red"
  | "mh-ink"
  | "mh-blue"
  | "mh-green"
  | "mh-amber"
  | "mh-purple";

export function ModuleHub({
  index,
  title,
  blurb,
  tone,
  tiles,
}: {
  /** Launch-order index from the top hub ("01"…"06") — keeps the rooms numbered consistently. */
  index: string;
  title: string;
  blurb: string;
  tone: ModuleTone;
  tiles: Tile[];
}) {
  const liveCount = tiles.filter((t) => t.href).length;
  const soonCount = tiles.length - liveCount;

  return (
    <main className="mh-root">
      <ModuleHubStyles />

      <header className="mh-head">
        <Link href={"/hub" as Route} className="mh-back">
          <ArrowLeft size={16} strokeWidth={3} aria-hidden />
          Back to hub
        </Link>

        <div className={`mh-banner ${tone}`}>
          <span className="mh-banner-index">{index}</span>
          <h1 className="mh-title">{title}</h1>
          <p className="mh-blurb">{blurb}</p>
          <span className="mh-count">
            {liveCount} live
            {soonCount > 0 ? ` · ${soonCount} coming soon` : ""}
          </span>
        </div>
      </header>

      <section className="mh-grid" aria-label={`${title} features`}>
        {tiles.map((t) =>
          t.href ? (
            <Link
              key={t.label}
              href={t.href}
              className="mh-tile"
              aria-label={`Open ${t.label}`}
            >
              <span className={`mh-tile-icon ${tone}`} aria-hidden>
                <t.Icon size={26} strokeWidth={2.3} />
              </span>
              <span className="mh-tile-label">{t.label}</span>
              <ArrowUpRight
                className="mh-tile-go"
                size={18}
                strokeWidth={2.8}
                aria-hidden
              />
            </Link>
          ) : (
            <div
              key={t.label}
              className="mh-tile mh-tile-soon"
              aria-label={`${t.label} — coming soon`}
            >
              <span className="mh-tile-icon" aria-hidden>
                <t.Icon size={26} strokeWidth={2.3} />
              </span>
              <span className="mh-tile-label">{t.label}</span>
              <span className="mh-tile-soon-tag">SOON</span>
            </div>
          )
        )}
      </section>
    </main>
  );
}

function ModuleHubStyles() {
  return (
    <style>{`
      .mh-root {
        min-height: 100dvh;
        background:
          radial-gradient(120% 120% at 0% 0%, #fdfaf3 0%, #f6f1e6 55%, #efe8d8 100%);
        color: var(--color-ink-strong);
        padding: clamp(20px, 4vw, 44px);
        display: flex;
        flex-direction: column;
        gap: clamp(22px, 3vw, 34px);
        font-family: var(--font-sans), system-ui, sans-serif;
      }

      /* ---- header: back chip + module banner ---- */
      .mh-head { display: flex; flex-direction: column; gap: clamp(18px, 2.5vw, 26px); }

      .mh-back {
        align-self: flex-start;
        display: inline-flex; align-items: center; gap: 8px;
        background: #fff;
        color: var(--color-ink-strong);
        border: 2.5px solid var(--color-ink-strong);
        border-radius: 11px;
        padding: 9px 15px;
        font-size: 14px; font-weight: 800; letter-spacing: 0.01em;
        text-decoration: none;
        box-shadow: 4px 4px 0 var(--color-ink-strong);
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .mh-back:hover, .mh-back:focus-visible {
        transform: translate(2px, 2px);
        box-shadow: 2px 2px 0 var(--color-ink-strong);
      }
      .mh-back:focus-visible { outline: 3px solid var(--color-altus-red); outline-offset: 3px; }

      .mh-banner {
        position: relative;
        overflow: hidden;
        border: 3px solid var(--color-ink-strong);
        border-radius: 16px;
        box-shadow: 8px 8px 0 var(--color-ink-strong);
        padding: clamp(22px, 3.5vw, 36px);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .mh-banner-index {
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 14px; font-weight: 700; letter-spacing: 0.18em;
        opacity: 0.82;
      }
      .mh-title {
        font-family: var(--font-display, var(--font-serif), Georgia, serif);
        margin: 2px 0 0;
        font-size: clamp(38px, 6vw, 64px);
        line-height: 0.95;
        letter-spacing: -0.03em;
        font-weight: 800;
        text-transform: uppercase;
      }
      .mh-blurb {
        margin: 6px 0 0;
        font-size: clamp(15px, 1.5vw, 18px);
        line-height: 1.5;
        opacity: 0.92;
        max-width: 52ch;
      }
      .mh-count {
        margin-top: 10px;
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 12px; font-weight: 800; letter-spacing: 0.14em;
        text-transform: uppercase;
        opacity: 0.85;
      }

      /* ---- grid of tiles ---- */
      .mh-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: clamp(12px, 1.6vw, 18px);
      }
      @media (max-width: 1100px) { .mh-grid { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 760px)  { .mh-grid { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 420px)  { .mh-grid { grid-template-columns: 1fr; } }

      /* ---- tile: neobrutalist-LITE (thinner border, shorter shadow than posters) ---- */
      .mh-tile {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 132px;
        padding: 16px;
        background: #fff;
        color: var(--color-ink-strong);
        border: 2px solid var(--color-ink-strong);
        border-radius: 12px;
        text-decoration: none;
        box-shadow: 4px 4px 0 var(--color-ink-strong);
        transition: transform 120ms cubic-bezier(0.2,0.7,0.3,1),
                    box-shadow 120ms cubic-bezier(0.2,0.7,0.3,1);
      }
      a.mh-tile:hover, a.mh-tile:focus-visible {
        transform: translate(4px, 4px);
        box-shadow: 0 0 0 var(--color-ink-strong);
      }
      a.mh-tile:focus-visible {
        outline: 3px solid var(--color-altus-red);
        outline-offset: 3px;
      }

      .mh-tile-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px; height: 44px;
        border: 2px solid var(--color-ink-strong);
        border-radius: 10px;
        background: #f6f1e6;
        color: var(--color-ink-strong);
      }
      .mh-tile-label {
        font-size: 15px;
        font-weight: 800;
        line-height: 1.25;
        letter-spacing: -0.005em;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .mh-tile-go {
        position: absolute;
        top: 16px; right: 16px;
        opacity: 0.55;
        transition: transform 120ms ease, opacity 120ms ease;
      }
      a.mh-tile:hover .mh-tile-go,
      a.mh-tile:focus-visible .mh-tile-go {
        transform: translate(3px, -3px);
        opacity: 1;
      }

      /* SOON tile: muted, no shadow lift, clearly not actionable */
      .mh-tile-soon {
        background: #faf6ec;
        border-style: dashed;
        box-shadow: 3px 3px 0 rgba(15,23,42,0.22);
        color: var(--color-ink-muted);
        cursor: default;
      }
      .mh-tile-soon .mh-tile-icon {
        border-style: dashed;
        background: transparent;
        color: var(--color-ink-muted);
        opacity: 0.85;
      }
      .mh-tile-soon-tag {
        position: absolute;
        top: 14px; right: 14px;
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 11px; font-weight: 800; letter-spacing: 0.16em;
        padding: 3px 8px;
        border: 2px solid currentColor;
        border-radius: 999px;
      }

      /* ---- per-module accent for the icon chip (banner uses the full tone fill) ---- */
      .mh-red   { background: var(--color-altus-red);  color: #fff; }
      .mh-ink   { background: var(--color-ink-strong); color: #fff; }
      .mh-blue  { background: var(--color-blue-deep);  color: #fff; }
      .mh-green { background: var(--color-green-deep); color: #fff; }
      .mh-amber { background: var(--color-amber);      color: var(--color-ink-strong); }
      .mh-purple{ background: var(--color-purple-deep);color: #fff; }
      /* amber banner is light — keep the mono count + index legible on the fill */
      .mh-amber .mh-count, .mh-amber .mh-banner-index { opacity: 0.9; }

      @media (prefers-reduced-motion: reduce) {
        .mh-back, .mh-tile, .mh-tile-go { transition: none; }
        .mh-back:hover, .mh-back:focus-visible { transform: none; box-shadow: 2px 2px 0 var(--color-ink-strong); }
        a.mh-tile:hover, a.mh-tile:focus-visible { transform: none; box-shadow: 2px 2px 0 var(--color-ink-strong); }
        a.mh-tile:hover .mh-tile-go, a.mh-tile:focus-visible .mh-tile-go { transform: none; }
      }
    `}</style>
  );
}
