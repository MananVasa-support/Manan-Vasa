/**
 * THE STATUS PALETTE — one source for every surface that paints a status as a
 * solid coloured card: the Task Summary KPI strip, the Status Distribution
 * tiles and ribbon, and anything added beside them.
 *
 * It exists because the two existing surfaces had already drifted, and drifted
 * in the worst possible way: Task Summary painted NEED INFO bright red and NOT
 * APPROVED dark red, while Status Distribution painted them the other way
 * round. The same two statuses, inverted between two widgets on the same
 * screen. Nobody set out to do that — each widget just picked its own hex, and
 * a second copy of a palette is how a colour system dies.
 *
 * So: no surface defines a status colour any more. They read from here.
 */

/** Every status colour the dashboard paints, by semantic key.
 *
 *  THE SIX TASK-SUMMARY KEYS ARE PASTELS. They used to be fully saturated
 *  (slate-800, emerald-600, rose-900, red-600) and every consumer assumed white
 *  type would sit on them. Pastels invert that for four of the six, so the ink
 *  is no longer a constant — see STATUS_INK below, and never hardcode
 *  `text-white` against one of these fills again.
 *
 *  The remaining keys are untouched saturated values. Nothing renders them
 *  today (the KPI strip is this file's only consumer); if the Status
 *  Distribution tiles return, they need their own pass through this list rather
 *  than inheriting a half-pastel palette. */
export const STATUS_COLORS = {
  /** Neutral baseline for totals and unclassified aggregates. Lavender. */
  total: "#CFC6D9",
  /** Light vanilla / cream. */
  done: "#F2E0D4",
  /** Warm terracotta / dusty rose. */
  pending: "#D9ABA0",
  /** One step off Pending: they sit adjacent in the distribution grid, and two
   *  identical fills there read as a rendering fault, not a shared family. */
  initiated: "#1d4ed8", // blue-700
  /** Muted slate / charcoal. NOTE: deliberately the SAME hex as `notStarted`.
   *  They are not adjacent in the summary strip, but the two are now
   *  indistinguishable by colour alone — the label is the only thing that
   *  tells them apart. */
  needInfo: "#71788B",
  /** Soft peach / warm sand. */
  notApproved: "#F2C6A1",
  onHold: "#d97706", // amber-600
  /** Muted slate / charcoal — see the note on `needInfo`. */
  notStarted: "#71788B",
  /** "Not Read". A step off notStarted for the same adjacency reason. */
  notRead: "#475569", // slate-600
  archived: "#64748b", // slate-500
  approved: "#7c3aed", // violet-600
  followUp: "#0891b2", // cyan-600
  /** Retired statuses still present in old rows. */
  retired: "#64748b", // slate-500
} as const;

export type StatusColorKey = keyof typeof STATUS_COLORS;

/**
 * Which ink a fill carries — the half of the palette that used to be a global
 * constant.
 *
 * `"dark"` = slate-900 type on a light pastel; `"light"` = white type on a
 * mid/dark fill. This is a PROPERTY OF THE FILL, so it lives beside the hex:
 * change a colour above and its ink follows, instead of the two being edited in
 * different files a week apart.
 */
export type StatusInk = "dark" | "light";

export const STATUS_INK: Record<StatusColorKey, StatusInk> = {
  total: "dark",
  done: "dark",
  pending: "dark",
  initiated: "light",
  needInfo: "light",
  notApproved: "dark",
  onHold: "light",
  notStarted: "light",
  notRead: "light",
  archived: "light",
  approved: "light",
  followUp: "light",
  retired: "light",
};

/** Multiply a #rrggbb toward black. `amount` is a 0..1 fraction. */
function darken(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const full =
    n.length === 3
      ? n
          .split("")
          .map((c) => c + c)
          .join("")
      : n;
  const v = parseInt(full, 16);
  const scale = (channel: number) => Math.max(0, Math.round(channel * (1 - amount)));
  const r = scale((v >> 16) & 0xff);
  const g = scale((v >> 8) & 0xff);
  const b = scale(v & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * The card fill: a 135deg two-stop gradient from the base to 10% darker.
 *
 * A flat saturated block at card size is genuinely tiring to look at — there is
 * no shading anywhere for the eye to rest against, so the colour reads as
 * louder than it is. Ten percent is deliberately small: enough to give the
 * surface a direction, not enough to read as a separate colour or to drag the
 * bottom corner below the contrast the white type needs.
 */
export function statusGradient(base: string): string {
  return `linear-gradient(135deg, ${base}, ${darken(base, 0.1)})`;
}

/** Inline style for a solid status card — gradient fill plus the hairline. */
export function statusCardStyle(
  base: string,
  ink: StatusInk = "light",
): { background: string; border: string } {
  return {
    background: statusGradient(base),
    // THE HAIRLINE FOLLOWS THE INK. On a dark fill a low-opacity white edge
    // lifts the card off the near-white page, where a dark edge would read as a
    // shadow gluing it down. On a PASTEL fill that same white edge is invisible
    // and the card melts into the page, so a light fill takes a faint slate
    // edge instead — the only thing giving it an outline.
    border:
      ink === "dark"
        ? "1px solid rgba(15,23,42,0.10)"
        : "1px solid rgba(255,255,255,0.10)",
  };
}

/**
 * The action badge that rides on top of a solid card (the KPI strip's View/Hide
 * pill), plus the type colours that go with each ink.
 *
 * Translucent BLACK on the pastels rather than a solid colour: one recipe per
 * ink family that holds its contrast across every fill in that family, with no
 * per-status tuning and nothing to re-check when a colour changes.
 *
 * NO `dark:` VARIANT on the badge. These cards are painted a fixed hex that
 * does not follow the OS theme, so `dark:bg-white/10` would swap the pill to
 * near-white ON A PASTEL — invisible — the moment someone's system flipped to
 * dark. (This app has no dark theme at all; see the note on DASHBOARD_CARD in
 * components/dashboard/section-chrome.tsx.)
 */
export const STATUS_CARD_INK: Record<
  StatusInk,
  { text: string; subtext: string; badge: string; badgeActive: string; ring: string }
> = {
  dark: {
    text: "text-slate-900",
    subtext: "text-slate-900",
    badge: "bg-black/10 hover:bg-black/20 text-slate-900 backdrop-blur-xs transition-colors",
    badgeActive:
      "bg-black/20 hover:bg-black/30 text-slate-900 backdrop-blur-xs transition-colors",
    ring: "ring-slate-900/30",
  },
  light: {
    text: "text-white",
    subtext: "text-white",
    badge: "bg-black/15 hover:bg-black/25 text-white backdrop-blur-xs transition-colors",
    badgeActive: "bg-black/30 hover:bg-black/40 text-white backdrop-blur-xs transition-colors",
    ring: "ring-white/70",
  },
};

/** The ink bundle for a palette key — fill and type resolved together. */
export function statusCardInk(key: StatusColorKey) {
  return STATUS_CARD_INK[STATUS_INK[key]];
}
