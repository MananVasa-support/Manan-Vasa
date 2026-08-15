import * as React from "react";

/* ────────────────────────────────────────────────────────────────────────
   DashboardSectionHeader — the one header block every dashboard widget uses.

   WHY IT EXISTS: each of the eight sections had grown its own masthead, half
   of them INSIDE the widget's white card. Sizes ranged from 17px to 30px and
   three different font stacks, so scanning the page gave no reliable sense of
   which titles were peers. This component fixes the typography in one place
   and, by convention, is rendered ABOVE the card it labels — never inside it —
   so the card holds data and the page holds structure.

   `actions` is the right-hand slot: pagers, window toggles, minimize buttons.
   Controls whose state lives inside the widget stay inside the widget; only
   the ones already owned by the section component move up here.
   ──────────────────────────────────────────────────────────────────────── */

export interface DashboardSectionHeaderProps {
  /** Small category tag above the title, e.g. "Managers · Initiation Scorecards". */
  eyebrow?: React.ReactNode;
  /** Eyebrow tone. "brand" = the Altus red used by the exec sections. */
  eyebrowTone?: "brand" | "muted";
  /** Optional glyph to the left of the title block. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** One line of description under the title. */
  subtitle?: React.ReactNode;
  /** Right-aligned controls (pager, toggles). */
  actions?: React.ReactNode;
  /**
   * Gap to the card below. `mb-4` is the default; pass `mb-3` for the tighter
   * widgets (the two-up grid cards, where vertical room is scarcer).
   */
  className?: string;
}

export function DashboardSectionHeader({
  eyebrow,
  eyebrowTone = "brand",
  icon,
  title,
  subtitle,
  actions,
  className = "mb-3",
}: DashboardSectionHeaderProps) {
  return (
    // items-center (not items-end): the right-hand control cluster is a single
    // 32px square, and bottom-aligning it against a three-line title block left
    // it sitting low. Centred, it reads level with the title whatever the
    // subtitle wraps to.
    <header className={`flex w-full items-center justify-between gap-4 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0">
          {eyebrow && (
            <p
              className={`text-xs font-semibold uppercase tracking-wider ${
                eyebrowTone === "brand" ? "text-rose-600" : "text-gray-500"
              }`}
            >
              {eyebrow}
            </p>
          )}
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-sm font-normal text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
