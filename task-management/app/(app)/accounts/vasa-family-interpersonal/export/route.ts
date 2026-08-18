import * as XLSX from "xlsx";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listVasaCells, listVasaSnapshots } from "@/lib/queries/accounts-vasa";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import {
  buildMatrix,
  snapshotXlsx,
  snapshotCsv,
  snapshotFilename,
} from "@/lib/accounts/vasa-report";

/**
 * GET /accounts/vasa-family-interpersonal/export
 *
 *   (no params)                  → every snapshot, stacked, as .xlsx  (unchanged)
 *   ?asOn=dd/mm/yyyy             → THAT snapshot only, as .xlsx
 *   ?asOn=dd/mm/yyyy&format=csv  → THAT snapshot only, as .csv
 *
 * The per-snapshot form is what the List view's Download uses, so a row always
 * yields ITS OWN report — never whichever snapshot happens to be open in the
 * Sheet view. Both forms build their grid with the shared `buildMatrix`, so the
 * downloaded file and the emailed file cannot drift apart.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    await requireAccountsAccess();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const asOn = url.searchParams.get("asOn");
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";

  const [cells, snapshots, partyOpts] = await Promise.all([
    listVasaCells(),
    listVasaSnapshots(),
    listAccountsLookups("vasa_party"),
  ]);
  const parties = partyOpts.map((o) => o.name);

  // ── One snapshot ──────────────────────────────────────────────────────
  if (asOn) {
    // Only a date that actually exists — otherwise a hand-edited URL would
    // return an empty grid that looks like a real, all-zero report.
    if (!snapshots.includes(asOn)) {
      return new Response("No such snapshot", { status: 404 });
    }
    if (format === "csv") {
      const csv = snapshotCsv(cells, parties, asOn);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${snapshotFilename(asOn, "csv")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const buf = snapshotXlsx(cells, parties, asOn);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${snapshotFilename(asOn, "xlsx")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Every snapshot, stacked (the original behaviour) ──────────────────
  const aoa: (string | number)[][] = [["Vasa Family Interpersonal Balance"], []];
  for (const s of snapshots) {
    for (const line of buildMatrix(cells, parties, s)) aoa.push(line);
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 18 }, ...Array(parties.length + 1).fill({ wch: 13 })];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Interpersonal Balances");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Vasa-Interpersonal-Balances.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
