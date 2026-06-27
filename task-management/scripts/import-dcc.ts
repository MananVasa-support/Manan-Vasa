#!/usr/bin/env tsx
/**
 * Import the "Daily Compliance - Altus Corp" Google Sheet into the native DCC
 * tables (migration 0090). The app is the source of truth after this runs once.
 *
 *   DRY RUN (no writes, prints a per-person summary):
 *     pnpm tsx --env-file=.env.local scripts/import-dcc.ts
 *   COMMIT (clears & re-imports every mapped person — idempotent):
 *     pnpm tsx --env-file=.env.local scripts/import-dcc.ts --commit
 *
 * Each KPI tab is one person. Two layout families (per the structural analysis):
 *   ALPHANUM — item code in col0 is "A1".."B8"; section header rows = bare "A".
 *   NUMERIC  — item code in col0 is a plain integer that resets per section;
 *              real code = <sectionLetter><integer>.
 * Both are handled generically: we locate the date-header row (the row with the
 * most date-like cells), the "Frequency" column, then walk item rows, tracking
 * the current section letter/title and any client sub-label. EA (a role, no
 * employee) is skipped; Dattaram is a project register (no date grid) →
 * items-only. This touches the LIVE DB — only the owner runs it.
 */
import { db } from "@/lib/db";
import { employees, dccKpiItems, dccEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readSheetValues } from "@/lib/google/read-sheet";
import { parseFrequencyToMask } from "@/lib/dcc/util";

const SHEET_ID = "1YjuNom1QX43O9X4GbQoF_fER0siolfR_V8czbextMtU";
const COMMIT = process.argv.includes("--commit");
// Optional safety filter: --only="<name substring>" writes ONLY matching people
// (case-insensitive), leaving everyone else's KPIs/entries untouched. Used to
// backfill a single person (e.g. a tab that was missing from the mapping)
// without re-clearing the 20 others — which would wipe app-entered entries.
const ONLY = (process.argv.find((a) => a.startsWith("--only="))?.split("=")[1] ?? "").toLowerCase();

// tab title → canonical employee name (resolved aliases from the analysis).
const PERSON_TABS: Array<{ tab: string; emp: string }> = [
  { tab: "Ruchita KPI", emp: "Ruchita Ambre" },
  { tab: "Mishtie-Intern", emp: "Mishtie Kanani" },
  { tab: "Pukhraj-Intern", emp: "Pukhraj Suthar" },
  { tab: "Jeevan KPI", emp: "Jeevan Bharambe" },
  { tab: "Prakash KPI", emp: "Prakash Kumawat" },
  { tab: "Danyal KPI", emp: "Danyal Sayyed" },
  { tab: "Siddhi-Intern", emp: "Siddhi Lakade" },
  { tab: "Proveeka-Intern", emp: "Proveeka Makwana" },
  { tab: "Pratik-Intern", emp: "Pratik Patil" },
  { tab: "Rohan KPI", emp: "Rohan Choudhary" },
  { tab: "Kripsha-Intern", emp: "Kripsha Joshi" },
  { tab: "Shreya Shukla-Intern", emp: "Shreya Shukla" },
  { tab: "Shreya Randhe-Intern", emp: "Shreya Randhe" },
  { tab: "Krish-Intern", emp: "Krish Maheshwari" },
  { tab: "Hardik-Intern", emp: "Hardik Bhutada" },
  { tab: "Suresh-Intern", emp: "Suresh Yadav" },
  { tab: "Atul-Intern", emp: "Atul Asthana" },
  { tab: "Pratham-Intern", emp: "Pratham Medhekar" },
  { tab: "Hetesh-Intern", emp: "Hetesh Vichare" },
  { tab: "Rutvisha KPI", emp: "Rutvisha Mehta" },
  { tab: "Manan Sir KPI", emp: "Manan Vasa" },
];
const REGISTER_TABS: Array<{ tab: string; emp: string; titleCol: number; freqCol: number }> = [
  { tab: "Dattaram", emp: "Dattaram Kap", titleCol: 2, freqCol: 3 },
];

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DATE_RE = /^(\d{1,2})(?:st|nd|rd|th)?[-\s]([A-Za-z]{3,9})[-\s'.]*(\d{2,4})$/;

function parseDate(cell: string): string | null {
  const m = DATE_RE.exec(cell.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const mon = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31) return null;
  const iso = `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return iso;
}

interface ParsedItem { section: string | null; code: string | null; title: string; frequency: string | null; weekdays: number | null; entries: Array<{ date: string; status: string | null; value: string | null; note: string | null }>; }

/** Classify one date-cell value → {status,value,note} or null to skip. */
function classify(raw: string): { status: string | null; value: string | null; note: string | null } | null {
  const s = raw.trim();
  if (!s || s === "-" || s === "\\" || s === ".") return null;
  const l = s.toLowerCase();
  const leadNum = /^(\d+(?:\.\d+)?)/.exec(s);

  if (/^(na|n\/a|not applicable|not required|not any|no any|none|not working)$/.test(l)) return { status: "NA", value: null, note: null };
  if (/(on leave|leave taken)/.test(l)) return { status: "NA", value: null, note: "On leave" };
  if (l === "holiday") return { status: "NA", value: null, note: "Holiday" };
  if (l === "yes" || l === "true") return { status: "Done", value: null, note: null };
  if (l === "no" || l === "false") return { status: "Not done", value: null, note: null };
  if (/not done|not taken/.test(l)) return { status: "Not done", value: null, note: null };
  if (/\bdone\b/.test(l)) return { status: "Done", value: leadNum ? leadNum[1]! : null, note: s.length > 6 ? s : null };
  // pure number → count KPI
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return { status: n > 0 ? "Done" : "Not done", value: s, note: null }; }
  // anything else → free-text note
  return { status: null, value: null, note: s };
}

function parsePersonTab(tab: string, grid: string[][]): ParsedItem[] {
  // 1) locate date-header row = row with the most date-like cells.
  let dateRow = -1, best = 0;
  for (let r = 0; r < Math.min(grid.length, 8); r++) {
    let c = 0;
    for (const cell of grid[r] ?? []) if (parseDate(cell ?? "")) c++;
    if (c > best) { best = c; dateRow = r; }
  }
  // 2) freqCol = column whose header (rows 0..dateRow+1) equals "Frequency".
  let freqCol = -1;
  for (let r = 0; r <= dateRow + 1 && r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) if ((row[c] ?? "").trim().toLowerCase() === "frequency") { freqCol = c; break; }
    if (freqCol >= 0) break;
  }

  let dateCols = new Map<number, string>();
  const rebuildDates = (row: string[]) => { const m = new Map<number, string>(); for (let c = 0; c < row.length; c++) { const iso = parseDate(row[c] ?? ""); if (iso) m.set(c, iso); } if (m.size >= 3) dateCols = m; };
  if (dateRow >= 0) rebuildDates(grid[dateRow] ?? []);

  const items: ParsedItem[] = [];
  let sectionLetter = "", sectionTitle = "";

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const col0 = (row[0] ?? "").trim();
    const title = (row[1] ?? "").trim();

    // date-header row (incl. repeated client sub-blocks)
    let dcount = 0; for (const cell of row) if (parseDate(cell ?? "")) dcount++;
    if (dcount >= 3) { rebuildDates(row); continue; }

    // section header: bare single letter in col0
    if (/^[A-Z]$/.test(col0)) { sectionLetter = col0; sectionTitle = title || (row[2] ?? "").trim() || col0; continue; }

    if (!title) continue; // blank / weekday / spacer row

    // build code — a real KPI item ALWAYS has one (A1.. for ALPHANUM, <letter><n> for NUMERIC)
    let code: string | null = null;
    if (/^[A-Z]\d+$/.test(col0)) { code = col0; sectionLetter = col0[0]!; }
    else if (/^\d+$/.test(col0)) { code = (sectionLetter || "") + col0; }

    if (!code) {
      // codeless titled row = a section caption / sub-title with no letter (e.g.
      // "Weekly KPI", "CORE DELIVERABLES…", or a client sub-block "Lawrence & Mayo").
      // Adopt it as the current section name; never import it as an item.
      if (!/^frequency$/i.test(title)) sectionTitle = title;
      continue;
    }

    const freq = freqCol >= 0 ? (row[freqCol] ?? "").trim() : "";
    const entries: ParsedItem["entries"] = [];
    for (const [c, iso] of dateCols) { const v = classify(row[c] ?? ""); if (v) entries.push({ date: iso, ...v }); }

    items.push({
      section: sectionTitle || null,
      code,
      title,
      frequency: freq || null,
      weekdays: parseFrequencyToMask(freq),
      entries,
    });
  }
  return items;
}

function parseRegisterTab(cfg: { titleCol: number; freqCol: number }, grid: string[][]): ParsedItem[] {
  const items: ParsedItem[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const title = (row[cfg.titleCol] ?? "").trim();
    if (!title || title.toLowerCase() === "tasks") continue;
    const freq = (row[cfg.freqCol] ?? "").trim();
    items.push({ section: "Tasks", code: null, title, frequency: freq || null, weekdays: parseFrequencyToMask(freq), entries: [] });
  }
  return items;
}

async function main() {
  const emps = await db.select({ id: employees.id, name: employees.name }).from(employees);
  const byName = new Map(emps.map((e) => [e.name.trim().toLowerCase(), e.id]));
  const resolve = (name: string) => byName.get(name.trim().toLowerCase()) ?? null;

  let totalItems = 0, totalEntries = 0, matched = 0;
  console.log(`\nDCC import — ${COMMIT ? "COMMIT" : "DRY RUN"}\n${"=".repeat(60)}`);

  const all: Array<{ emp: string; empId: string | null; items: ParsedItem[] }> = [];

  for (const { tab, emp } of PERSON_TABS) {
    let grid: string[][];
    try { grid = await readSheetValues(SHEET_ID, `'${tab}'!A1:GZ`); }
    catch (e) { console.log(`✗ ${tab}: read failed — ${e instanceof Error ? e.message : e}`); continue; }
    const items = parsePersonTab(tab, grid);
    const empId = resolve(emp);
    all.push({ emp, empId, items });
    const ec = items.reduce((a, i) => a + i.entries.length, 0);
    totalItems += items.length; totalEntries += ec; if (empId) matched++;
    const sample = items.slice(0, 2).map((i) => `${i.code ?? "—"} ${i.title.slice(0, 32)} [${i.frequency ?? "?"}→${i.weekdays ?? "any"}]`).join(" | ");
    console.log(`${empId ? "✓" : "✗ NO EMP"} ${tab.padEnd(22)} → ${emp.padEnd(18)} ${String(items.length).padStart(3)} items, ${String(ec).padStart(4)} entries  ${sample}`);
  }
  for (const cfg of REGISTER_TABS) {
    let grid: string[][];
    try { grid = await readSheetValues(SHEET_ID, `'${cfg.tab}'!A1:Z`); }
    catch (e) { console.log(`✗ ${cfg.tab}: read failed — ${e}`); continue; }
    const items = parseRegisterTab(cfg, grid);
    const empId = resolve(cfg.emp);
    all.push({ emp: cfg.emp, empId, items });
    totalItems += items.length; if (empId) matched++;
    console.log(`${empId ? "✓" : "✗ NO EMP"} ${cfg.tab.padEnd(22)} → ${cfg.emp.padEnd(18)} ${String(items.length).padStart(3)} items (register, no entries)`);
  }

  console.log(`${"=".repeat(60)}\nTabs matched: ${matched}/${all.length} · items ${totalItems} · entries ${totalEntries}`);

  if (!COMMIT) { console.log("\nDry run only. Re-run with --commit to write.\n"); return; }

  let wroteItems = 0, wroteEntries = 0;
  for (const { emp, empId, items } of all) {
    if (!empId) { console.log(`skip ${emp} (no employee)`); continue; }
    if (ONLY && !emp.toLowerCase().includes(ONLY)) { console.log(`skip ${emp} (--only=${ONLY})`); continue; }
    await db.transaction(async (tx) => {
      await tx.delete(dccKpiItems).where(eq(dccKpiItems.ownerEmployeeId, empId)); // cascades entries
      let sort = 0;
      for (const it of items) {
        const [row] = await tx.insert(dccKpiItems).values({
          ownerEmployeeId: empId, section: it.section, code: it.code, title: it.title,
          frequency: it.frequency, weekdays: it.weekdays, sortOrder: sort++, createdById: empId,
        }).returning({ id: dccKpiItems.id });
        wroteItems++;
        if (it.entries.length) {
          // de-dup by date (keep last) to satisfy the (item,date) unique index
          const byDate = new Map(it.entries.map((e) => [e.date, e]));
          await tx.insert(dccEntries).values([...byDate.values()].map((e) => ({
            itemId: row!.id, entryDate: e.date, status: e.status, valueNumber: e.value, note: e.note, filledById: empId,
          })));
          wroteEntries += byDate.size;
        }
      }
    });
    console.log(`✓ wrote ${emp}`);
  }
  console.log(`\nDONE — ${wroteItems} items, ${wroteEntries} entries written.\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
