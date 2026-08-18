/**
 * Pure invoice maths and formatting. Dependency-free and total — no DB, no env,
 * no throwing — so it unit-tests standalone and runs on both server and client.
 *
 * Money is handled in integer PAISE. Rupee floats drift the moment you add a
 * base to two tax legs, and an invoice that is a paisa out is one a client can
 * refuse to pay.
 */

export const toPaise = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const toRupees = (paise: number): number => Math.round(paise) / 100;

// ── GST ────────────────────────────────────────────────────────────────────

/**
 * The supplier's own state code. GST is INTRA-state (CGST+SGST) when the
 * client's GSTIN begins with this, and INTER-state (IGST) otherwise.
 *
 * "27" is Maharashtra — the first two digits of every GSTIN are the state code.
 * Kept as a named constant rather than a literal so the rule is explicit and
 * moves in one place if the supplier's registration ever changes state.
 */
export const SUPPLIER_STATE_CODE = "27";

export interface GstSplit {
  /** Pre-tax value, rupees. */
  base: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** base + whichever legs apply. */
  total: number;
  /** True when CGST+SGST apply; false when IGST does. Never both. */
  isIntraState: boolean;
  ratePct: number;
}

/**
 * Split a base amount into tax legs from the CLIENT's GSTIN.
 *
 * Intra-state splits the rate in half across CGST and SGST; inter-state puts
 * the whole rate on IGST. The two are mutually exclusive by construction here —
 * a caller cannot accidentally render both, because the legs that do not apply
 * are hard zeros.
 *
 * A missing/blank GSTIN is treated as inter-state (IGST): an unregistered or
 * out-of-state client is the safer default, since wrongly charging CGST+SGST
 * on an inter-state supply is the error that cannot be reclaimed.
 */
export function gstSplit(clientGstin: string | null | undefined, baseRupees: number, ratePct = 18): GstSplit {
  const base = toPaise(baseRupees);
  const gstin = (clientGstin ?? "").trim();
  const isIntraState = gstin.startsWith(SUPPLIER_STATE_CODE);

  const totalTax = Math.round((base * ratePct) / 100);
  // Halve the TAX, not the rate, so an odd paisa lands somewhere rather than
  // vanishing: CGST takes the extra paisa and the legs still sum to totalTax.
  const half = Math.floor(totalTax / 2);
  const cgst = isIntraState ? totalTax - half : 0;
  const sgst = isIntraState ? half : 0;
  const igst = isIntraState ? 0 : totalTax;

  return {
    base: toRupees(base),
    cgst: toRupees(cgst),
    sgst: toRupees(sgst),
    igst: toRupees(igst),
    total: toRupees(base + cgst + sgst + igst),
    isIntraState,
    ratePct,
  };
}

// ── Amount in words (Indian numbering) ─────────────────────────────────────

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;
  const t = TENS[Math.floor(n / 10)]!;
  const o = ONES[n % 10]!;
  return o ? `${t} ${o}` : t;
}

/**
 * Indian-numbering words: crore / lakh / thousand / hundred — NOT millions.
 * An invoice reading "One Million" to an Indian client is wrong even though the
 * figure is right.
 *
 * Paise are rendered only when non-zero, as "and Fifty Paise Only".
 */
export function amountInWords(rupees: number): string {
  const paise = toPaise(rupees);
  if (paise === 0) return "Zero Rupees Only";
  const negative = paise < 0;
  let whole = Math.floor(Math.abs(paise) / 100);
  const fraction = Math.abs(paise) % 100;

  const parts: string[] = [];
  const crore = Math.floor(whole / 10_000_000);
  whole %= 10_000_000;
  const lakh = Math.floor(whole / 100_000);
  whole %= 100_000;
  const thousand = Math.floor(whole / 1_000);
  whole %= 1_000;
  const hundred = Math.floor(whole / 100);
  const rest = whole % 100;

  if (crore) parts.push(`${amountInWordsInt(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));

  const words = parts.join(" ").replace(/\s+/g, " ").trim();
  const rupeeWords = `${negative ? "Minus " : ""}${words} Rupees`;
  return fraction > 0 ? `${rupeeWords} and ${twoDigits(fraction)} Paise Only` : `${rupeeWords} Only`;
}

/** Crore counts can themselves exceed 99, so they recurse through the same rules. */
function amountInWordsInt(n: number): string {
  if (n < 100) return twoDigits(n);
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${twoDigits(hundred)} Hundred ${twoDigits(rest)}` : `${twoDigits(hundred)} Hundred`;
}

// ── Invoice dates ──────────────────────────────────────────────────────────

/** The only days of the month an invoice may be dated. */
export const INVOICE_DAYS = [3, 12, 21, 30] as const;

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * The next permitted invoice date on or after `fromIso` (YYYY-MM-DD).
 *
 * Rolls into the following month when no permitted day remains — and skips a
 * day the month does not have, so February never yields the 30th.
 */
export function nextInvoiceDate(fromIso: string): string {
  const m0 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso);
  if (!m0) return fromIso;
  let y = +m0[1]!;
  let mo = +m0[2]!;
  const d = +m0[3]!;

  const candidate = INVOICE_DAYS.find((x) => x >= d && x <= daysInMonth(y, mo));
  if (candidate) return iso(y, mo, candidate);

  mo += 1;
  if (mo > 12) {
    mo = 1;
    y += 1;
  }
  const next = INVOICE_DAYS.find((x) => x <= daysInMonth(y, mo)) ?? INVOICE_DAYS[0];
  return iso(y, mo, next);
}

/** True when a date sits on a permitted invoice day. */
export function isInvoiceDate(isoDate: string): boolean {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(isoDate);
  return !!m && (INVOICE_DAYS as readonly number[]).includes(+m[1]!);
}

// ── Invoice numbering ──────────────────────────────────────────────────────

/**
 * Indian financial year label for a date: April–March, rendered "26-27".
 * April 2026 → "26-27"; March 2026 → "25-26".
 */
export function financialYearLabel(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!m) return "";
  const y = +m[1]!;
  const mo = +m[2]!;
  const startYear = mo >= 4 ? y : y - 1;
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

/** "52/26-27" — the sequence within a financial year, then the FY label. */
export function formatInvoiceNumber(sequence: number, isoDate: string): string {
  return `${sequence}/${financialYearLabel(isoDate)}`;
}
