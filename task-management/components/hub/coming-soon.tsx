import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Hammer } from "lucide-react";

/**
 * Neobrutalist "Coming soon" shell for the unbuilt Hub workspaces (Sales /
 * Marketing / Training). Pure Server Component + scoped CSS — same ink-border +
 * hard-offset-shadow language as the Hub cards, so the unbuilt rooms still feel
 * like part of the switchboard. The only action is "Back to hub".
 */
export function ComingSoon({
  index,
  module,
  line,
  tone,
}: {
  index: string;
  module: string;
  line: string;
  tone: "hub-green" | "hub-amber" | "hub-purple";
}) {
  return (
    <main className="cs-root">
      <ComingSoonStyles />
      <div className={`cs-panel ${tone}`}>
        <span className="cs-top">
          <span className="cs-index">{index}</span>
          <span className="cs-tag">SOON</span>
        </span>
        <Hammer className="cs-icon" strokeWidth={2.2} aria-hidden />
        <h1 className="cs-title">{module}</h1>
        <p className="cs-line">{line}</p>
        <Link href={"/hub" as Route} className="cs-back">
          <ArrowLeft size={16} strokeWidth={3} aria-hidden />
          Back to hub
        </Link>
      </div>
    </main>
  );
}

function ComingSoonStyles() {
  return (
    <style>{`
      .cs-root {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: clamp(20px, 5vw, 56px);
        background:
          radial-gradient(120% 120% at 0% 0%, #fdfaf3 0%, #f6f1e6 55%, #efe8d8 100%);
        font-family: var(--font-sans), system-ui, sans-serif;
      }
      .cs-panel {
        position: relative;
        width: min(560px, 100%);
        padding: clamp(28px, 5vw, 48px);
        border: 3px solid var(--color-ink-strong);
        border-radius: 18px;
        box-shadow: 10px 10px 0 var(--color-ink-strong);
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 18px;
      }
      .cs-top { display: flex; align-items: center; gap: 12px; }
      .cs-index {
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 15px; font-weight: 700; letter-spacing: 0.12em; opacity: 0.85;
      }
      .cs-tag {
        font-family: var(--font-mono-display), ui-monospace, monospace;
        font-size: 12px; font-weight: 800; letter-spacing: 0.18em;
        padding: 4px 10px;
        border: 2.5px solid currentColor;
        border-radius: 999px;
        background: rgba(0,0,0,0.16);
      }
      .cs-icon { width: 48px; height: 48px; }
      .cs-title {
        font-family: var(--font-display, var(--font-serif), Georgia, serif);
        margin: 4px 0 0;
        font-size: clamp(40px, 8vw, 64px);
        line-height: 0.95;
        letter-spacing: -0.03em;
        font-weight: 800;
        text-transform: uppercase;
      }
      .cs-line { margin: 0; font-size: clamp(15px, 1.6vw, 18px); line-height: 1.5; opacity: 0.92; max-width: 36ch; }

      .cs-back {
        margin-top: 8px;
        display: inline-flex; align-items: center; gap: 8px;
        background: #fff;
        color: var(--color-ink-strong);
        border: 2.5px solid var(--color-ink-strong);
        border-radius: 12px;
        padding: 11px 18px;
        font-size: 15px; font-weight: 800; letter-spacing: 0.01em;
        text-decoration: none;
        box-shadow: 5px 5px 0 var(--color-ink-strong);
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .cs-back:hover, .cs-back:focus-visible {
        transform: translate(3px, 3px);
        box-shadow: 2px 2px 0 var(--color-ink-strong);
      }
      .cs-back:focus-visible { outline: 3px solid var(--color-altus-red); outline-offset: 3px; }

      .hub-green { background: var(--color-green-deep); color: #fff; }
      .hub-amber { background: var(--color-amber); color: var(--color-ink-strong); }
      .hub-amber .cs-tag { background: rgba(15,23,42,0.12); }
      .hub-purple{ background: var(--color-purple-deep); color: #fff; }

      @media (prefers-reduced-motion: reduce) {
        .cs-back { transition: none; }
        .cs-back:hover, .cs-back:focus-visible {
          transform: none;
          box-shadow: 2px 2px 0 var(--color-ink-strong);
        }
      }
    `}</style>
  );
}
