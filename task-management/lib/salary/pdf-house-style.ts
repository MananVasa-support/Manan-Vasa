import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { format } from "date-fns";

/**
 * WS-5 — Shared payslip "house style" for pdfkit salary documents.
 *
 * The payslip (/salary/payslip/[runId]) and exit letters established the look:
 * brand stripe · embedded Altus logo · faint centered watermark · full-page
 * border · red section accents · system footer · Entity signatory block. The
 * NEW statement/earnings documents reuse these helpers so every salary PDF is
 * visually identical. All asset reads are guarded — a missing logo / mark /
 * signature never breaks a document.
 */

export const COLORS = {
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
export const SIG_DIR = path.join(process.cwd(), "public", "signatures");

/** ₹ with Indian grouping, no decimals. */
export const inr = (n: number): string =>
  "₹" + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** "dd MMMM yyyy" for a YYYY-MM-DD ISO date, or "" / the raw string on failure. */
export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "dd MMMM yyyy");
}

// ── number → Indian-system words (net-payable / total lines) ────────────────
const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen",
] as const;
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
  "Eighty", "Ninety",
] as const;

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = Math.floor(n / 10);
  const o = n % 10;
  const tens = TENS[t] ?? "";
  return o === 0 ? tens : `${tens} ${ONES[o] ?? ""}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return twoDigits(rest);
  const hundreds = `${ONES[h] ?? ""} Hundred`;
  return rest === 0 ? hundreds : `${hundreds} ${twoDigits(rest)}`;
}
function rupeesToWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}
export function amountInWords(amount: number): string {
  const sign = amount < 0 ? "Minus " : "";
  return `${sign}Rupees ${rupeesToWords(amount)} Only`;
}

/** Create an A4 portrait doc + a promise that resolves to the finished Buffer. */
export function newDoc(meta: {
  title: string;
  subject: string;
  margin?: number;
}): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: meta.margin ?? 48,
    info: { Title: meta.title, Author: "Altus Corp Dashboard", Subject: meta.subject },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return { doc, done };
}

/** Full-page border + faint watermark + brand stripe (drawn first). */
export function drawChrome(doc: PDFKit.PDFDocument): void {
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
      doc.opacity(0.055);
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

/** Logo + entity name + a small confidential subline. Advances doc.y. */
export function drawMasthead(
  doc: PDFKit.PDFDocument,
  entity: string,
  subline: string,
): void {
  const left = doc.page.margins.left;
  const headerTop = doc.page.margins.top + 2;
  let textX = left;
  if (existsSync(LOGO_PATH)) {
    try {
      const logoW = 124;
      doc.image(LOGO_PATH, left, headerTop, { width: logoW });
      textX = left + logoW + 16;
    } catch {
      /* text-only masthead */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.ink)
    .text(entity.toUpperCase(), textX, headerTop + 4, {
      characterSpacing: 0.6,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text(subline, textX, doc.y + 3, { lineBreak: false });
  doc.y = Math.max(doc.y, headerTop + 52) + 12;
}

/** Red title band with a left title and optional right-aligned caption. */
export function drawTitleBand(
  doc: PDFKit.PDFDocument,
  title: string,
  rightCaption?: string,
): void {
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
      characterSpacing: 0.9,
      lineBreak: false,
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
export function drawSectionHeading(doc: PDFKit.PDFDocument, label: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(COLORS.brandDeep)
    .text(label.toUpperCase(), left, doc.y, { characterSpacing: 0.8, lineBreak: false });
  doc.y += 14;
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

/** `For <Entity>` / signature image (or placeholder) / Authorised Signatory / Date / Place. */
export function drawSignatoryBlock(
  doc: PDFKit.PDFDocument,
  o: {
    x: number;
    y: number;
    entity: string;
    signatoryName: string;
    assetFile: string;
    date: string;
    place: string;
  },
): void {
  const blockW = 220;
  let y = o.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text(`For ${o.entity}`, o.x, y, { width: blockW, lineBreak: false });
  y += 20;

  const sigH = 52;
  const assetPath = path.join(SIG_DIR, o.assetFile);
  let drawn = false;
  if (existsSync(assetPath)) {
    try {
      doc.image(assetPath, o.x, y, { fit: [blockW, sigH] });
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(18)
      .fillColor(COLORS.inkSoft)
      .text(o.signatoryName, o.x, y + sigH - 26, { lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.inkFaint)
      .text("(signature image pending)", o.x, y + sigH - 4, { lineBreak: false });
  }
  y += sigH + 2;

  doc.save().rect(o.x, y, blockW, 1.6).fill(COLORS.brand).restore();
  y += 8;

  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text("AUTHORISED SIGNATORY", o.x, y, { characterSpacing: 0.8, lineBreak: false });
  y += 16;

  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.inkMuted)
    .text(`Date:  ${o.date || "____________"}`, o.x, y, { lineBreak: false });
  y += 13;
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.inkMuted)
    .text(`Place: ${o.place || "____________"}`, o.x, y, { lineBreak: false });
}

/** System footer: hairline + "Generated by … on …". */
export function drawFooter(doc: PDFKit.PDFDocument, prefix: string, generatedBy: string): void {
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
    .text(
      `${prefix} · Generated by ${generatedBy} on ${format(new Date(), "EEE, MMM d, yyyy · HH:mm")}`,
      left,
      footerY,
      { width, lineBreak: false },
    );
}
