"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowUpRight,
  PartyPopper,
  LifeBuoy,
  Sparkles,
  LayoutGrid,
  X,
  type LucideIcon,
} from "lucide-react";
import { HR_STAGES, hrItemHref, type HrStage } from "@/lib/hr/lifecycle";

/**
 * HR front door — a premium, light-theme, animated welcome. A "Welcome to HR"
 * hero over a soft aurora canvas, then the employee journey as a card deck
 * (5 stages + Holiday List + Help Desk) that springs in on load and lifts a
 * card on hover.
 *
 * Clicking a STAGE card opens a quick pop-up (not a page) that lets you pick a
 * surface inside that stage — e.g. Pre-Interview → Basic Details · First
 * Assessment · Management Assessment. The utility cards (Holiday, Help Desk)
 * still navigate straight through.
 *
 * NOTE: all motion here is pure CSS (no framer-motion). The `motion/react`
 * barrel takes ~49s to compile cold in dev, which was hanging /hr.
 */

interface Card {
  slug: string;
  title: string;
  Icon: LucideIcon;
  stage?: HrStage; // present → clicking opens the stage pop-up instead of navigating
}

// Every card shares the Altus red + black identity (no rainbow of hues).
const CARDS: Card[] = [
  ...HR_STAGES.map((s) => ({ slug: `/hr/${s.slug}`, title: s.title, Icon: s.Icon, stage: s })),
  { slug: "/holidays", title: "Holiday List", Icon: PartyPopper },
  { slug: "/support", title: "Help Desk", Icon: LifeBuoy },
];

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

// Rendered as a plain static <style> (NOT styled-jsx). styled-jsx's dynamic
// transform (triggered by ${} interpolation) blew up the webpack compile of this
// component into a multi-minute hang; a static string sidesteps the transform.
const LAND_CSS = `
  .hr-land { background: #ffffff; }
  .hr-aurora { position: absolute; border-radius: 9999px; filter: blur(70px); opacity: 0.09; }
  .hr-aurora-a { width: 620px; height: 620px; left: -140px; top: -180px; background: radial-gradient(circle at 30% 30%, rgba(225,6,0,0.28), transparent 70%); animation: hrFloatA 18s ease-in-out infinite; }
  .hr-aurora-b { width: 560px; height: 560px; right: -120px; top: -120px; background: radial-gradient(circle at 60% 40%, rgba(244,114,182,0.30), transparent 70%); animation: hrFloatB 22s ease-in-out infinite; }
  .hr-aurora-c { width: 720px; height: 520px; left: 40%; top: 220px; background: radial-gradient(circle at 50% 50%, rgba(245,158,11,0.18), transparent 70%); animation: hrFloatA 26s ease-in-out infinite reverse; }
  .hr-grain { opacity: 0.5; background-image: radial-gradient(rgba(15,23,42,0.035) 1px, transparent 1px); background-size: 4px 4px; }
  .hr-shine { background: linear-gradient(100deg, ${ACCENT} 0%, ${ACCENT_DEEP} 30%, #ff5a54 55%, ${ACCENT} 100%); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: hrShine 5s linear infinite; }
  .hr-in { animation: hrFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .hr-card-in { animation: hrCardIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes hrShine { to { background-position: 220% 0; } }
  @keyframes hrFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes hrCardIn { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes hrFloatA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,26px) scale(1.06); } }
  @keyframes hrFloatB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-28px,20px) scale(1.08); } }
  @keyframes hrOverlayIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes hrPopIn { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (prefers-reduced-motion: reduce) { .hr-aurora, .hr-shine, .hr-in, .hr-card-in { animation: none !important; } }
`;

export function HrLanding() {
  const [openStage, setOpenStage] = React.useState<HrStage | null>(null);

  // Re-open a stage's pop-up when we return via /hr?open=<slug> (the "Back to
  // Pre-Interview" button on the Basic Details form points here).
  React.useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("open");
    if (!slug) return;
    const s = HR_STAGES.find((x) => x.slug === slug);
    if (s) setOpenStage(s);
  }, []);

  return (
    <div className="hr-land relative min-h-[calc(100dvh-64px)] w-full overflow-hidden">
      {/* Aurora canvas */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hr-aurora hr-aurora-a" />
        <div className="hr-aurora hr-aurora-b" />
        <div className="hr-aurora hr-aurora-c" />
        <div className="hr-grain absolute inset-0" />
      </div>

      {/* Back to Hub — top-left (the rail is hidden on this landing) */}
      <Link
        href={"/hub" as Route}
        className="group absolute left-6 top-5 z-30 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:left-4 max-md:top-4"
        style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
      >
        <LayoutGrid size={15} strokeWidth={2.5} className="transition-transform group-hover:-rotate-6" />
        Back to Hub
      </Link>

      {/* Hero */}
      <div className="mx-auto max-w-[1180px] px-8 max-md:px-5 pt-14 max-md:pt-10 text-center">
        <span
          className="hr-in inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: ACCENT_DEEP, background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 22%, transparent)" }}
        >
          <Sparkles size={13} strokeWidth={2.6} /> Altus · Human Resources
        </span>

        <h1
          className="hr-in mx-auto mt-5 max-w-[16ch] text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 4.4vw, 56px)", letterSpacing: "-0.035em", lineHeight: 1.0, animationDelay: "60ms" }}
        >
          Welcome to{" "}
          <span className="hr-shine relative whitespace-nowrap">HR</span>
        </h1>

        <p
          className="hr-in mx-auto mt-4 max-w-[54ch] font-medium text-ink-muted"
          style={{ fontSize: "clamp(15px, 1.6vw, 18px)", lineHeight: 1.5, animationDelay: "140ms" }}
        >
          The complete employee journey in one room — from the first hello to a warm
          goodbye. Pick a stage to step inside.
        </p>
      </div>

      {/* Cards — 4 in the top row, 3 centred below */}
      <div className="mx-auto mt-10 max-md:mt-8 flex w-full max-w-[1010px] flex-col items-center gap-5 px-6 max-md:px-5 pb-16">
        {[CARDS.slice(0, 4), CARDS.slice(4)].map((row, r) => (
          <div key={r} className="flex flex-wrap justify-center gap-5 max-md:gap-4">
            {row.map((c, i) => {
              const idx = r === 0 ? i : i + 4;
              return (
                <div key={c.slug} className="hr-card-in" style={{ animationDelay: `${120 + idx * 60}ms` }}>
                  <DeckCard card={c} onOpen={c.stage ? () => setOpenStage(c.stage!) : undefined} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Stage pop-up — pick a surface inside the chosen stage */}
      {openStage && <StagePopup stage={openStage} onClose={() => setOpenStage(null)} />}

      <style dangerouslySetInnerHTML={{ __html: LAND_CSS }} />
    </div>
  );
}

function DeckCard({ card, onOpen }: { card: Card; onOpen?: () => void }) {
  const RED = "#E10600";
  const INK = "#18181b";
  const inner = (
    <>
      {/* red highlight glow on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, ${RED} 16%, transparent), transparent 62%)` }}
      />
      <div className="flex flex-1 flex-col items-center justify-center px-3.5 pt-4 text-center">
        <h3
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "-0.015em", lineHeight: 1.12, color: INK }}
        >
          {card.title}
        </h3>
      </div>
      <span className="mt-auto flex items-center justify-between px-4 pb-3.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: INK }}>
          Enter
        </span>
        <ArrowUpRight size={17} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" style={{ color: RED }} />
      </span>
    </>
  );
  const cls = "hr-deck group relative flex flex-col overflow-hidden rounded-[16px] bg-white text-left transition-transform duration-200 hover:-translate-y-2";
  const style: React.CSSProperties = {
    width: 194,
    minHeight: 138,
    border: "2px solid color-mix(in srgb, #E10600 55%, white)",
    boxShadow: "0 10px 26px -14px rgba(24,24,27,0.20), 0 2px 6px -2px rgba(24,24,27,0.10)",
  };

  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={cls} style={style}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={card.slug as Route} className={cls} style={style}>
      {inner}
    </Link>
  );
}

function StagePopup({ stage, onClose }: { stage: HrStage; onClose: () => void }) {
  const RED = "#E10600";
  const RED_DEEP = "#A80400";

  // Close on Escape.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,12,0.5)", backdropFilter: "blur(3px)", animation: "hrOverlayIn 0.18s ease-out both" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[540px] overflow-hidden rounded-[22px] bg-white"
        style={{ boxShadow: "0 40px 100px -30px rgba(15,23,42,0.55)", border: "1px solid color-mix(in srgb, #E10600 22%, white)", animation: "hrPopIn 0.24s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        {/* header */}
        <div className="relative px-6 pt-6 pb-4" style={{ background: "linear-gradient(180deg, color-mix(in srgb, #E10600 7%, white), #ffffff)" }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            Altus · {stage.title}
          </span>
          <h2
            className="mt-2.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.05 }}
          >
            Choose a step
          </h2>
          <p className="mt-1 max-w-[44ch] text-[13.5px] font-medium leading-snug text-ink-muted">{stage.blurb}</p>
        </div>

        {/* options */}
        <div className="grid gap-2.5 p-4 pt-3">
          {stage.items.map((item, i) => {
            const Icon = item.Icon;
            return (
              <Link
                key={item.slug}
                href={hrItemHref(stage.slug, item) as Route}
                onClick={onClose}
                className="group flex items-center gap-3.5 rounded-2xl border border-hairline bg-surface-card px-4 py-3.5 text-left transition-all hover:border-hairline-strong hover:shadow-md"
              >
                <span
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-black text-white"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-bold text-ink-strong">
                    <Icon size={15} strokeWidth={2.2} style={{ color: RED_DEEP }} /> {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] font-medium text-ink-muted">{item.blurb}</span>
                </span>
                <ArrowUpRight size={17} className="shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
