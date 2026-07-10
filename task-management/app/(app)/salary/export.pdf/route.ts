import PDFDocument from "pdfkit";
import { requireUser } from "@/lib/auth/current";
import { listSalaryBreakup } from "@/lib/queries/salary-breakup";
import { toPayrollRows, type PayrollExportRow } from "@/lib/salary/payroll-rows";
import { COLORS, inr } from "@/lib/salary/pdf-house-style";

/**
 * GET /salary/export.pdf?month=YYYY-MM — admin-only payroll PDF (landscape
 * table) of the on-screen salary sheet. One row per person, grouped by entity,
 * with per-entity + grand totals — a clean sheet Sir can read and pay from.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentMonthIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

interface Col {
  key: keyof PayrollExportRow | "amount";
  label: string;
  w: number;
  align: "left" | "right";
  money?: boolean;
}
const COLS: Col[] = [
  { key: "sr", label: "Sr", w: 26, align: "left" },
  { key: "employee", label: "Employee", w: 128, align: "left" },
  { key: "designation", label: "Designation", w: 92, align: "left" },
  { key: "entity", label: "Entity", w: 84, align: "left" },
  { key: "workingDays", label: "Days", w: 36, align: "right" },
  { key: "monthlyCtc", label: "Monthly CTC", w: 74, align: "right", money: true },
  { key: "payableAfterPt", label: "After PT", w: 72, align: "right", money: true },
  { key: "advance", label: "Advance", w: 60, align: "right", money: true },
  { key: "previousPending", label: "Prev.", w: 56, align: "right", money: true },
  { key: "finalPayment", label: "Final Pay", w: 82, align: "right", money: true },
];

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!me.isAdmin) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonthIST();

  let rows = toPayrollRows(await listSalaryBreakup(month));
  // group by entity, then name
  rows = [...rows].sort((a, b) => a.entity.localeCompare(b.entity) || a.employee.localeCompare(b.employee));

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = 28;
  const totalW = COLS.reduce((s, c) => s + c.w, 0);
  const pageBottom = doc.page.height - 40;

  const drawHeaderBand = () => {
    doc.save().rect(0, 0, doc.page.width, 4).fill(COLORS.brand).restore();
    doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(15).text("ALTUS CORP", left, 16);
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(`Payroll — ${monthLabel(month)}`, left, 34);
    doc
      .fillColor("#64748b")
      .font("Helvetica")
      .fontSize(8)
      .text(`${rows.length} employees · figures in ₹ · generated for internal use`, left, 50);
  };

  const drawColHeader = (y: number): number => {
    doc.save().rect(left, y, totalW, 18).fill("#f1f5f9").restore();
    let x = left;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#334155");
    for (const c of COLS) {
      doc.text(c.label, x + 4, y + 5, { width: c.w - 8, align: c.align });
      x += c.w;
    }
    return y + 18;
  };

  drawHeaderBand();
  let y = drawColHeader(66);

  const cell = (r: PayrollExportRow) => {
    let x = left;
    doc.font("Helvetica").fontSize(7.5).fillColor("#1f2937");
    for (const c of COLS) {
      const raw = r[c.key as keyof PayrollExportRow];
      const txt = c.money ? inr(Number(raw) || 0) : String(raw ?? "");
      const bold = c.key === "finalPayment";
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? "#0f172a" : "#1f2937");
      doc.text(txt, x + 4, y + 4, { width: c.w - 8, align: c.align, lineBreak: false, ellipsis: true });
      x += c.w;
    }
  };

  let entity = "";
  let grand = 0;
  let entitySub = 0;
  const flushEntitySub = () => {
    if (!entity) return;
    doc.save().rect(left, y, totalW, 15).fill("#ecfdf5").restore();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.brandDeep);
    doc.text(`${entity} — subtotal`, left + 4, y + 4, { width: totalW - 90, align: "left" });
    doc.text(inr(entitySub), left + totalW - 86, y + 4, { width: 82, align: "right" });
    y += 15;
    entitySub = 0;
  };

  for (const r of rows) {
    if (r.entity !== entity) {
      flushEntitySub();
      entity = r.entity;
    }
    if (y + 15 > pageBottom) {
      doc.addPage();
      drawHeaderBand();
      y = drawColHeader(66);
    }
    doc.save().rect(left, y, totalW, 14).fill(rows.indexOf(r) % 2 ? "#ffffff" : "#fafafa").restore();
    cell(r);
    y += 14;
    entitySub += r.finalPayment;
    grand += r.finalPayment;
  }
  flushEntitySub();

  // grand total
  y += 4;
  doc.save().rect(left, y, totalW, 20).fill(COLORS.brand).restore();
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#ffffff");
  doc.text("TOTAL PAYABLE", left + 6, y + 5, { width: totalW - 130, align: "left" });
  doc.text(inr(grand), left + totalW - 124, y + 5, { width: 120, align: "right" });

  doc.end();
  const buffer = await done;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="payroll-${month}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
