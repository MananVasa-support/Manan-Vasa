import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getAccountsSection } from "@/lib/accounts/sections";
import { fyStartYearFor } from "@/lib/accounts/monthly";
import { listVasaBalances } from "@/lib/queries/accounts-vasa";
import { listShares } from "@/lib/queries/accounts-shares";
import { listItFolders } from "@/lib/queries/accounts-it";
import { listSipItems } from "@/lib/queries/accounts-sip";
import { listBankItems } from "@/lib/queries/accounts-bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

type Field = { label: string; value: string };
type Row = { title: string; subtitle: string | null; link: string | null; fields: Field[] };
type Section = { title: string; subtitle: string; stats: Field[]; rows: Row[] };

const kv = (label: string, value: string | null | undefined): Field | null =>
  value && value.trim() ? { label, value: value.trim() } : null;
const fields = (...xs: (Field | null)[]): Field[] => xs.filter(Boolean) as Field[];

function currentFy(): number {
  const n = new Date();
  return fyStartYearFor(n.getFullYear(), n.getMonth() + 1);
}

/** Builds the normalized detail for the flat-register sections we surface on
 *  mobile. Grid/checklist sections (weekly/monthly/CC/cash/fno) return null for
 *  now — they stay "best on web". */
async function build(slug: string): Promise<Section | null> {
  const def = getAccountsSection(slug);
  const title = def?.title ?? "Section";
  const subtitle = def?.blurb ?? "";

  switch (slug) {
    case "vasa-family-interpersonal": {
      const rows = await listVasaBalances();
      return {
        title,
        subtitle,
        stats: [{ label: "Entries", value: String(rows.length) }],
        rows: rows.map((r) => ({
          title: [r.party, r.direction, r.counterparty].filter(Boolean).join(" ") || "Entry",
          subtitle: r.amount ? `₹${r.amount}` : null,
          link: null,
          fields: fields(kv("As on", r.asOn), kv("Notes", r.notes)),
        })),
      };
    }
    case "shares-register": {
      const rows = await listShares();
      return {
        title,
        subtitle,
        stats: [{ label: "Holdings", value: String(rows.length) }],
        rows: rows.map((r) => ({
          title: r.company || r.code || "Holding",
          subtitle: r.entity ?? null,
          link: null,
          fields: fields(
            kv("Qty", r.qty),
            kv("Rate", r.rate),
            kv("Value", r.value),
            kv("Folio/Demat", r.folioDemat),
            kv("Txn date", r.txnDate),
            kv("Notes", r.notes),
          ),
        })),
      };
    }
    case "income-tax-master-folder": {
      const rows = await listItFolders();
      return {
        title,
        subtitle,
        stats: [{ label: "Folders", value: String(rows.length) }],
        rows: rows.map((r) => ({
          title: r.entity || "Entity",
          subtitle: r.fy ? `FY ${r.fy}` : null,
          link: r.folderLink && r.folderLink.trim() ? r.folderLink.trim() : null,
          fields: fields(kv("Notes", r.notes)),
        })),
      };
    }
    case "sip-tracker": {
      const rows = await listSipItems(currentFy());
      return {
        title,
        subtitle,
        stats: [{ label: "SIPs", value: String(rows.length) }],
        rows: rows.map((r) => ({
          title: r.fundName || r.code || "SIP",
          subtitle: r.entity ?? null,
          link: null,
          fields: fields(kv("Monthly", r.amount ? `₹${r.amount}` : null), kv("Type", r.type), kv("SIP date", r.sipDate), kv("Location", r.location)),
        })),
      };
    }
    case "bank-balance": {
      const rows = await listBankItems(currentFy());
      return {
        title,
        subtitle,
        stats: [{ label: "Accounts", value: String(rows.length) }],
        rows: rows.map((r) => ({
          title: r.entity || r.code || "Account",
          subtitle: r.targetBalance ? `Target ₹${r.targetBalance}` : null,
          link: null,
          fields: fields(kv("Code", r.code)),
        })),
      };
    }
    default:
      return null;
  }
}

/**
 * GET /api/mobile/accounts/section/[slug] — a normalized detail for an Accounts
 * register section (Vasa · Shares · IT folders · SIP · Bank). Super-admin gated.
 * Grid/checklist sections return 404 ("best on web") for now.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  if (!isSuperAdmin(auth.employee.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }
  const { slug } = await ctx.params;
  const section = await build(slug);
  if (!section) {
    return NextResponse.json({ error: "not-on-mobile" }, { status: 404, headers: MOBILE_CORS });
  }
  return NextResponse.json(section, { headers: MOBILE_CORS });
}
