/**
 * <Letterhead> — the reusable, multi-entity Altus letterhead frame.
 *
 * Uses the CLEAN master letterhead strips (public/letterhead/altus-header.png,
 * 1008×225, and altus-footer.png, 1018×92) as crisp <img> layers — the angular
 * red ribbon + logo on top, the contact line + red address bar on the bottom.
 * The middle stays white for the letter/policy body.
 *
 * ── Repeating on EVERY printed page ─────────────────────────────────────────
 * The body sits inside a single-column <table> whose <thead>/<tfoot> are EMPTY
 * spacer bands. Browsers repeat thead/tfoot — AND reserve their height — at the
 * top/bottom of every printed page, so the body text can never slide under the
 * header/footer on page 2+. The artwork itself is `position:fixed` in print so
 * it paints into those reserved bands on each page. This is the bulletproof,
 * cross-browser way to letterhead a multi-page document (works in Chrome print
 * AND the Chromium/puppeteer PDF path).
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
import { getEntity, type Entity, type EntityId } from "@/lib/hr/entities";
import { HR_CONTACT } from "@/lib/hr/firm";

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
  // EVERY entity — Altus included — has its logo baked into its own header strip
  // (opaque JPEG, the SAME image the PDF renderer embeds), so the on-screen
  // letterhead and the exported/issued PDF match pixel-for-pixel. No white-cover
  // / overlay hack, and no divergence between preview and PDF.
  const headerArt = `/letterhead/header-${e.id}.jpg`;

  return (
    <div className={`alh-page${className ? ` ${className}` : ""}`}>
      <style>{LETTERHEAD_CSS}</style>

      {/* ── Header + footer artwork (crisp strips) — absolute on screen,
             FIXED in print so they repeat on every printed page. ─────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="alh-art alh-art-top" src={headerArt} alt="" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="alh-art alh-art-bottom" src={FOOTER_ART} alt="" aria-hidden />
      {/* Code-rendered HR contact line, laid over the baked footer art so the HR
          email + HR Manager phone are always current (sourced from HR_CONTACT in
          lib/hr/firm.ts) without re-baking the PNG. */}
      <div className="alh-footer-contact" aria-label="HR contact">
        <span className="alh-fc-item">HR: {HR_CONTACT.email}</span>
        {HR_CONTACT.phone.trim() && (
          <>
            <span className="alh-fc-dot" aria-hidden>
              ·
            </span>
            <span className="alh-fc-item">HR Manager: {HR_CONTACT.phone.trim()}</span>
          </>
        )}
      </div>

      {/* ── Page frame ───────────────────────────────────────────
             The thead/tfoot are empty spacer bands the browser repeats
             + reserves on EVERY printed page, keeping the body clear of
             the fixed artwork. On screen they simply hold the top/bottom
             margin the header/footer sit in. ─────────────────────────── */}
      <table className="alh-frame">
        <thead>
          <tr>
            <td>
              <div className="alh-head-space" aria-hidden />
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <main className="alh-body">{children}</main>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <div className="alh-foot-space" aria-hidden />
            </td>
          </tr>
        </tfoot>
      </table>
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
  /* Flat document sheet — no curved/cut-off corners on the letter surface. */
  border-radius:0;
}
/* Header + footer artwork — crisp, full-width, natural aspect */
.alh-art{position:absolute;left:0;width:100%;height:auto;display:block;z-index:0;pointer-events:none;}
.alh-art-top{top:0;}
.alh-art-bottom{bottom:0;}
/* Code-rendered HR contact line — sits just above the baked footer strip. */
.alh-footer-contact{
  position:absolute;left:0;right:0;bottom:78px;z-index:4;
  display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;
  padding:0 24px;pointer-events:none;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:10.5px;font-weight:700;letter-spacing:.02em;color:#A80400;
}
.alh-fc-dot{color:#A8040099;font-weight:900;}
/* Per-entity logo swap (non-Altus): white cover wipes the baked-in Altus logo… */
.alh-logo-cover{position:absolute;left:0;top:0;width:140px;height:158px;background:#ffffff;z-index:1;}
/* …then the entity's own logo is pasted in its place. */
.alh-logo{
  position:absolute;left:26px;top:16px;
  height:122px;width:auto;max-width:126px;
  object-fit:contain;display:block;z-index:2;
}
/* Page frame — a single-column table whose head/foot reserve + repeat the
 * header/footer band on every printed page (see file header). */
.alh-frame{position:relative;z-index:3;width:100%;border-collapse:collapse;table-layout:fixed;}
.alh-frame td{padding:0;border:0;vertical-align:top;}
.alh-head-space{height:196px;}
.alh-foot-space{height:100px;}
/* Body */
.alh-body{
  padding:2px 70px 8px;
  font-family:var(--font-display, Georgia, "Times New Roman", serif);
  font-size:15px;line-height:1.72;color:#111114;
  overflow-wrap:break-word;
}
/* Generated-letter prose is JUSTIFIED by default (headings/tables/signature
 * carry their own alignment). Structured paragraphs set an inline text-align
 * that wins where an explicit override (centre/right) is needed. */
.alh-body p{margin:0 0 14px;text-align:left;}
/* Print / PDF — pin header + footer to every printed page; the thead/tfoot
 * spacers keep the body from ever overlapping them. */
@media print{
  @page{size:A4;margin:0;}
  html,body{background:#fff;margin:0;}
  .alh-page{
    box-shadow:none;border-radius:0;margin:0;
    width:auto;min-height:auto;max-width:none;overflow:visible;
  }
  .alh-art-top{position:fixed;top:0;}
  .alh-art-bottom{position:fixed;bottom:0;}
  .alh-footer-contact{position:fixed;bottom:78px;}
  .alh-frame{width:100%;}
  .alh-art,.alh-logo-cover,.alh-logo,.alh-footer-contact{
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
}
`;

export default Letterhead;
