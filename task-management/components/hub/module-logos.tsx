import * as React from "react";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * Bespoke module logo marks — a PASTEL app-icon per workspace: a soft pastel
 * tile in the module's hue, the mark drawn in the module's DEEP ink so it reads
 * clearly, and a prominent ink outline so the (light) tile never dissolves into
 * the (light) pastel card behind it. Two-tone glyphs use white for the cut-out
 * flash. One source, keyed by WorkspaceId.
 *
 * Each glyph is drawn on a 64×64 tile: `ink` = the deep mark colour, `light` =
 * white for the contrast cut-outs (a check on a shield, a calendar header).
 */

// [pastel-from, pastel-to, deep-ink] per module.
const PAL: Record<WorkspaceId, { from: string; to: string; ink: string }> = {
  wms: { from: "#FFC9C6", to: "#FFA9A5", ink: "#B4160E" },
  goals: { from: "#FBDCA8", to: "#F6C877", ink: "#8A3D12" },
  admin: { from: "#C7DAFC", to: "#A7C5FA", ink: "#1D4ED8" }, // blue (matches the Accounts card)
  employees: { from: "#BAEFCC", to: "#98E6B3", ink: "#157A41" },
  hr: { from: "#B5F0E5", to: "#89E4D3", ink: "#0F766E" },
  sales: { from: "#DDCAFA", to: "#C4AAF6", ink: "#5B21B6" }, // violet (matches the Sales card)
  training: { from: "#F9C9E0", to: "#F5A9CE", ink: "#BE185D" }, // pink (matches the Training card)
  events: { from: "#B6EAF4", to: "#8ADBEC", ink: "#0E7490" },
  accounts: { from: "#C7DAFC", to: "#A7C5FA", ink: "#1D4ED8" }, // blue
};

function Glyph({ id, ink, light }: { id: WorkspaceId; ink: string; light: string }) {
  switch (id) {
    // WMS — a 2×2 work dashboard, tiles fading back for depth.
    case "wms":
      return (
        <g fill={ink}>
          <rect x="16" y="16" width="14" height="14" rx="3.6" />
          <rect x="34" y="16" width="14" height="14" rx="3.6" opacity="0.72" />
          <rect x="16" y="34" width="14" height="14" rx="3.6" opacity="0.72" />
          <rect x="34" y="34" width="14" height="14" rx="3.6" opacity="0.48" />
        </g>
      );
    // Goals — a clean filled bullseye.
    case "goals":
      return (
        <g>
          <circle cx="32" cy="32" r="15.5" fill={ink} />
          <circle cx="32" cy="32" r="10" fill={light} />
          <circle cx="32" cy="32" r="4.4" fill={ink} />
        </g>
      );
    // Admin — a control-room shield with a bold white check.
    case "admin":
      return (
        <g>
          <path d="M32 14 L47.5 19.5 V32.5 C47.5 41.2 40.8 46.8 32 49.8 C23.2 46.8 16.5 41.2 16.5 32.5 V19.5 Z" fill={ink} />
          <path d="M25.5 32 l4.9 4.9 L40.5 26.4" fill="none" stroke={light} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    // Employees — two people, front solid, back softened.
    case "employees":
      return (
        <g fill={ink}>
          <g opacity="0.62">
            <circle cx="41" cy="25.5" r="6" />
            <path d="M31.5 47 c0-6.6 4.4-10.6 9.5-10.6 s9.5 4 9.5 10.6 z" />
          </g>
          <circle cx="25" cy="27" r="7.2" />
          <path d="M13.5 49 c0-7.6 5.2-11.8 11.5-11.8 s11.5 4.2 11.5 11.8 z" />
        </g>
      );
    // Sales — ascending bars under a bold rising trend arrow.
    case "sales":
      return (
        <g>
          <g fill={ink}>
            <rect x="15.5" y="37" width="8" height="12" rx="2.2" />
            <rect x="28" y="30" width="8" height="19" rx="2.2" opacity="0.82" />
            <rect x="40.5" y="22" width="8" height="27" rx="2.2" opacity="0.66" />
          </g>
          <path d="M16 31 L29 24 L37 28 L48 16.5" fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M40.5 16.5 L48 16.5 L48 24" fill="none" stroke={ink} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    // HR — an ID badge on a lanyard clip: portrait + shoulders cut out in white.
    case "hr":
      return (
        <g>
          <rect x="28.4" y="12.5" width="7.2" height="9" rx="2.6" fill={ink} />
          <rect x="16.5" y="18.5" width="31" height="32.5" rx="6.5" fill={ink} />
          <circle cx="32" cy="30.5" r="4.8" fill={light} />
          <path d="M23.8 44.5 c0-5 3.6-7.8 8.2-7.8 s8.2 2.8 8.2 7.8 z" fill={light} />
        </g>
      );
    // Training — a graduation mortarboard with a tassel.
    case "training":
      return (
        <g fill={ink}>
          <path d="M32 17.5 L52 27 L32 36.5 L12 27 Z" />
          <path d="M21 31.5 V40.5 C21 44 26 46.5 32 46.5 C38 46.5 43 44 43 40.5 V31.5 L32 36.7 Z" opacity="0.82" />
          <path d="M52 27 V39.5" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="52" cy="41.5" r="2.7" />
        </g>
      );
    // Events — a calendar with a white header + highlighted day.
    case "events":
      return (
        <g>
          <rect x="21" y="14.5" width="3.8" height="9" rx="1.9" fill={ink} />
          <rect x="39.2" y="14.5" width="3.8" height="9" rx="1.9" fill={ink} />
          <rect x="14" y="19" width="36" height="31" rx="6.5" fill={ink} />
          <rect x="14" y="19" width="36" height="10" rx="6.5" fill={light} />
          <g fill={light}>
            <circle cx="22.5" cy="37" r="2.3" />
            <circle cx="32" cy="37" r="2.3" />
            <circle cx="22.5" cy="44.5" r="2.3" />
            <rect x="37.5" y="34.5" width="6.5" height="6.5" rx="2" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

export function ModuleLogo({ id, size = 56, className }: { id: WorkspaceId; size?: number; className?: string }) {
  const { from, to, ink } = PAL[id] ?? PAL.wms;
  const gid = `mlogo-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={className}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={`${gid}-bg`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${gid}-sheen`} x1="32" y1="2" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* pastel tile + soft top sheen */}
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${gid}-bg)`} />
      <rect x="3" y="3" width="58" height="58" rx="15" fill={`url(#${gid}-sheen)`} />
      {/* prominent ink outline so the pastel tile never dissolves into the card */}
      <rect x="3" y="3" width="58" height="58" rx="15" fill="none" stroke={ink} strokeOpacity="0.9" strokeWidth="2.4" />
      <Glyph id={id} ink={ink} light="#ffffff" />
    </svg>
  );
}
