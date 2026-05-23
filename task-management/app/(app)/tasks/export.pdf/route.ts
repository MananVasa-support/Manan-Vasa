import PDFDocument from "pdfkit";
import { requireAdmin } from "@/lib/auth/current";
import { parseTaskFilters } from "@/lib/task-filters";
import { listTasksForExport } from "@/lib/queries/tasks";
import { MAX_EXPORT_ROWS, EXPORT_TOO_LARGE } from "@/lib/exports/csv";
import {
  toRichRow,
  richExportFilename,
} from "@/lib/exports/tasks-rich";

/**
 * GET /tasks/export.pdf
 *
 * Admin-only PDF export of the current /tasks view. Renders a landscape A4
 * table with one row per task. Columns are humanized to match the XLSX
 * export (same lib/exports/tasks-rich mapper).
 *
 * Layout: 9-column landscape table (Client, Subject, Status, Approval,
 * Priority, Doer, Initiator, Due, Created). Tags + Revised Target render
 * inside a second-line subtext on the Client column to keep the grid
 * readable on A4 without horizontal scrolling.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const sp: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) sp[k] = v;

  const archived = sp.archived === "1" || sp.archived === "true";
  const filters = parseTaskFilters(sp, archived, {
    defaultDoerId: me.isAdmin ? undefined : me.id,
  });

  const rows = await listTasksForExport(filters, {
    limit: MAX_EXPORT_ROWS + 1,
  });

  if (rows.length > MAX_EXPORT_ROWS) {
    return Response.json(
      {
        error: EXPORT_TOO_LARGE,
        cap: MAX_EXPORT_ROWS,
        totalRows: rows.length,
      },
      { status: 422 },
    );
  }

  const richRows = rows.map(toRichRow);

  const pdfBuffer = await renderPdf(richRows, { archived });

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${richExportFilename("pdf")}"`,
      "cache-control": "no-store",
    },
  });
}

interface RichRowFmt {
  clientName: string;
  subject: string;
  status: string;
  approvalStatus: string;
  priority: string;
  doer: string;
  initiator: string;
  dueDate: string;
  revisedTargetDate: string;
  createdAt: string;
  tags: string;
}

interface ColumnSpec {
  key: keyof RichRowFmt;
  label: string;
  width: number;
}

async function renderPdf(
  rows: RichRowFmt[],
  meta: { archived: boolean },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 36,
    info: {
      Title: "Altus Corp Tasks Export",
      Author: "Altus Corp Dashboard",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // A4 landscape inner width = 842 - 72 = 770pt
  const columns: ColumnSpec[] = [
    { key: "clientName",     label: "Client Name",  width: 130 },
    { key: "subject",        label: "Subject",      width: 70  },
    { key: "status",         label: "Status",       width: 70  },
    { key: "approvalStatus", label: "Approval",     width: 70  },
    { key: "priority",       label: "Priority",     width: 110 },
    { key: "doer",           label: "Doer",         width: 80  },
    { key: "initiator",      label: "Initiator",    width: 80  },
    { key: "dueDate",        label: "Due",          width: 60  },
    { key: "createdAt",      label: "Created",      width: 60  },
  ];

  // --- Title block ---
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#0f172a")
    .text(
      meta.archived
        ? "Altus Corp — Archived Tasks Export"
        : "Altus Corp — Tasks Export",
      { align: "left" },
    );
  doc
    .moveDown(0.2)
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      `Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} task${rows.length === 1 ? "" : "s"}`,
    );
  doc.moveDown(0.6);

  // --- Table ---
  const tableLeft = doc.page.margins.left;
  const tableRight = doc.page.width - doc.page.margins.right;
  const tableWidth = tableRight - tableLeft;
  const totalColWidth = columns.reduce((a, c) => a + c.width, 0);
  // Scale to fit page width (covers small rounding drift).
  const scale = tableWidth / totalColWidth;
  for (const c of columns) c.width = c.width * scale;

  const HEADER_HEIGHT = 22;
  const ROW_PADDING = 6;
  const BODY_FONT_SIZE = 8.5;
  const HEADER_FONT_SIZE = 9;
  const SUBTEXT_FONT_SIZE = 7;

  const drawHeader = () => {
    const y = doc.y;
    doc
      .save()
      .rect(tableLeft, y, tableWidth, HEADER_HEIGHT)
      .fill("#f1f5f9")
      .restore();
    let x = tableLeft;
    doc.font("Helvetica-Bold").fontSize(HEADER_FONT_SIZE).fillColor("#0f172a");
    for (const c of columns) {
      doc.text(c.label, x + 4, y + 6, {
        width: c.width - 8,
        height: HEADER_HEIGHT - 8,
        ellipsis: true,
        lineBreak: false,
      });
      x += c.width;
    }
    // Header bottom border
    doc
      .save()
      .strokeColor("#cbd5e1")
      .lineWidth(0.5)
      .moveTo(tableLeft, y + HEADER_HEIGHT)
      .lineTo(tableRight, y + HEADER_HEIGHT)
      .stroke()
      .restore();
    doc.y = y + HEADER_HEIGHT;
  };

  drawHeader();

  const measureRowHeight = (row: RichRowFmt): number => {
    doc.font("Helvetica").fontSize(BODY_FONT_SIZE);
    let maxH = 0;
    let x = tableLeft;
    for (const c of columns) {
      const text = String(row[c.key] ?? "");
      const h = doc.heightOfString(text, {
        width: c.width - 8,
        align: "left",
      });
      if (h > maxH) maxH = h;
      x += c.width;
    }
    // Reserve a second line for the Client Name column if tags or revised
    // target date exist, so they render as small italic subtext.
    const hasSubtext = !!(row.tags || row.revisedTargetDate);
    if (hasSubtext) {
      doc.font("Helvetica-Oblique").fontSize(SUBTEXT_FONT_SIZE);
      const sub = subtextLine(row);
      const sh = doc.heightOfString(sub, {
        width: columns[0]!.width - 8,
        align: "left",
      });
      maxH = Math.max(maxH, maxH + sh);
    }
    return maxH + ROW_PADDING * 2;
  };

  const pageBottom = doc.page.height - doc.page.margins.bottom;

  let zebra = false;
  for (const row of rows) {
    const rowHeight = measureRowHeight(row);
    if (doc.y + rowHeight > pageBottom) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 36 });
      drawHeader();
    }
    const y = doc.y;

    if (zebra) {
      doc
        .save()
        .rect(tableLeft, y, tableWidth, rowHeight)
        .fill("#f8fafc")
        .restore();
    }
    zebra = !zebra;

    let x = tableLeft;
    doc.font("Helvetica").fontSize(BODY_FONT_SIZE).fillColor("#0f172a");
    for (const c of columns) {
      const text = String(row[c.key] ?? "");
      doc.text(text, x + 4, y + ROW_PADDING, {
        width: c.width - 8,
        align: "left",
        lineBreak: true,
      });
      x += c.width;
    }

    // Subtext under Client Name (tags + revised target date)
    const sub = subtextLine(row);
    if (sub) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(SUBTEXT_FONT_SIZE)
        .fillColor("#64748b");
      const baseHeight = doc.heightOfString(row.clientName, {
        width: columns[0]!.width - 8,
      });
      doc.text(sub, tableLeft + 4, y + ROW_PADDING + baseHeight + 1, {
        width: columns[0]!.width - 8,
        lineBreak: true,
      });
      doc.fillColor("#0f172a");
    }

    // Row bottom border
    doc
      .save()
      .strokeColor("#e2e8f0")
      .lineWidth(0.4)
      .moveTo(tableLeft, y + rowHeight)
      .lineTo(tableRight, y + rowHeight)
      .stroke()
      .restore();
    doc.y = y + rowHeight;
  }

  if (rows.length === 0) {
    doc
      .moveDown(2)
      .font("Helvetica-Oblique")
      .fontSize(11)
      .fillColor("#64748b")
      .text("No tasks match the current filters.", { align: "center" });
  }

  doc.end();
  return done;
}

function subtextLine(row: RichRowFmt): string {
  const parts: string[] = [];
  if (row.revisedTargetDate) parts.push(`Revised: ${row.revisedTargetDate}`);
  if (row.tags) parts.push(`Tags: ${row.tags}`);
  return parts.join("  ·  ");
}
