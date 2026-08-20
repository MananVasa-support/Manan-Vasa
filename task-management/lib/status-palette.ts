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

/** Every status colour the dashboard paints, by semantic key. */
export const STATUS_COLORS = {
  /** Neutral baseline for totals and unclassified aggregates. */
  total: "#1e293b", // slate-800
  done: "#059669", // emerald-600
  pending: "#2563eb", // blue-600
  /** One step off Pending: they sit adjacent in the distribution grid, and two
   *  identical fills there read as a rendering fault, not a shared family. */
  initiated: "#1d4ed8", // blue-700
  needInfo: "#881337", // rose-900 — dark crimson
  notApproved: "#dc2626", // red-600 — bright red
  onHold: "#d97706", // amber-600
  notStarted: "#334155", // slate-700
  /** "Not Read". A step off notStarted for the same adjacency reason. */
  notRead: "#475569", // slate-600
  archived: "#64748b", // slate-500
  approved: "#7c3aed", // violet-600
  followUp: "#0891b2", // cyan-600
  /** Retired statuses still present in old rows. */
  retired: "#64748b", // slate-500
} as const;

export type StatusColorKey = keyof typeof STATUS_COLORS;

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
export function statusCardStyle(base: string): {
  background: string;
  border: string;
} {
  return {
    background: statusGradient(base),
    // A low-opacity WHITE border, not a darker shade of the fill: these cards
    // sit on a near-white page, where a dark edge reads as a shadow and makes
    // the card look stuck to the background. The white hairline lifts it.
    border: "1px solid rgba(255,255,255,0.10)",
  };
}

/**
 * The action badge that rides on top of a solid card (the KPI strip's
 * View/Hide pill). Translucent white rather than a solid colour: ONE recipe
 * that keeps its contrast on every fill from slate-800 to emerald-600, with no
 * per-status tuning and nothing to re-check when a colour changes.
 */
export const STATUS_CARD_BADGE =
  "bg-white/15 hover:bg-white/25 text-white backdrop-blur-xs transition-colors";

/** Same badge, in its active/open state — opacity rises, hue never changes. */
export const STATUS_CARD_BADGE_ACTIVE =
  "bg-white/30 hover:bg-white/40 text-white backdrop-blur-xs transition-colors";

/** Type colours for anything sitting on a solid status card. */
export const STATUS_CARD_TEXT = "text-white";
export const STATUS_CARD_SUBTEXT = "text-white/80";
