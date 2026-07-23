import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { applyMerge } from "./merge";
import type { CtcFields, DocSignature, GrowthStep } from "./types";

/**
 * HR Letters / Documents engine — Phase 2 RENDERER (Node-only, pdfkit).
 *
 * Two pure renderers that turn a template + merged values (or a structured CTC
 * row) into a print-ready A4 PDF Buffer wearing the FIXED Altus frame:
 *   · brand stripe + full-page border + faint watermark (drawChrome-style)
 *   · ALTUS CORP masthead with embedded logo
 *   · red title band
 *   · the resolved editable body (basic markdown: **bold**, - bullets, blanks)
 *   · a signature / e-sign / acknowledgement footer block
 *   · a system audit footer
 *
 * These are plain (non-"use server") helpers so they can export sync functions +
 * types; the action layer (app/(app)/hr-docs/*) imports and calls them. Every
 * asset read is guarded — a missing logo / mark never breaks a document.
 */

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#404040",
  inkSoft: "#525252",
  inkFaint: "#A3A3A3",
  hairline: "#E5E5E5",
  hairlineStrong: "#D4D4D4",
  brand: "#E10600",
  brandDeep: "#A80400",
  netTint: "#FDECEA",
} as const;

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const MARK_PATH = path.join(process.cwd(), "public", "logo-mark.png");

const COMPANY = "Altus Corp";

/** Rupees, Indian grouping, no decimals. "Rs " prefix — pdfkit Helvetica has no
 *  ₹ glyph (renders as "¹"), so every money figure spells it "Rs". */
function inr(n: number): string {
  return "Rs " + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** Parse a numeric-as-string money field to a number (0 when empty/garbage). */
function money(s: string | number | null | undefined): number {
  if (s === null || s === undefined) return 0;
  const n = typeof s === "number" ? s : parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** RENDER RULE helper — a numeric field is "present" only when non-zero. */
function hasMoney(s: string | number | null | undefined): boolean {
  return money(s) !== 0;
}

function fmtStamp(d: Date): string {
  return format(d, "EEE, dd MMM yyyy · HH:mm");
}

/** "dd MMMM yyyy" for a YYYY-MM-DD ISO date, else the raw string. */
function fmtIsoDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "dd MMMM yyyy");
}

/* ------------------------------------------------------------------ */
/* Shared A4 chrome — border · watermark · brand stripe · masthead      */
/* ------------------------------------------------------------------ */

interface DocHandle {
  doc: PDFKit.PDFDocument;
  done: Promise<Buffer>;
}

function newDoc(meta: { title: string; subject: string }): DocHandle {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: 56,
    info: { Title: meta.title, Author: "Altus Corp Dashboard", Subject: meta.subject },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return { doc, done };
}

/** Full-page border + faint watermark + brand stripe. Redrawn on every page. */
function drawChrome(doc: PDFKit.PDFDocument): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(1)
    .rect(left - 16, 26, width + 32, doc.page.height - 52)
    .stroke()
    .restore();

  if (existsSync(MARK_PATH)) {
    try {
      const wm = 360;
      doc.save();
      doc.opacity(0.05);
      doc.image(MARK_PATH, doc.page.width / 2 - wm / 2, doc.page.height / 2 - wm / 2, {
        width: wm,
      });
      doc.opacity(1);
      doc.restore();
    } catch {
      /* missing/corrupt asset → no watermark */
    }
  }

  doc.save().rect(0, 0, doc.page.width, 5).fill(COLORS.brand).restore();
  doc.save().rect(0, 5, doc.page.width, 1.2).fill(COLORS.brandDeep).restore();
}

/** ALTUS CORP masthead (logo + name + subline). Advances doc.y past a hairline. */
function drawMasthead(doc: PDFKit.PDFDocument, subline: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const headerTop = doc.page.margins.top + 2;
  const LOGO_H = 44;

  if (existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, left, headerTop, { height: LOGO_H });
    } catch {
      /* text-only masthead */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(COLORS.ink)
    .text(COMPANY.toUpperCase(), left, headerTop + 2, {
      width,
      align: "right",
      characterSpacing: 0.4,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text(subline, left, headerTop + 22, {
      width,
      align: "right",
      characterSpacing: 1.2,
      lineBreak: false,
    });

  const mastheadBottom = headerTop + Math.max(LOGO_H, 34) + 8;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.6)
    .moveTo(left, mastheadBottom)
    .lineTo(right, mastheadBottom)
    .stroke()
    .restore();
  doc.y = mastheadBottom + 16;
}

/** Red title band with an optional right caption. Advances doc.y. */
function drawTitleBand(doc: PDFKit.PDFDocument, title: string, rightCaption?: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const titleY = doc.y;
  doc.save().rect(left, titleY, width, 30).fill(COLORS.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .fillColor("#FFFFFF")
    .text(title.toUpperCase(), left + 12, titleY + 9, {
      width: width - (rightCaption ? 150 : 24),
      characterSpacing: 0.7,
      lineBreak: false,
      ellipsis: true,
    });
  if (rightCaption) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#FFFFFF")
      .text(rightCaption, left, titleY + 11, {
        width: width - 12,
        align: "right",
        lineBreak: false,
      });
  }
  doc.y = titleY + 30 + 16;
}

/** Small uppercase section heading with a hairline under it. */
function drawSectionHeading(doc: PDFKit.PDFDocument, label: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.brandDeep)
    .text(label.toUpperCase(), left, doc.y, { characterSpacing: 0.7, lineBreak: false });
  doc.y += 13;
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(0.8)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 8;
}

/** System footer on the LAST page: hairline + generated stamp. */
function drawFooter(doc: PDFKit.PDFDocument, prefix: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const footerY = doc.page.height - doc.page.margins.bottom - 22;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.5)
    .moveTo(left, footerY - 10)
    .lineTo(right, footerY - 10)
    .stroke()
    .restore();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.inkFaint)
    .text(`${prefix} · Generated ${fmtStamp(new Date())}`, left, footerY, {
      width,
      lineBreak: false,
    });
}

/* ------------------------------------------------------------------ */
/* Basic markdown-ish body rendering                                    */
/* ------------------------------------------------------------------ */

/** Render one line with inline **bold** runs, honouring an optional x + width. */
function drawInline(
  doc: PDFKit.PDFDocument,
  line: string,
  x: number,
  width: number,
  opts: { size: number; color: string; align?: "left" | "justify"; lineGap?: number },
): void {
  const segments = line.split("**");
  // Even indices = normal, odd = bold (paired ** toggles).
  doc.fontSize(opts.size).fillColor(opts.color);
  let started = false;
  segments.forEach((seg, i) => {
    const bold = i % 2 === 1;
    const last = i === segments.length - 1;
    // Skip empty non-terminal segments (e.g. a leading "**"): they carry no
    // glyphs. The terminal empty segment IS emitted so the run is closed
    // (continued:false) and doc.y advances past the paragraph.
    if (seg === "" && !last) return;
    const isFirst = !started;
    started = true;
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .text(seg, isFirst ? x : undefined, isFirst ? doc.y : undefined, {
        width,
        align: opts.align ?? "left",
        lineGap: opts.lineGap ?? 2,
        continued: !last,
      });
  });
  // A wholly-empty line still needs to advance the cursor by one line.
  if (!started) {
    doc.font("Helvetica").text("", x, doc.y, { width });
  }
}

/**
 * Render an editable body (markdown-ish): blank lines → paragraph gaps,
 * "- " / "* " / "• " → bullets, "1. " → numbered, "**bold**" inline, "# " →
 * subheading. Everything else is a normal justified paragraph line.
 */
function drawBody(doc: PDFKit.PDFDocument, body: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      doc.y += 7;
      continue;
    }

    // Subheading "# ..." or "## ..."
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    if (heading) {
      doc.y += 2;
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.ink)
        .text(heading[1] ?? "", left, doc.y, { width, lineGap: 2 });
      doc.y += 4;
      continue;
    }

    // Bullet "- " / "* " / "• "
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      const bx = left + 10;
      const bw = width - 12;
      const top = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(COLORS.brand)
        .text("•", left, top, { width: 8, lineBreak: false });
      doc.y = top;
      drawInline(doc, bullet[1] ?? "", bx, bw, { size: 10, color: COLORS.inkMuted, lineGap: 2 });
      doc.y += 3;
      continue;
    }

    // Numbered "1. ..."
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      const bx = left + 20;
      const bw = width - 22;
      const top = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(COLORS.brandDeep)
        .text(`${numbered[1]}.`, left, top, { width: 16, lineBreak: false });
      doc.y = top;
      drawInline(doc, numbered[2] ?? "", bx, bw, { size: 10, color: COLORS.inkMuted, lineGap: 2 });
      doc.y += 3;
      continue;
    }

    // Normal paragraph line.
    drawInline(doc, line, left, width, {
      size: 10.5,
      color: COLORS.inkMuted,
      align: "left",
      lineGap: 3,
    });
    doc.y += 2;
  }
}

/* ------------------------------------------------------------------ */
/* renderLetterPdf — text / certificate / policy documents              */
/* ------------------------------------------------------------------ */

/** Describes the footer treatment a letter gets, based on its signature model. */
export interface LetterSignatureBlock {
  /** 'none' | 'acknowledge' | 'esign' — from the document type. */
  signature: DocSignature;
  /** the recipient / signer display name (employee or candidate). */
  recipientName?: string;
  /** issuing HR person's name (for the "For Altus Corp" authorised line). */
  hrName?: string;
  /** letter date (already formatted, e.g. "23 July 2026"). */
  date?: string;
  /** place of issue. */
  place?: string;
}

export interface RenderLetterInput {
  template: {
    title: string;
    /** HR category key (drives nothing visual beyond the caption). */
    category?: string;
    signature: DocSignature;
    /** 'text' | 'structured' | 'certificate' — 'certificate' centres the body. */
    content?: string;
  };
  /** editable body_md (with {{merge}} tokens) — substituted here via mergeMap. */
  bodyMd: string;
  /** resolved {{field}} → value map (see lib/hr-docs/merge.ts resolveMerge). */
  mergeMap: Record<string, string>;
  signatureBlock: LetterSignatureBlock;
}

/**
 * Render a text / certificate / policy letter to a print-ready PDF Buffer:
 * fixed Altus frame + the resolved editable body + a signature-model-aware
 * footer (typed signature line for e-sign, acknowledgement line for policies,
 * authorised-signatory block otherwise).
 */
export async function renderLetterPdf(input: RenderLetterInput): Promise<Buffer> {
  const { doc, done } = newDoc({
    title: input.template.title,
    subject: `Altus Corp · ${input.template.title}`,
  });

  doc.on("pageAdded", () => drawChrome(doc));
  drawChrome(doc);
  drawMasthead(doc, "HUMAN RESOURCES");

  const caption = input.signatureBlock.date ? input.signatureBlock.date : undefined;
  drawTitleBand(doc, input.template.title, caption);

  const resolvedBody = applyMerge(input.bodyMd, input.mergeMap);
  const isCertificate = input.template.content === "certificate";

  if (isCertificate) {
    // Certificates read as a centred, airy citation.
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    doc.y += 12;
    for (const raw of resolvedBody.replace(/\r\n/g, "\n").split("\n")) {
      const line = raw.trim();
      if (line === "") {
        doc.y += 8;
        continue;
      }
      drawInline(doc, line, left, width, {
        size: 11,
        color: COLORS.inkMuted,
        align: "left",
        lineGap: 4,
      });
      doc.y += 4;
    }
  } else {
    drawBody(doc, resolvedBody);
  }

  doc.y += 14;
  drawLetterFooter(doc, input.signatureBlock);
  drawFooter(doc, `${input.template.title} · ${COMPANY}`);

  doc.end();
  return done;
}

/** The signature-model-aware footer for a letter. */
function drawLetterFooter(doc: PDFKit.PDFDocument, block: LetterSignatureBlock): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const name = (block.recipientName ?? "").trim();

  if (block.signature === "esign") {
    drawSectionHeading(doc, "Signature");
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.inkSoft)
      .text(
        "This document is to be e-signed via DigiLocker (Aadhaar e-KYC). Once signed, a verified signature block is appended and archived.",
        left,
        doc.y,
        { width, lineGap: 2 },
      );
    doc.y += 24;
    // Ruled signature line for the recipient.
    doc
      .save()
      .strokeColor(COLORS.ink)
      .lineWidth(0.8)
      .moveTo(left, doc.y)
      .lineTo(left + 240, doc.y)
      .stroke()
      .restore();
    doc.y += 5;
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(name || "Signature", left, doc.y, { lineBreak: false });
    doc.y += 14;
    return;
  }

  if (block.signature === "acknowledge") {
    drawSectionHeading(doc, "Acknowledgement");
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.inkSoft)
      .text(
        `I, ${name || "____________"}, confirm that I have read, understood and agree to abide by the terms set out above.`,
        left,
        doc.y,
        { width, lineGap: 2 },
      );
    doc.y += 26;
    doc
      .save()
      .strokeColor(COLORS.ink)
      .lineWidth(0.8)
      .moveTo(left, doc.y)
      .lineTo(left + 220, doc.y)
      .stroke()
      .restore();
    doc.y += 5;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.inkSoft)
      .text("Signature & Date", left, doc.y, { lineBreak: false });
    doc.y += 14;
    return;
  }

  // 'none' — authorised signatory block on the right for issued letters.
  const blockW = 240;
  const x = right - blockW;
  const top = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(COLORS.ink)
    .text(`For ${COMPANY}`, x, top, { width: blockW, lineBreak: false });
  let y = top + 40;
  doc.save().rect(x, y, blockW, 1.6).fill(COLORS.brand).restore();
  y += 8;
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(COLORS.ink)
    .text(block.hrName || "Authorised Signatory", x, y, { width: blockW, lineBreak: false });
  y += 14;
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text("Human Resources", x, y, { width: blockW, lineBreak: false });
  y += 14;
  if (block.date) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.inkMuted)
      .text(`Date: ${block.date}`, x, y, { width: blockW, lineBreak: false });
    y += 12;
  }
  if (block.place) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.inkMuted)
      .text(`Place: ${block.place}`, x, y, { width: blockW, lineBreak: false });
    y += 12;
  }
  doc.y = y + 4;
}

/* ------------------------------------------------------------------ */
/* renderCtcPdf — structured Compensation letter (hides 0/empty fields) */
/* ------------------------------------------------------------------ */

export interface RenderCtcInput {
  ctc: {
    fields: CtcFields;
    growthJourney?: GrowthStep[];
    version?: number;
    reason?: string;
    effectiveDate?: string | null;
    /** letter title, e.g. "CTC Breakup Letter" (defaults per reason). */
    title?: string;
    /** optional intro paragraph (template bodyMd already merge-resolved). */
    introText?: string;
  };
}

const CTC_TITLE_BY_REASON: Record<string, string> = {
  initial: "CTC Breakup Letter",
  promotion: "Revised CTC — Promotion",
  appraisal: "Revised CTC — Appraisal",
};

/**
 * Render the structured CTC letter. RENDER RULE: any numeric field whose value
 * is 0 / empty is HIDDEN; empty notes are skipped. Earnings + deductions show
 * per-month and per-annum (×12); net take-home, cost-to-company, retention bonus,
 * notes, extra notes and a Growth Journey timeline follow.
 */
export async function renderCtcPdf(input: RenderCtcInput): Promise<Buffer> {
  const f = input.ctc.fields;
  const title =
    input.ctc.title || CTC_TITLE_BY_REASON[input.ctc.reason ?? "initial"] || "CTC Breakup Letter";

  const { doc, done } = newDoc({
    title,
    subject: `Altus Corp · ${title}`,
  });

  doc.on("pageAdded", () => drawChrome(doc));
  drawChrome(doc);
  drawMasthead(doc, "COMPENSATION · CONFIDENTIAL");

  const caption =
    input.ctc.version && input.ctc.version > 0 ? `Version ${input.ctc.version}` : undefined;
  drawTitleBand(doc, title, caption);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // ── optional intro paragraph ──
  if (input.ctc.introText && input.ctc.introText.trim()) {
    drawBody(doc, input.ctc.introText.trim());
    doc.y += 8;
  }

  // ── Identity block (text fields shown when non-empty) ──
  const idRows: Array<[string, string]> = [];
  if (f.employeeName?.trim()) idRows.push(["Employee", f.employeeName.trim()]);
  if (f.designation?.trim()) idRows.push(["Designation", f.designation.trim()]);
  if (f.dateOfJoining?.trim()) idRows.push(["Date of Joining", f.dateOfJoining.trim()]);
  if (f.reportingManager?.trim()) idRows.push(["Reporting Manager", f.reportingManager.trim()]);
  if (input.ctc.effectiveDate) idRows.push(["Effective Date", fmtIsoDate(input.ctc.effectiveDate)]);
  if (hasMoney(f.pctPerMonth)) idRows.push(["Increment (per month)", `${money(f.pctPerMonth)}%`]);
  if (hasMoney(f.pctPerAnnum)) idRows.push(["Increment (per annum)", `${money(f.pctPerAnnum)}%`]);

  if (idRows.length > 0) {
    drawSectionHeading(doc, "Employee");
    const labelW = 150;
    for (const [label, value] of idRows) {
      const top = doc.y;
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor(COLORS.inkSoft)
        .text(label, left, top, { width: labelW, lineBreak: false });
      doc
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .fillColor(COLORS.ink)
        .text(value, left + labelW + 8, top, { width: width - labelW - 8, lineBreak: false });
      doc.y = top + 16;
    }
    doc.y += 8;
  }

  // ── Money table columns ──
  const cellW = 110;
  const gap = 18;
  const annumX = right - cellW;
  const monthX = annumX - gap - cellW;
  const tableLabelW = monthX - left - 10;

  const tableHeader = (): void => {
    const top = doc.y;
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(COLORS.inkFaint)
      .text("PER MONTH", monthX, top, { width: cellW, align: "right", lineBreak: false })
      .text("PER ANNUM", annumX, top, { width: cellW, align: "right", lineBreak: false });
    doc.y = top + 12;
    doc
      .save()
      .strokeColor(COLORS.hairline)
      .lineWidth(0.5)
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .stroke()
      .restore();
    doc.y += 6;
  };

  const moneyRow = (
    label: string,
    monthly: number,
    annual: number,
    opts?: { bold?: boolean; tint?: boolean; monthlyOnly?: boolean; annualOnly?: boolean },
  ): void => {
    const top = doc.y;
    if (opts?.tint) {
      doc.save().rect(left - 4, top - 3, width + 8, 18).fill(COLORS.netTint).restore();
    }
    doc
      .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9.5)
      .fillColor(opts?.bold ? COLORS.ink : COLORS.inkMuted)
      .text(label, left, top, { width: tableLabelW, lineBreak: false });
    if (!opts?.annualOnly) {
      doc
        .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9.5)
        .fillColor(opts?.bold ? COLORS.ink : COLORS.inkMuted)
        .text(inr(monthly), monthX, top, { width: cellW, align: "right", lineBreak: false });
    }
    if (!opts?.monthlyOnly) {
      doc
        .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9.5)
        .fillColor(opts?.bold ? COLORS.brandDeep : COLORS.inkMuted)
        .text(inr(annual), annumX, top, { width: cellW, align: "right", lineBreak: false });
    }
    doc.y = top + 17;
  };

  // ── Earnings ──
  const earnings: Array<[string, number]> = [];
  if (hasMoney(f.basic)) earnings.push(["Basic", money(f.basic)]);
  if (hasMoney(f.hra)) earnings.push(["House Rent Allowance", money(f.hra)]);
  if (hasMoney(f.statutoryBonus)) earnings.push(["Statutory Bonus", money(f.statutoryBonus)]);
  if (hasMoney(f.medical)) earnings.push(["Medical", money(f.medical)]);
  if (hasMoney(f.attire)) earnings.push(["Attire", money(f.attire)]);
  for (const a of f.otherAllowances ?? []) {
    if (a?.name?.trim() && hasMoney(a.amount)) earnings.push([a.name.trim(), money(a.amount)]);
  }

  if (earnings.length > 0) {
    drawSectionHeading(doc, "Earnings");
    tableHeader();
    for (const [label, m] of earnings) moneyRow(label, m, m * 12);
    const grossM = earnings.reduce((s, [, m]) => s + m, 0);
    doc
      .save()
      .strokeColor(COLORS.hairlineStrong)
      .lineWidth(0.6)
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .stroke()
      .restore();
    doc.y += 5;
    moneyRow("Gross Earnings", grossM, grossM * 12, { bold: true });
    doc.y += 8;
  }

  // ── Deductions ──
  const deductions: Array<[string, number]> = [];
  if (hasMoney(f.professionalTax)) deductions.push(["Professional Tax", money(f.professionalTax)]);
  if (hasMoney(f.providentFund)) deductions.push(["Provident Fund", money(f.providentFund)]);
  if (hasMoney(f.incomeTax)) deductions.push(["Income Tax (TDS)", money(f.incomeTax)]);

  if (deductions.length > 0) {
    drawSectionHeading(doc, "Deductions");
    tableHeader();
    for (const [label, m] of deductions) moneyRow(label, m, m * 12);
    doc.y += 8;
  }

  // ── Net take-home ──
  if (hasMoney(f.netSalary)) {
    const net = money(f.netSalary);
    moneyRow("Net Take-home Salary", net, net * 12, { bold: true, tint: true });
    doc.y += 8;
  }

  // ── Cost to company + retention bonus (single figures) ──
  const summary: Array<[string, number]> = [];
  if (hasMoney(f.costToCompany)) summary.push(["Cost to Company (per annum)", money(f.costToCompany)]);
  if (hasMoney(f.retentionBonus)) summary.push(["Retention Bonus", money(f.retentionBonus)]);
  if (summary.length > 0) {
    drawSectionHeading(doc, "Summary");
    for (const [label, v] of summary) {
      const top = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(COLORS.ink)
        .text(label, left, top, { width: width - cellW - 8, lineBreak: false });
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(COLORS.brandDeep)
        .text(inr(v), annumX, top, { width: cellW, align: "right", lineBreak: false });
      doc.y = top + 18;
    }
    doc.y += 6;
  }

  // ── Notes ──
  const notes = (f.notes ?? []).filter((n) => n?.trim());
  if (notes.length > 0) {
    drawSectionHeading(doc, "Notes");
    for (const n of notes) {
      const top = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .fillColor(COLORS.brand)
        .text("•", left, top, { width: 8, lineBreak: false });
      doc.y = top;
      drawInline(doc, n.trim(), left + 12, width - 14, {
        size: 9.5,
        color: COLORS.inkMuted,
        lineGap: 2,
      });
      doc.y += 3;
    }
    doc.y += 6;
  }

  if (f.extraNotes?.trim()) {
    drawSectionHeading(doc, "Additional Notes");
    drawInline(doc, f.extraNotes.trim(), left, width, {
      size: 9.5,
      color: COLORS.inkMuted,
      align: "left",
      lineGap: 3,
    });
    doc.y += 10;
  }

  // ── Growth Journey timeline ──
  const journey = (input.ctc.growthJourney ?? []).filter((g) => g?.title?.trim() || g?.detail?.trim());
  if (journey.length > 0) {
    drawSectionHeading(doc, "Growth Journey");
    for (const step of journey) {
      const top = doc.y;
      doc.save().circle(left + 3, top + 5, 2.5).fill(COLORS.brand).restore();
      const bx = left + 16;
      const bw = width - 18;
      if (step.date?.trim()) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(COLORS.inkFaint)
          .text(step.date.trim(), bx, top, { width: bw, lineBreak: false });
        doc.y = top + 11;
      } else {
        doc.y = top;
      }
      if (step.title?.trim()) {
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(COLORS.ink)
          .text(step.title.trim(), bx, doc.y, { width: bw });
      }
      if (step.detail?.trim()) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLORS.inkMuted)
          .text(step.detail.trim(), bx, doc.y, { width: bw, lineGap: 2 });
      }
      doc.y += 8;
    }
  }

  // ── e-sign footer for the recipient ──
  doc.y += 8;
  drawLetterFooter(doc, { signature: "esign", recipientName: f.employeeName });
  drawFooter(doc, `${title} · ${COMPANY} · Confidential`);

  doc.end();
  return done;
}
