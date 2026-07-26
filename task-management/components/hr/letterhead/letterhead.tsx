/**
 * <Letterhead> — the reusable, multi-entity Altus letterhead frame.
 *
 * Uses the CLEAN master letterhead strips (public/letterhead/altus-header.png,
 * 1008×225, and altus-footer.png, 1018×92) as crisp <img> layers — the angular
 * red ribbon + logo on top, the contact line + red address bar on the bottom.
 * The middle stays white for the letter/policy body. Because header + footer are
 * their own fixed layers, they repeat correctly across pages when a long policy
 * prints.
 *
 * Per-entity branding: the header strip carries the Altus Corp logo. For a
 * NON-Altus paying entity we lay a white cover over that baked-in logo and paste
 * the entity's OWN logo in its place (so it REPLACES, never overlaps). Altus Corp
 * uses the baked-in logo as-is.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *   <Letterhead entity="gainmakers"> …body… </Letterhead>
 *   <Letterhead>                        // → Altus Corp (default)
 *
 * PURE presentational SERVER component. A4 page, print/PDF friendly. Load-neutral.
 */

import type { ReactNode } from "react";
import { getEntity, DEFAULT_ENTITY_ID, type Entity, type EntityId } from "@/lib/hr/entities";

const HEADER_ART = "/letterhead/altus-header.png";
const FOOTER_ART = "/letterhead/altus-footer.png";

export interface LetterheadProps {
  /** Which paying entity brands this page. Defaults to Altus Corp. */
  entity?: EntityId | Entity | string | null;
  /** The letter / policy body. */
  children: ReactNode;
  /** Extra classes on the outer A4 page frame. */
  className?: string;
}

export function Letterhead({ entity, children, className }: LetterheadProps) {
  const e = getEntity(entity ?? null);
  const overlayLogo = e.id !== DEFAULT_ENTITY_ID;

  return (
    <div className={`alh-page${className ? ` ${className}` : ""}`}>
      <style>{LETTERHEAD_CSS}</style>

      {/* ── Header artwork (crisp strip) ───────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="alh-art alh-art-top" src={HEADER_ART} alt="" aria-hidden />
      {overlayLogo && (
        <>
          <span className="alh-logo-cover" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="alh-logo" src={e.logo} alt={`${e.displayName} logo`} />
        </>
      )}

      {/* ── Body ───────────────────────────────────────────────── */}
      <main className="alh-body">{children}</main>

      {/* ── Footer artwork (crisp strip) ───────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="alh-art alh-art-bottom" src={FOOTER_ART} alt="" aria-hidden />
    </div>
  );
}

/* Header strip renders ~177px tall at 794px page width; footer ~72px. The logo in
 * the strip sits in the top-left ~140px; the red ribbon only starts past that, so
 * the white cover (for non-Altus entities) never touches the ribbon. */
const LETTERHEAD_CSS = `
.alh-page{
  position:relative;
  width:794px;
  max-width:100%;
  min-height:1123px;
  margin:0 auto;
  background:#ffffff;
  color:#111114;
  box-shadow:0 30px 80px -34px rgba(15,23,42,.35);
  overflow:hidden;
  border-radius:4px;
}
/* Header + footer artwork — crisp, full-width, natural aspect */
.alh-art{position:absolute;left:0;width:100%;height:auto;display:block;z-index:0;pointer-events:none;}
.alh-art-top{top:0;}
.alh-art-bottom{bottom:0;}
/* Per-entity logo swap (non-Altus): white cover wipes the baked-in Altus logo… */
.alh-logo-cover{position:absolute;left:0;top:0;width:140px;height:158px;background:#ffffff;z-index:1;}
/* …then the entity's own logo is pasted in its place. */
.alh-logo{
  position:absolute;left:26px;top:16px;
  height:122px;width:auto;max-width:126px;
  object-fit:contain;display:block;z-index:2;
}
/* Body */
.alh-body{
  position:relative;z-index:3;
  padding:198px 70px 104px;
  font-family:var(--font-display, Georgia, "Times New Roman", serif);
  font-size:15px;line-height:1.72;color:#111114;
}
.alh-body p{margin:0 0 14px;}
/* Print / PDF — pin header + footer to every printed page */
@media print{
  @page{size:A4;margin:0;}
  html,body{background:#fff;margin:0;}
  .alh-page{
    box-shadow:none;border-radius:0;margin:0;
    width:auto;min-height:auto;max-width:none;
  }
  .alh-art-top{position:fixed;top:0;}
  .alh-art-bottom{position:fixed;bottom:0;}
  .alh-body{padding-top:190px;padding-bottom:96px;}
  .alh-art,.alh-logo-cover,.alh-logo{
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
}
`;

export default Letterhead;
