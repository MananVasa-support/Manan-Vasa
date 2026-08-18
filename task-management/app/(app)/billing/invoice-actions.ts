"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingInvoices,
  billingInvoiceLines,
  billingIssuers,
  billingCustomers,
  billingClients,
  billingCodes,
  billingSequences,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { gstSplit, amountInWords, financialYearLabel } from "@/lib/billing/invoice-math";
import { decodeGstin, fetchFromRegistry, normGstin } from "@/lib/billing/gst-registry";

/**
 * Invoice writes, kept in their own "use server" file rather than appended to
 * the Billing actions — invoices are a distinct surface with a distinct table
 * set, and the two do not share helpers.
 */

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function firstIssue(e: unknown): string {
  const err = e as { issues?: { message: string }[]; message?: string };
  if (err?.issues?.length) return err.issues[0]!.message;
  return err?.message ?? "Something went wrong";
}

/** Where a resolved company name came from. */
export type GstinSource = "registry" | "address-book" | "past-invoice";

export interface GstinLookup {
  /** True when the GSTIN is structurally genuine (format + mod-36 check digit). */
  valid: boolean;
  gstin: string;
  /** Derived from the GSTIN itself — always present, never needs an API. */
  stateCode: string;
  stateName: string | null;
  pan: string;
  /** The registered company name, when it could be resolved. */
  name: string | null;
  source: GstinSource | null;
  /** Set only when the GSTIN also belongs to a client we already hold. */
  customerId: string | null;
  kindAttn: string | null;
  address: string | null;
  contactNo: string | null;
  /** Provider id, registration status — shown as supporting detail. */
  provider: string | null;
  status: string | null;
  /** Why the name could not be resolved, when it could not be. */
  note: string | null;
  /** No provider configured — the UI says how to fix it rather than dead-ending. */
  unconfigured: boolean;
}

/**
 * Resolve a GSTIN to the company it belongs to, for the invoice form's To field.
 *
 * The GST REGISTRY is the primary source and is queried for any valid GSTIN,
 * whether or not the company exists locally — an operator raising an invoice for
 * a brand-new customer must not have to create an Address Book entry first.
 *
 * The Address Book is consulted purely as an enrichment: when the GSTIN happens
 * to belong to a client we already hold, we also return that client's id, Kind
 * Attn., address and contact, which lets the form fill the rest of the details
 * and lets the invoice be created against the existing record. It is never a
 * precondition, and its absence is never an error.
 */
export async function lookupGstin(rawGstin: string): Promise<GstinLookup> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);

  const d = decodeGstin(rawGstin);
  const base: GstinLookup = {
    valid: d.valid,
    gstin: d.gstin,
    stateCode: d.stateCode,
    stateName: d.stateName,
    pan: d.pan,
    name: null,
    source: null,
    customerId: null,
    kindAttn: null,
    address: null,
    contactNo: null,
    provider: null,
    status: null,
    note: null,
    unconfigured: false,
  };

  if (limited) return { ...base, note: limited.error };
  if (!d.formatOk) return { ...base, note: "Enter the full 15-character GSTIN." };

  // The registry is queried for EVERY well-formed GSTIN. The mod-36 check digit
  // is advisory only and never gates the lookup: the registry is the authority
  // on whether a GSTIN exists, and a local heuristic must not veto it.
  const registry = await fetchFromRegistry(d.gstin);
  if (registry.ok) {
    base.name = registry.hit.name;
    base.source = "registry";
    base.provider = registry.hit.provider;
    base.status = registry.hit.status;
    base.address = registry.hit.address;
  } else {
    base.unconfigured = registry.reason === "unconfigured";
    // Never report a configuration gap as a bad GSTIN. Only once a provider is
    // actually reachable and found nothing does the check digit become a useful
    // hint about a possible typo.
    base.note =
      registry.reason === "unconfigured" || d.checksumOk
        ? registry.message
        : `${registry.message} Its check digit also does not match, so the GSTIN may contain a typo.`;
  }

  // Then the Address Book, purely to enrich — and to supply the customerId the
  // invoice is created against when we happen to already know this company.
  try {
    const cust = (await db.select().from(billingCustomers).where(eq(billingCustomers.isActive, true))).find(
      (c) => normGstin(c.gstin) === d.gstin,
    );
    if (cust) {
      base.customerId = cust.id;
      base.name = base.name ?? cust.name;
      base.source = base.source ?? "address-book";
      base.kindAttn = cust.kindAttn;
      base.contactNo = cust.contactNo;
      base.address =
        base.address ?? ([cust.address, cust.city, cust.state, cust.pincode].filter(Boolean).join(", ") || null);
      base.note = base.source === "address-book" ? null : base.note;
    } else {
      const client = (await db.select().from(billingClients).where(eq(billingClients.isActive, true))).find(
        (c) => normGstin(c.gstin) === d.gstin,
      );
      if (client) {
        base.name = base.name ?? (client.company || client.name);
        base.source = base.source ?? "address-book";
        base.kindAttn = client.contactPerson;
        base.contactNo = client.phone;
        base.address =
          base.address ??
          ([client.addressLine1, client.addressLine2, client.city, client.state, client.pincode]
            .filter(Boolean)
            .join(", ") || null);
        base.note = base.source === "address-book" ? null : base.note;
      }
    }
  } catch {
    // An Address Book hiccup must not sink a successful registry lookup.
  }

  // Finally, our own invoice history. Once a GSTIN has been billed, the name it
  // was billed under is known — so the second invoice for a company fills itself
  // in with no registry key and no Address Book entry. Their own data, never
  // invented: only a name previously entered or fetched on a real invoice.
  if (!base.name) {
    try {
      const [prior] = await db
        .select({
          customerName: billingInvoices.customerName,
          kindAttn: billingInvoices.kindAttn,
          billingAddress: billingInvoices.billingAddress,
          contactNo: billingInvoices.contactNo,
          customerState: billingInvoices.customerState,
        })
        .from(billingInvoices)
        .where(eq(billingInvoices.customerGstin, d.gstin))
        .orderBy(desc(billingInvoices.createdAt))
        .limit(1);
      if (prior?.customerName) {
        base.name = prior.customerName;
        base.source = "past-invoice";
        base.kindAttn = base.kindAttn ?? prior.kindAttn;
        base.address = base.address ?? prior.billingAddress;
        base.contactNo = base.contactNo ?? prior.contactNo;
        base.stateName = base.stateName ?? prior.customerState;
        base.note = null;
      }
    } catch {
      // History is a convenience; never let it break the lookup.
    }
  }

  return base;
}

export interface CreateInvoiceInput {
  docType: "proforma" | "tax";
  /** An Address Book client, when the invoice is for one. Optional. */
  customerId?: string;
  entityId?: string | null;
  code: string;
  invoiceDate: string;
  description: string;
  sacCode?: string | null;
  amount: number;
  gstRate?: number;
  /** Typed / registry-resolved party, used when there is no customerId. */
  customerName?: string;
  customerGstin?: string | null;
  kindAttn?: string | null;
  billingAddress?: string | null;
  contactNo?: string | null;
  customerState?: string | null;
  customerStateCode?: string | null;
}

/**
 * Create a Proforma or Tax invoice.
 *
 * Client, entity, GST legs and totals are RESOLVED here and SNAPSHOTTED onto the
 * row. An invoice is a legal document: editing the address book afterwards must
 * not retroactively change what was issued.
 *
 * The number is `<seq>/<fy>`, where seq starts at the code's own series number
 * (WMS = 52) and increments per code + doc type + financial year via
 * billing_sequences. Proforma and Tax number independently.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<ActionResult<{ id: string; invoiceNo: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;

  if (!(input?.customerId || input?.customerName?.trim()) || !input?.code || !input?.invoiceDate) {
    return { ok: false, error: "Client name, code and invoice date are required" };
  }
  const docType = input.docType === "tax" ? "tax" : "proforma";
  const rate = Number.isFinite(input.gstRate) ? Number(input.gstRate) : 18;

  try {
    const out = await db.transaction(async (tx) => {
      const cust = input.customerId
        ? (await tx.select().from(billingCustomers).where(eq(billingCustomers.id, input.customerId)).limit(1))[0]
        : undefined;
      if (input.customerId && !cust) throw new Error("Client not found");

      // Prefer the record we hold; fall back to what the form resolved. An
      // invoice is a snapshot either way, so nothing here depends on the
      // client still existing (or ever having existed) in the Address Book.
      const party = {
        name: (input.customerName?.trim() || cust?.name) ?? "",
        kindAttn: cust?.kindAttn ?? input.kindAttn ?? null,
        address:
          cust
            ? [cust.address, cust.city, cust.state, cust.pincode].filter(Boolean).join(", ") || null
            : input.billingAddress ?? null,
        contactNo: cust?.contactNo ?? input.contactNo ?? null,
        gstin: cust?.gstin ?? input.customerGstin ?? null,
        state: cust?.state ?? input.customerState ?? null,
        stateCode: cust?.stateCode ?? input.customerStateCode ?? null,
      };
      if (!party.name) throw new Error("Client name is required");

      const issuerRows = input.entityId
        ? await tx.select().from(billingIssuers).where(eq(billingIssuers.id, input.entityId)).limit(1)
        : await tx.select().from(billingIssuers).where(eq(billingIssuers.isActive, true)).limit(1);
      const ent = issuerRows[0];

      const [codeRow] = await tx.select().from(billingCodes).where(eq(billingCodes.key, input.code)).limit(1);
      const fy = financialYearLabel(input.invoiceDate);
      const seriesStart = (docType === "tax" ? codeRow?.taxCode : codeRow?.proformaCode) ?? 1;

      const [seqRow] = await tx
        .select()
        .from(billingSequences)
        .where(
          and(
            eq(billingSequences.code, input.code),
            eq(billingSequences.docType, docType),
            eq(billingSequences.fy, fy),
          ),
        )
        .limit(1);
      const seq = seqRow ? seqRow.nextSeq : seriesStart;
      if (seqRow) {
        await tx.update(billingSequences).set({ nextSeq: seq + 1 }).where(eq(billingSequences.id, seqRow.id));
      } else {
        await tx.insert(billingSequences).values({ code: input.code, docType, fy, nextSeq: seq + 1 });
      }

      // CGST+SGST when the client's GSTIN is Maharashtra (27…), else IGST.
      const g = gstSplit(party.gstin, Number(input.amount ?? 0), rate);

      const [row] = await tx
        .insert(billingInvoices)
        .values({
          docType,
          invoiceNo: `${seq}/${fy}`,
          code: input.code,
          seq,
          fy,
          entityId: ent?.id ?? null,
          customerId: cust?.id ?? null,
          invoiceDate: input.invoiceDate,
          customerName: party.name,
          kindAttn: party.kindAttn,
          billingAddress: party.address,
          contactNo: party.contactNo,
          customerGstin: party.gstin,
          customerState: party.state,
          customerStateCode: party.stateCode,
          entityName: ent?.name ?? null,
          entityGstin: ent?.gstin ?? null,
          entityPan: ent?.pan ?? null,
          entityAddress: ent?.address ?? null,
          bankName: ent?.bankName ?? null,
          bankAccountNo: ent?.bankAccountNo ?? null,
          bankIfsc: ent?.bankIfsc ?? null,
          bankBranch: ent?.bankBranch ?? null,
          interestTerms: ent?.interestTerms ?? null,
          tdsNote: ent?.tdsNote ?? null,
          signatureLabel: ent?.signatureLabel ?? null,
          taxMode: g.isIntraState ? "cgst_sgst" : "igst",
          cgstRate: g.isIntraState ? String(rate / 2) : "0",
          sgstRate: g.isIntraState ? String(rate / 2) : "0",
          igstRate: g.isIntraState ? "0" : String(rate),
          subtotal: String(g.base),
          cgstAmount: String(g.cgst),
          sgstAmount: String(g.sgst),
          igstAmount: String(g.igst),
          roundOff: "0",
          total: String(g.total),
          amountInWords: amountInWords(g.total),
          status: docType === "tax" ? "issued" : "draft",
          createdById: me.id,
        })
        .returning({ id: billingInvoices.id, invoiceNo: billingInvoices.invoiceNo });

      await tx.insert(billingInvoiceLines).values({
        invoiceId: row!.id,
        sortOrder: 0,
        description: input.description || input.code,
        sacCode: input.sacCode ?? null,
        quantity: "1",
        rate: String(Number(input.amount ?? 0)),
        amount: String(Number(input.amount ?? 0)),
      });

      return row!;
    });

    revalidatePath("/billing/invoices");
    return { ok: true, id: out.id, invoiceNo: out.invoiceNo };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

/**
 * Issue a Tax Invoice from a Proforma.
 *
 * The tax invoice gets a NEW number from the TAX series — it does not reuse the
 * proforma's, because the two are separate statutory sequences. The proforma is
 * marked converted and the two rows point at each other via converted_from_id.
 */
export async function issueTaxInvoice(proformaId: string): Promise<ActionResult<{ id: string; invoiceNo: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;

  try {
    const [p] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, proformaId)).limit(1);
    if (!p) return { ok: false, error: "Proforma not found" };
    if (p.docType !== "proforma") return { ok: false, error: "Only a Proforma can be issued as a Tax Invoice" };
    if (p.status === "converted") return { ok: false, error: "This Proforma has already been issued as a Tax Invoice" };

    const lines = await db.select().from(billingInvoiceLines).where(eq(billingInvoiceLines.invoiceId, p.id));

    const out = await db.transaction(async (tx) => {
      const [codeRow] = await tx.select().from(billingCodes).where(eq(billingCodes.key, p.code)).limit(1);
      const [seqRow] = await tx
        .select()
        .from(billingSequences)
        .where(
          and(
            eq(billingSequences.code, p.code),
            eq(billingSequences.docType, "tax"),
            eq(billingSequences.fy, p.fy),
          ),
        )
        .limit(1);
      const seq = seqRow ? seqRow.nextSeq : (codeRow?.taxCode ?? 1);
      if (seqRow) {
        await tx.update(billingSequences).set({ nextSeq: seq + 1 }).where(eq(billingSequences.id, seqRow.id));
      } else {
        await tx.insert(billingSequences).values({ code: p.code, docType: "tax", fy: p.fy, nextSeq: seq + 1 });
      }

      // Copy every snapshot field forward; only identity/series/status differ.
      const { id: _id, createdAt: _c, updatedAt: _u, ...carried } = p;
      const [row] = await tx
        .insert(billingInvoices)
        .values({
          ...carried,
          docType: "tax",
          seq,
          invoiceNo: `${seq}/${p.fy}`,
          status: "issued",
          convertedFromId: p.id,
          convertedAt: new Date(),
          createdById: me.id,
        })
        .returning({ id: billingInvoices.id, invoiceNo: billingInvoices.invoiceNo });

      if (lines.length > 0) {
        await tx.insert(billingInvoiceLines).values(
          lines.map((l) => ({
            invoiceId: row!.id,
            sortOrder: l.sortOrder,
            serviceId: l.serviceId,
            subServiceId: l.subServiceId,
            description: l.description,
            sacCode: l.sacCode,
            quantity: l.quantity,
            rate: l.rate,
            amount: l.amount,
          })),
        );
      }

      await tx
        .update(billingInvoices)
        .set({ status: "converted", convertedAt: new Date(), updatedAt: new Date() })
        .where(eq(billingInvoices.id, p.id));

      return row!;
    });

    revalidatePath("/billing/invoices");
    return { ok: true, id: out.id, invoiceNo: out.invoiceNo };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

export async function deleteInvoice(id: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "Only an admin can delete an invoice" };
  try {
    await db.delete(billingInvoices).where(eq(billingInvoices.id, id));
    revalidatePath("/billing/invoices");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

/**
 * Tally sales-voucher CSV for the selected invoices. Returned as a string the
 * client turns into a download, so no extra route or auth surface is needed.
 */
export async function exportInvoicesCsv(ids: string[]): Promise<ActionResult<{ csv: string }>> {
  await requireUser();
  if (!ids?.length) return { ok: false, error: "Select at least one invoice" };
  try {
    const rows = await db.select().from(billingInvoices);
    const picked = rows.filter((r) => ids.includes(r.id));
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Date", "Voucher Type", "Voucher No", "Party Ledger", "Party GSTIN",
      "Sales Ledger", "Taxable Amount", "CGST", "SGST", "IGST", "Total", "Narration",
    ];
    const body = picked.map((r) =>
      [
        r.invoiceDate,
        r.docType === "tax" ? "Sales" : "Proforma",
        r.invoiceNo,
        r.customerName,
        r.customerGstin,
        r.code,
        r.subtotal,
        r.cgstAmount,
        r.sgstAmount,
        r.igstAmount,
        r.total,
        `${r.code} ${r.invoiceNo}`,
      ].map(esc).join(","),
    );
    return { ok: true, csv: [header.join(","), ...body].join("\r\n") };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}
