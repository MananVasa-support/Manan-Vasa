import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingInvoices,
  billingInvoiceLines,
  billingIssuers,
  billingCustomers,
  billingCodes,
  billingServices,
  billingSacCodes,
  billingSequences,
} from "@/db/schema";

/**
 * Read side of Billing › Invoices, over the PRE-EXISTING invoice tables
 * (billing_invoices / _lines / _codes / _customers / _issuers / _services).
 * No new tables were created for this feature.
 */

export async function listInvoices() {
  return db
    .select({
      id: billingInvoices.id,
      docType: billingInvoices.docType,
      invoiceNo: billingInvoices.invoiceNo,
      code: billingInvoices.code,
      invoiceDate: billingInvoices.invoiceDate,
      customerName: billingInvoices.customerName,
      customerGstin: billingInvoices.customerGstin,
      taxMode: billingInvoices.taxMode,
      subtotal: billingInvoices.subtotal,
      total: billingInvoices.total,
      status: billingInvoices.status,
      convertedFromId: billingInvoices.convertedFromId,
    })
    .from(billingInvoices)
    .orderBy(desc(billingInvoices.invoiceDate), desc(billingInvoices.createdAt));
}

export type InvoiceListRow = Awaited<ReturnType<typeof listInvoices>>[number];

export async function getInvoice(id: string) {
  const [invoice] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1);
  if (!invoice) return null;
  const lines = await db
    .select()
    .from(billingInvoiceLines)
    .where(eq(billingInvoiceLines.invoiceId, id))
    .orderBy(asc(billingInvoiceLines.sortOrder));
  return { invoice, lines };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

/**
 * Options for the create form. `billing_customers` mirrors the Client Address
 * Book — every active address-book client is present there with its contact,
 * address and GSTIN, which is what the invoice snapshots on creation.
 */
export async function invoiceFormOptions() {
  const [customers, issuers, codes, services, sacCodes, sequences] = await Promise.all([
    db
      .select({
        id: billingCustomers.id,
        name: billingCustomers.name,
        kindAttn: billingCustomers.kindAttn,
        address: billingCustomers.address,
        city: billingCustomers.city,
        state: billingCustomers.state,
        pincode: billingCustomers.pincode,
        gstin: billingCustomers.gstin,
        contactNo: billingCustomers.contactNo,
      })
      .from(billingCustomers)
      .where(eq(billingCustomers.isActive, true))
      .orderBy(asc(billingCustomers.name)),
    db
      .select()
      .from(billingIssuers)
      .where(eq(billingIssuers.isActive, true))
      .orderBy(asc(billingIssuers.sortOrder)),
    db
      .select()
      .from(billingCodes)
      .where(eq(billingCodes.isActive, true))
      .orderBy(asc(billingCodes.sortOrder)),
    db
      .select()
      .from(billingServices)
      .where(eq(billingServices.isActive, true))
      .orderBy(asc(billingServices.sortOrder)),
    db
      .select()
      .from(billingSacCodes)
      .where(eq(billingSacCodes.isActive, true))
      .orderBy(asc(billingSacCodes.sortOrder)),
    // Read-only: lets the form PREVIEW the number the server will assign. The
    // numbering itself still happens in createInvoice, inside its transaction.
    db.select().from(billingSequences),
  ]);
  return { customers, issuers, codes, services, sacCodes, sequences };
}

export type InvoiceOptions = Awaited<ReturnType<typeof invoiceFormOptions>>;
