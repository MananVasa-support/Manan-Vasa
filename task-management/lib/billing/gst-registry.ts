/**
 * GST registry lookup — GSTIN → registered company name.
 *
 * Two layers, deliberately separate:
 *
 *  1. `decodeGstin` works with NO configuration and no network. A GSTIN is not
 *     opaque: digits 1-2 are the state code and characters 3-12 are the holder's
 *     PAN, so validity, state and PAN are all derivable offline. The 15th
 *     character is a mod-36 check digit, which is what makes "valid GSTIN"
 *     something we can actually assert rather than pattern-match.
 *
 *  2. `fetchFromRegistry` calls a GST API for the one thing the GSTIN itself
 *     does not encode — the registered legal / trade name. There is no free
 *     official endpoint for this: the GST portal rejects programmatic requests
 *     outright, and every commercial provider is key-gated. So this ships as a
 *     provider layer with presets — set one provider's key in .env.local and the
 *     lookup starts resolving names; no code change, no redeploy.
 */

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GST state codes (first two digits of every GSTIN). */
const STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "28": "Andhra Pradesh",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh",
  "38": "Ladakh", "97": "Other Territory", "99": "Centre Jurisdiction",
};

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
export const normGstin = (s?: string | null) => (s ?? "").replace(/\s+/g, "").toUpperCase();

export interface GstinDecoded {
  gstin: string;
  formatOk: boolean;
  checksumOk: boolean;
  /** Format AND check digit both pass — a structurally genuine GSTIN. */
  valid: boolean;
  stateCode: string;
  stateName: string | null;
  pan: string;
}

/**
 * The official mod-36 check digit: each of the first 14 characters is weighted
 * 1, 2, 1, 2 … and the digit sums of the products are summed.
 */
function checkDigit(first14: string): string | null {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]!);
    if (value < 0) return null;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36]!;
}

/** Everything a GSTIN tells you on its own — no API, no configuration. */
export function decodeGstin(raw: string): GstinDecoded {
  const gstin = normGstin(raw);
  const formatOk = GSTIN_RE.test(gstin);
  const checksumOk = gstin.length === 15 && checkDigit(gstin.slice(0, 14)) === gstin[14];
  const stateCode = gstin.slice(0, 2);
  return {
    gstin,
    formatOk,
    checksumOk,
    valid: formatOk && checksumOk,
    stateCode,
    stateName: STATES[stateCode] ?? null,
    pan: gstin.slice(2, 12),
  };
}

export interface RegistryHit {
  name: string;
  legalName: string | null;
  tradeName: string | null;
  status: string | null;
  address: string | null;
  provider: string;
}

/** Both spellings are honoured — MASTERSINDIA and MASTERINDIA. */
function mastersIndia() {
  return {
    key: process.env.MASTERSINDIA_API_KEY || process.env.MASTERINDIA_API_KEY,
    clientId: process.env.MASTERSINDIA_CLIENT_ID || process.env.MASTERINDIA_CLIENT_ID,
  };
}

type Preset = {
  id: string;
  /** Present only when this provider's credentials are configured. */
  enabled: () => boolean;
  /** True for a source that needs no credentials at all. */
  keyless?: boolean;
  request: (gstin: string) => { url: string; headers?: Record<string, string> };
  /** Turn the raw body into an object for the field pickers. Default: JSON. */
  extract?: (raw: string, gstin: string) => unknown;
};

/**
 * Razorpay publishes a public GSTIN search page that embeds the registry's own
 * answer as JSON in the served HTML. It needs no credentials, which makes it the
 * only source that works out of the box.
 *
 * It is a public page rather than a contracted API, so the markup can change
 * without notice. That is why it is tried LAST, behind every configured
 * provider, and why a real API key is still the right call for production.
 * Nothing is invented here: the name returned is whatever the page reports for
 * the GSTIN asked about, and the answer is rejected if it is about another one.
 */
function extractPublicPage(html: string, gstin: string): Record<string, string> | null {
  const at = html.indexOf('"legal_name"');
  if (at < 0) return null;

  // The record's remaining fields follow legal_name, so scope the search to that
  // window — an unrelated "status" elsewhere on the page must not win.
  const scope = html.slice(at, at + 1500);
  const before = html.slice(Math.max(0, at - 600), at);
  const pick = (key: string, hay: string): string => {
    const m = hay.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return m?.[1] ? m[1].replace(/\\u002F/g, "/").replace(/\\"/g, '"').trim() : "";
  };

  // Only trust a page that is answering about the GSTIN we asked for.
  const echoed = pick("gstin", before) || pick("gstin", scope);
  if (echoed && echoed.toUpperCase() !== gstin.toUpperCase()) return null;

  const legal = pick("legal_name", scope);
  const trade = pick("trade_name", scope);
  if (!legal && !trade) return null;

  return {
    lgnm: legal,
    tradeNam: trade || legal,
    sts: pick("status", scope),
    address: pick("primary_address", scope),
  };
}

/**
 * Providers, in the order they are tried. Each activates purely by the presence
 * of its own env keys, so configuring one is a .env.local edit and a restart.
 */
const PRESETS: Preset[] = [
  {
    // https://gstincheck.co.in — key goes in the path.
    id: "gstincheck",
    enabled: () => !!process.env.GSTINCHECK_API_KEY,
    request: (g) => ({ url: `https://sheet.gstincheck.co.in/check/${process.env.GSTINCHECK_API_KEY}/${g}` }),
  },
  {
    // https://appyflow.in — key as a query parameter.
    id: "appyflow",
    enabled: () => !!process.env.APPYFLOW_API_KEY,
    request: (g) => ({
      url: `https://appyflow.in/api/verifyGST?gstNo=${g}&key_secret=${encodeURIComponent(process.env.APPYFLOW_API_KEY!)}`,
    }),
  },
  {
    // https://mastersindia.co — bearer token plus client id header.
    id: "mastersindia",
    enabled: () => !!mastersIndia().key && !!mastersIndia().clientId,
    request: (g) => ({
      url: `https://commonapi.mastersindia.co/commonapis/searchgstin?gstin=${g}`,
      headers: {
        Authorization: `Bearer ${mastersIndia().key}`,
        client_id: mastersIndia().clientId!,
      },
    }),
  },
  {
    // Any RapidAPI GST verification listing.
    id: "rapidapi",
    enabled: () => !!process.env.RAPIDAPI_GST_KEY && !!process.env.RAPIDAPI_GST_HOST,
    request: (g) => ({
      url: `https://${process.env.RAPIDAPI_GST_HOST}/${g}`,
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_GST_KEY!,
        "x-rapidapi-host": process.env.RAPIDAPI_GST_HOST!,
      },
    }),
  },
  {
    // Escape hatch for any other provider: put {gstin} in the URL.
    id: "custom",
    enabled: () => !!process.env.GST_LOOKUP_API_URL,
    request: (g) => {
      const key = process.env.GST_LOOKUP_API_KEY ?? "";
      return {
        url: process.env.GST_LOOKUP_API_URL!.replace("{gstin}", g).replace("{key}", key),
        headers: key ? { Authorization: `Bearer ${key}`, "x-api-key": key } : undefined,
      };
    },
  },
  {
    // Keyless public source. Always available, always tried last. Set
    // GST_PUBLIC_LOOKUP=off to disable it and rely solely on a paid provider.
    id: "public-page",
    enabled: () => process.env.GST_PUBLIC_LOOKUP !== "off",
    keyless: true,
    request: (g) => ({
      url: `https://razorpay.com/gst-number-search/${g}/`,
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    }),
    extract: extractPublicPage,
  },
];

/** Which providers are configured right now — drives the UI's guidance. */
export function configuredProviders(): string[] {
  return PRESETS.filter((p) => p.enabled()).map((p) => p.id);
}

/** Field names the various providers use for the same three facts. */
const NAME_KEYS = ["tradeNam", "tradeName", "trade_name", "lgnm", "legalName", "legal_name", "businessName", "name"];
const LEGAL_KEYS = ["lgnm", "legalName", "legal_name"];
const TRADE_KEYS = ["tradeNam", "tradeName", "trade_name"];
const STATUS_KEYS = ["sts", "status", "gstinStatus"];

function findString(payload: unknown, keys: string[]): string | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): string | null => {
    if (!node || typeof node !== "object" || depth > 5 || seen.has(node)) return null;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    for (const v of Object.values(obj)) {
      const hit = walk(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(payload, 0);
}

/** Flatten whatever address object a provider returns into one line. */
function findAddress(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const parts = ["bno", "bnm", "flno", "st", "loc", "dst", "stcd", "pncd"];
  const walk = (node: unknown, depth: number): string | null => {
    if (!node || typeof node !== "object" || depth > 5 || seen.has(node)) return null;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    const line = parts.map((k) => obj[k]).filter((v): v is string => typeof v === "string" && !!v.trim());
    if (line.length >= 3) return line.join(", ");
    if (typeof obj.address === "string" && obj.address.trim()) return obj.address.trim();
    for (const v of Object.values(obj)) {
      const hit = walk(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(payload, 0);
}

export type RegistryOutcome =
  | { ok: true; hit: RegistryHit }
  | { ok: false; reason: "unconfigured" | "not-found" | "error"; message: string };

/**
 * Ask the configured GST API for the registered name behind a GSTIN.
 * Providers are tried in order; the first that answers with a name wins.
 */
export async function fetchFromRegistry(rawGstin: string): Promise<RegistryOutcome> {
  const gstin = normGstin(rawGstin);
  const active = PRESETS.filter((p) => p.enabled());

  if (active.length === 0) {
    return {
      ok: false,
      reason: "unconfigured",
      // Names the single variable to set, not a menu — this is a missing
      // credential, and must never read as "the GSTIN is wrong".
      message: "Set GSTINCHECK_API_KEY in .env.local to fetch company names.",
    };
  }

  const failures: string[] = [];
  for (const preset of active) {
    try {
      const { url, headers } = preset.request(gstin);
      const res = await fetch(url, {
        headers: { Accept: "application/json", ...(headers ?? {}) },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) {
        failures.push(`${preset.id}: HTTP ${res.status}`);
        continue;
      }
      // Not every source is JSON — the public page hands back HTML.
      const body = await res.text();
      let payload: unknown = null;
      try {
        payload = preset.extract ? preset.extract(body, gstin) : JSON.parse(body);
      } catch {
        payload = null;
      }
      const name = payload ? findString(payload, NAME_KEYS) : null;
      if (!name) {
        failures.push(`${preset.id}: no name in response`);
        continue;
      }
      return {
        ok: true,
        hit: {
          name,
          legalName: findString(payload, LEGAL_KEYS),
          tradeName: findString(payload, TRADE_KEYS),
          status: findString(payload, STATUS_KEYS),
          address: findAddress(payload),
          provider: preset.id,
        },
      };
    } catch (e) {
      failures.push(`${preset.id}: ${(e as Error).message}`);
    }
  }

  return {
    ok: false,
    reason: "not-found",
    message: `The GST registry returned no company for this GSTIN (${failures.join("; ")}).`,
  };
}
