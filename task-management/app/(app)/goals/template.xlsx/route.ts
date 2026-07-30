import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { listGoalLookups } from "@/lib/goals/lookups";
import { DEPARTMENTS } from "@/db/enums";
import {
  GOAL_TEMPLATE_COLUMNS,
  GOAL_STATUS_LABELS,
  LEVEL_LABELS,
  QUARTER_LABELS,
  MONTH_LABELS,
  VISIBILITY_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  PRIORITY_LABELS_LIST,
  INCENTIVE_KIND_LABELS,
  YES_NO_LABELS,
  type ColumnSource,
  type GoalTemplateColumn,
} from "@/lib/goals/template-columns";
import { GOAL_TYPES, GOAL_TYPE_LABELS } from "@/db/enums";

/**
 * GET /goals/template.xlsx?level=month&periodKey=2026-07
 *
 * The enterprise Goals bulk-import workbook (exceljs). Four sheets:
 *   1. "Goals"     — branded entry grid (frozen header + identifier columns,
 *                    premium grey header, banded rows, autoFilter, protected
 *                    read-only columns, dynamic dropdown validation). Import
 *                    reads THIS sheet.
 *   2. "Examples"  — the same columns, two pre-filled example rows (kept off
 *                    the entry sheet so they're never imported by accident).
 *   3. "How to use"— column glossary (editable? · maps to · notes).
 *   4. "Lists"     — hidden master-data columns backing every dropdown.
 *
 * Every column is derived from the single manifest (lib/goals/template-columns).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADER_ROW = 3;
const DATA_START = HEADER_ROW + 1;
const DATA_ROWS = 300;
const DATA_END = DATA_START + DATA_ROWS - 1;

const INK = "FF1F2937";
const HEADER_FILL = "FF334155"; // premium slate header
const HEADER_TEXT = "FFFFFFFF";
const LOCKED_FILL = "FFEEF2F6"; // faint grey → read-only columns
const BAND_FILL = "FFF8FAFC";
const BRAND_RED = "FFE10600";
const MUTED = "FF64748B";
const HAIRLINE = "FFE2E8F0";

const thin = { style: "thin" as const, color: { argb: HAIRLINE } };
const cellBorder = { top: thin, left: thin, bottom: thin, right: thin };

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function GET(request: Request): Promise<Response> {
  const { me } = await requireGoalsAccess();

  const url = new URL(request.url);
  const level = url.searchParams.get("level") ?? "";
  const periodKey = url.searchParams.get("periodKey") ?? "";

  // ── Master data (dynamic where possible) ───────────────────────────
  const [lookups, roster] = await Promise.all([
    listGoalLookups(),
    db
      .select({ name: employees.name, email: employees.email })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(employees.name),
  ]);

  const ownerNames = roster.map((r) => r.name).filter(Boolean);
  const categoryOptions = Array.from(
    new Set(["Goal", "Target", "Milestone", "Operational", ...lookups.types]),
  );

  const sourceValues: Record<Exclude<ColumnSource, null>, string[]> = {
    level: [...LEVEL_LABELS],
    quarter: [...QUARTER_LABELS],
    month: [...MONTH_LABELS],
    status: [...GOAL_STATUS_LABELS],
    goalType: GOAL_TYPES.map((t) => GOAL_TYPE_LABELS[t]),
    category: categoryOptions,
    area: lookups.areas,
    measure: lookups.measures,
    owner: ownerNames,
    reviewer: ownerNames,
    department: [...DEPARTMENTS],
    visibility: [...VISIBILITY_LABELS],
    assignmentType: [...ASSIGNMENT_TYPE_LABELS],
    priority: [...PRIORITY_LABELS_LIST],
    incentiveKind: Object.values(INCENTIVE_KIND_LABELS),
    yesno: [...YES_NO_LABELS],
  };

  // LEAN entry template — only the columns users actually fill for a new goal,
  // in `entry` order, matching the live board table (Area · Goal · Measure ·
  // Actual · Target · Type · Weight). The full manifest still backs the import
  // parser, so files with extra/legacy columns keep importing.
  const cols = [...GOAL_TEMPLATE_COLUMNS]
    .filter((c) => c.entry != null)
    .sort((a, b) => (a.entry ?? 0) - (b.entry ?? 0));
  const lastCol = cols.length;
  const freezeCols = Math.min(2, lastCol); // keep Area + Goal in view

  const wb = new ExcelJS.Workbook();
  wb.creator = "ALTUS Corp — Goals";
  wb.created = new Date();

  /* ================================================================ */
  /* Sheet 4 first: "Lists" (hidden) — validation source ranges       */
  /* ================================================================ */
  const listSheet = wb.addWorksheet("Lists", { state: "veryHidden" });
  const rangeBySource = new Map<Exclude<ColumnSource, null>, string>();
  let listColIdx = 0;
  for (const [src, values] of Object.entries(sourceValues) as [Exclude<ColumnSource, null>, string[]][]) {
    if (values.length === 0) continue;
    listColIdx += 1;
    const L = colLetter(listColIdx);
    listSheet.getCell(`${L}1`).value = src;
    values.forEach((v, i) => {
      listSheet.getCell(`${L}${i + 2}`).value = v;
    });
    listSheet.getColumn(listColIdx).width = 22;
    rangeBySource.set(src, `Lists!$${L}$2:$${L}$${values.length + 1}`);
  }

  /* ================================================================ */
  /* Sheet 1: "Goals" — the entry grid                                */
  /* ================================================================ */
  const sheet = wb.addWorksheet("Goals", {
    views: [{ state: "frozen", xSplit: freezeCols, ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  cols.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width;
  });

  // ── Row 1: brand title banner (logo + title) ───────────────────────
  sheet.mergeCells(1, 1, 1, lastCol);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "ALTUS Corp · Goals — Bulk Import Template";
  titleCell.font = { name: "Calibri", bold: true, size: 18, color: { argb: BRAND_RED } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 40;

  // Embed the logo top-right if readable; otherwise the styled title stands alone.
  let logoEmbedded = false;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "logo.png"));
    const imgId = wb.addImage({ buffer: buf as unknown as ExcelJS.Buffer, extension: "png" });
    // Anchor over the last header columns, floating in the title band.
    sheet.addImage(imgId, {
      tl: { col: lastCol - 2.0, row: 0.12 },
      ext: { width: 132, height: 34 },
      editAs: "oneCell",
    });
    logoEmbedded = true;
  } catch {
    logoEmbedded = false;
  }

  // ── Row 2: context sub-banner ──────────────────────────────────────
  sheet.mergeCells(2, 1, 2, lastCol);
  const ctx = sheet.getCell(2, 1);
  const ctxBits = ["Fill one goal per row below the header.", "Only Goal is required."];
  if (level) ctxBits.unshift(`Level: ${level}`);
  if (periodKey) ctxBits.unshift(`Period: ${periodKey}`);
  ctx.value = ctxBits.join("   ·   ");
  ctx.font = { name: "Calibri", size: 10.5, italic: true, color: { argb: MUTED } };
  ctx.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(2).height = 18;

  // ── Row 3: header ──────────────────────────────────────────────────
  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.height = 26;
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.locked ? `${c.header} 🔒` : c.header;
    cell.font = { name: "Calibri", bold: true, size: 10.5, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    cell.border = cellBorder;
  });

  // ── Entry rows: banding, borders, per-column locking + validation ──
  for (let r = DATA_START; r <= DATA_END; r++) {
    const row = sheet.getRow(r);
    row.height = 18;
    const banded = (r - DATA_START) % 2 === 1;
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.border = cellBorder;
      cell.font = { name: "Calibri", size: 10.5, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      // Read-only (locked) columns get a faint grey wash; data columns band.
      if (c.locked) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LOCKED_FILL } };
        cell.protection = { locked: true };
      } else {
        if (banded) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
        cell.protection = { locked: false };
      }
    });
  }

  // Dropdown validation on each source-backed column (whole entry range).
  cols.forEach((c, i) => {
    if (!c.source) return;
    const range = rangeBySource.get(c.source);
    if (!range) return;
    const L = colLetter(i + 1);
    for (let r = DATA_START; r <= DATA_END; r++) {
      sheet.getCell(`${L}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [range],
        showErrorMessage: false, // permissive — flag on import, never block entry
      };
    }
  });

  // Filter-enabled header (reads like a table).
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: lastCol } };

  // Protect: lock read-only cells, keep data cells + filtering usable.
  await sheet.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: true,
    formatRows: true,
    insertRows: false,
    sort: true,
    autoFilter: true,
  });

  /* ================================================================ */
  /* Sheet 2: "Examples" — same headers + pre-filled rows              */
  /* ================================================================ */
  const ex = wb.addWorksheet("Examples", { views: [{ showGridLines: false }] });
  cols.forEach((c, i) => {
    ex.getColumn(i + 1).width = c.width;
    const cell = ex.getRow(1).getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", bold: true, size: 10.5, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    cell.border = cellBorder;
  });
  ex.getRow(1).height = 24;
  for (let e = 0; e < 2; e++) {
    const row = ex.getRow(2 + e);
    row.height = 18;
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = c.examples?.[e] ?? "";
      cell.font = { name: "Calibri", size: 10.5, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      cell.border = cellBorder;
      if (e % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
    });
  }
  ex.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];

  /* ================================================================ */
  /* Sheet 3: "How to use" — glossary                                 */
  /* ================================================================ */
  const how = wb.addWorksheet("How to use", { views: [{ showGridLines: false }] });
  how.getColumn(1).width = 24;
  how.getColumn(2).width = 12;
  how.getColumn(3).width = 18;
  how.getColumn(4).width = 70;
  const h1 = how.getCell(1, 1);
  how.mergeCells(1, 1, 1, 4);
  h1.value = "ALTUS Corp · Goals bulk import — how to use";
  h1.font = { name: "Calibri", bold: true, size: 16, color: { argb: BRAND_RED } };
  how.getRow(1).height = 30;
  const intro = how.getCell(2, 1);
  how.mergeCells(2, 1, 2, 4);
  intro.value =
    "Fill the 'Goals' sheet — one goal per row. Only Goal is required. The goal is added to the level & period you launched the import from. Area, Measure and Type have dropdowns (type-ahead supported). Re-upload the same file to import.";
  intro.alignment = { wrapText: true, vertical: "top" };
  intro.font = { name: "Calibri", size: 10.5, color: { argb: INK } };
  how.getRow(2).height = 46;

  const glossHead = how.getRow(4);
  ["Column", "Editable?", "Maps to", "Notes"].forEach((t, i) => {
    const cell = glossHead.getCell(i + 1);
    cell.value = t;
    cell.font = { name: "Calibri", bold: true, size: 10.5, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = cellBorder;
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  });
  cols.forEach((c: GoalTemplateColumn, idx) => {
    const row = how.getRow(5 + idx);
    const editable = c.locked ? "Read-only" : c.writable ? "Yes" : "No";
    const values = [c.header, editable, c.schemaField ?? "—", c.help];
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { name: "Calibri", size: 10, color: { argb: i === 3 ? MUTED : INK } };
      cell.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: i === 3 };
      cell.border = cellBorder;
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
    });
    row.height = 26;
  });
  how.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 4 } };

  void me;
  void logoEmbedded;

  const buffer = await wb.xlsx.writeBuffer();
  // Title-cased download name (capital A·G·T·Y): "Altus-Goals-Template-Yearly-…".
  const LEVEL_FILE_LABEL: Record<string, string> = {
    year: "Yearly",
    quarter: "Quarterly",
    month: "Monthly",
    week: "Weekly",
    day: "Daily",
  };
  const levelLabel = level ? LEVEL_FILE_LABEL[level] ?? level.charAt(0).toUpperCase() + level.slice(1) : "";
  const fname = `Altus-Goals-Template${levelLabel ? `-${levelLabel}` : ""}${periodKey ? `-${periodKey}` : ""}.xlsx`;
  return new Response(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
