import * as XLSX from "xlsx";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listVasaCells, listVasaSnapshots } from "@/lib/queries/accounts-vasa";
import { listAccountsLookups } from "@/lib/accounts/lookups";

/**
 * GET /accounts/vasa-family-interpersonal/export  (downloads an .xlsx)
 *
 * Every snapshot as its own N×N matrix block, stacked like the source sheet —
 * a full backup now that the app is the source of truth.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireAccountsAccess();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const [cells, snapshots, partyOpts] = await Promise.all([
    listVasaCells(),
    listVasaSnapshots(),
    listAccountsLookups("vasa_party"),
  ]);
  const parties = partyOpts.map((o) => o.name);
  const byKey = new Map(cells.map((c) => [`${c.asOn}|${c.party}|${c.counterparty}`, Number(c.amount)]));

  const aoa: (string | number)[][] = [["Vasa Family Interpersonal Balance"], []];
  for (const asOn of snapshots) {
    aoa.push([`Interpersonal Reco Balances as on ${asOn}`]);
    aoa.push(["Party (owes ▾)", ...parties, "Net"]);
    for (const row of parties) {
      const line: (string | number)[] = [row];
      let net = 0;
      for (const col of parties) {
        if (col === row) { line.push("—"); continue; }
        const v = byKey.get(`${asOn}|${row}|${col}`);
        if (v === undefined) { line.push(""); } else { line.push(v); net += v; }
      }
      line.push(net || "");
      aoa.push(line);
    }
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 16 }, ...Array(parties.length + 1).fill({ wch: 13 })];
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
