import "server-only";
import * as XLSX from "xlsx";
import type { VasaCell } from "@/lib/queries/accounts-vasa";

/**
 * ONE builder for the Interpersonal Balance matrix, shared by every surface that
 * emits a report: the all-snapshots export, the per-snapshot download, and the
 * Manual Save email.
 *
 * They must agree byte-for-byte. When each surface built its own grid, "the file
 * I downloaded" and "the file that was emailed" could differ for the same
 * snapshot — which on a reconciliation sheet is worse than having no file.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Parsed pieces of a stored `dd/mm/yyyy` snapshot date. */
export interface SnapshotDate {
  day: number;
  month: number; // 1-12
  year: number;
}

export function parseSnapshotDate(stored: string): SnapshotDate | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec((stored ?? "").trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const month = Number(mo);
  if (month < 1 || month > 12) return null;
  return {
    day: Number(d),
    month,
    year: Number(y!.length === 2 ? `20${y}` : y),
  };
}

/** `18/08/2026` → `18-Aug-2026`; unparseable input is returned untouched. */
export function snapshotLabel(stored: string): string {
  const p = parseSnapshotDate(stored);
  if (!p) return stored;
  return `${String(p.day).padStart(2, "0")}-${MONTHS[p.month - 1]}-${p.year}`;
}

/**
 * CALENDAR quarter — Jan-Mar = Q1 … Oct-Dec = Q4.
 *
 * Deliberately NOT the Apr-Mar financial year used by the salary module: the
 * spec's own example puts 18-Aug-2026 in "Q3 2026", which is only true on the
 * calendar. A sheet labelled with the wrong quarter is a filing error, so this
 * is pinned here rather than inferred at each call site.
 */
export function quarterOf(stored: string): { q: number; year: number } | null {
  const p = parseSnapshotDate(stored);
  if (!p) return null;
  return { q: Math.floor((p.month - 1) / 3) + 1, year: p.year };
}

export function quarterKey(q: number, year: number): string {
  return `Q${q} ${year}`;
}

/** "August Interpersonal Balance" — derived, so no name column is needed. */
export function snapshotName(stored: string): string {
  const p = parseSnapshotDate(stored);
  if (!p) return "Interpersonal Balance";
  return `${MONTH_FULL[p.month - 1]} Interpersonal Balance`;
}

/** The matrix for ONE snapshot as rows of cells: header, a row per party, Net. */
export function buildMatrix(
  cells: VasaCell[],
  parties: string[],
  asOn: string,
): (string | number)[][] {
  const byKey = new Map(
    cells
      .filter((c) => c.asOn === asOn)
      .map((c) => [`${c.party}|${c.counterparty}`, Number(c.amount)]),
  );
  const aoa: (string | number)[][] = [
    [`Interpersonal Reco Balances as on ${snapshotLabel(asOn)}`],
    ["Party (owes ▾)", ...parties, "Net"],
  ];
  for (const row of parties) {
    const line: (string | number)[] = [row];
    let net = 0;
    for (const col of parties) {
      if (col === row) {
        line.push("—");
        continue;
      }
      const v = byKey.get(`${row}|${col}`);
      if (v === undefined) line.push("");
      else {
        line.push(v);
        net += v;
      }
    }
    line.push(net || "");
    aoa.push(line);
  }
  return aoa;
}

/** One snapshot as an .xlsx buffer. */
export function snapshotXlsx(cells: VasaCell[], parties: string[], asOn: string): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(buildMatrix(cells, parties, asOn));
  ws["!cols"] = [{ wch: 18 }, ...Array(parties.length + 1).fill({ wch: 13 })];
  const wb = XLSX.utils.book_new();
  // Sheet names are capped at 31 chars by the format and cannot contain / \ ? * [ ]
  XLSX.utils.book_append_sheet(wb, ws, snapshotLabel(asOn).slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** One snapshot as CSV text. */
export function snapshotCsv(cells: VasaCell[], parties: string[], asOn: string): string {
  const ws = XLSX.utils.aoa_to_sheet(buildMatrix(cells, parties, asOn));
  return XLSX.utils.sheet_to_csv(ws);
}

/** A filesystem-safe base name for a snapshot's download. */
export function snapshotFilename(asOn: string, ext: "xlsx" | "csv"): string {
  return `Vasa-Interpersonal-${snapshotLabel(asOn).replace(/[^A-Za-z0-9-]/g, "")}.${ext}`;
}
