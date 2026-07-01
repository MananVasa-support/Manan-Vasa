import { readSheetValues } from "../lib/google/read-sheet";

const ID = "13dHs7Klp4_Eb3JUvhzTYEgQsmX-rLFfR2ZwZK9hcgrU";

async function readRetry(range: string, tries = 6): Promise<string[][]> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await readSheetValues(ID, range);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  // scan in row-chunks to find first populated block, columns A:H only
  for (let start = 1; start <= 2000; start += 200) {
    const end = start + 199;
    const m = await readRetry(`Salary Breakup!A${start}:H${end}`);
    const firstIdx = m.findIndex((r) => r && r.some((c) => String(c).trim() !== ""));
    if (firstIdx >= 0) {
      const absRow = start + firstIdx;
      console.log(`FIRST DATA at row ${absRow}`);
      // now read a fuller window there, cols A:AE
      const win = await readRetry(`Salary Breakup!A${absRow}:AE${absRow + 25}`);
      win.forEach((r, i) => console.log(String(absRow + i).padStart(4), JSON.stringify(r)));
      return;
    }
    console.log(`rows ${start}-${end}: empty`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
