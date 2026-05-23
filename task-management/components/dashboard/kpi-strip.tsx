import * as React from "react";
import type { Route } from "next";
import { KpiHeroTile, KpiStatusTile, type NeonKey } from "./kpi-card";
import Aurora from "@/components/effects/Aurora";
import type { KpiSet } from "@/lib/types";

interface Entry {
  key: keyof KpiSet;
  label: string;
  sublabel: string;
  neonKey: NeonKey;
  href: Route;
}

const HERO: Entry = {
  key: "total",
  label: "TOTAL",
  sublabel: "All Tasks",
  neonKey: "total",
  href: "/tasks",
};

const STATUS_ITEMS: Entry[] = [
  {
    key: "needHelp",
    label: "NEED HELP",
    sublabel: "Blocked",
    neonKey: "need-help",
    href: "/tasks?status=need_help",
  },
  {
    key: "notApproved",
    label: "NOT APPROVED",
    sublabel: "Sent Back",
    neonKey: "not-approved",
    href: "/tasks?status=not_approved",
  },
  {
    key: "done",
    label: "DONE",
    sublabel: "Done + Approved",
    neonKey: "done",
    href: "/tasks?status=done,approved",
  },
  {
    key: "pending",
    label: "PENDING",
    sublabel: "In Progress",
    neonKey: "pending",
    href: "/tasks?status=initiated,follow_up",
  },
  {
    key: "notStarted",
    label: "NOT STARTED",
    sublabel: "Awaiting Pickup",
    neonKey: "not-started",
    href: "/tasks?status=not_started",
  },
];

export function KpiStrip({ kpis }: { kpis: KpiSet }) {
  return (
    <section
      className="kpi-strip-shell mt-10 mx-auto max-w-[1600px] rounded-[28px] px-12 pt-12 pb-14 max-md:px-4 max-md:pt-6 max-md:pb-8"
      aria-label="Task summary"
    >
      {/* Aurora — WebGL flowing-gradient background (ReactBits/ogl).
          Dialled down to 0.25 so the tile surfaces stay legible; the
          ambient colour still telegraphs the cyan/violet brand voice
          but no longer competes with on-tile text. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: 0.25 }}
        aria-hidden
      >
        <Aurora
          colorStops={["#A78BFA", "#EC4899", "#E10600"]}
          amplitude={0.8}
          blend={0.5}
          speed={0.5}
        />
      </div>
      {/* Subtle grain noise overlay — caps the polish to feel like a
          printed-poster surface rather than flat CSS. */}
      <span className="kpi-strip-grain" aria-hidden />

      <div className="relative z-10 flex flex-col gap-5">
        {/* Hero band — Total */}
        <KpiHeroTile
          index={0}
          neonKey={HERO.neonKey}
          label={HERO.label}
          sublabel={HERO.sublabel}
          value={kpis[HERO.key].current}
          previous={kpis[HERO.key].previous}
          sparkline={kpis[HERO.key].sparkline}
          href={HERO.href}
        />

        {/* Status grid — 5 tiles laid out across a 6-col bus so the row
            never leaves an orphan cell. Top row: 3 cards at col-span-2
            (≈33% wide). Bottom row: 2 cards at col-span-3 (≈50% wide).
            Each card is dramatically bigger than the old 5-up strip,
            with the bottom row featuring the highest-volume statuses.
            On mobile, scroll-snaps horizontally. */}
        <div
          className="grid grid-cols-6 gap-5 max-lg:grid-cols-2 max-sm:flex max-sm:gap-3 max-sm:overflow-x-auto max-sm:snap-x max-sm:snap-mandatory max-sm:[-webkit-overflow-scrolling:touch] max-sm:px-1 max-sm:pb-2"
          role="list"
        >
          {STATUS_ITEMS.map((item, i) => {
            // 0-2 → col-span-2 (3 cards × 2 = 6 cols on top row)
            // 3-4 → col-span-3 (2 cards × 3 = 6 cols on bottom row)
            const spanClass =
              i < 3
                ? "col-span-2 max-lg:col-span-1"
                : "col-span-3 max-lg:col-span-1";
            return (
              <div
                key={item.key}
                role="listitem"
                className={`${spanClass} max-sm:snap-center max-sm:flex-none max-sm:w-[78%]`}
              >
                <KpiStatusTile
                  index={i + 1}
                  neonKey={item.neonKey}
                  label={item.label}
                  sublabel={item.sublabel}
                  value={kpis[item.key].current}
                  previous={kpis[item.key].previous}
                  sparkline={kpis[item.key].sparkline}
                  href={item.href}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
