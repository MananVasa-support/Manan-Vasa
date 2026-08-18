import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingClients, billingClientEmails } from "@/db/schema";

/**
 * Read side of the Billing Client Address Book.
 *
 * Returns every field the rail renders in one shape, so selecting a client in
 * the sidebar needs no second round-trip — the whole directory is already in
 * memory on the client.
 */
export interface DirectoryClient {
  id: string;
  name: string;
  company: string | null;
  contactPerson: string | null;
  phone: string | null;
  /** The address parts joined for display; stored split for invoices later. */
  address: string;
  notes: string | null;
  emails: { id: string; email: string; label: string | null; isPrimary: boolean }[];
  primaryEmail: string | null;
}

export async function listClientDirectory(): Promise<DirectoryClient[]> {
  const rows = await db
    .select()
    .from(billingClients)
    .where(eq(billingClients.isActive, true))
    .orderBy(asc(billingClients.name));
  if (rows.length === 0) return [];

  // A second read rather than a join: a client with 4 addresses would otherwise
  // come back as 4 duplicated client rows needing de-duplication in app code.
  const emails = await db
    .select()
    .from(billingClientEmails)
    .where(inArray(billingClientEmails.clientId, rows.map((r) => r.id)))
    .orderBy(desc(billingClientEmails.isPrimary), asc(billingClientEmails.email));

  const byClient = new Map<string, DirectoryClient["emails"]>();
  for (const e of emails) {
    const list = byClient.get(e.clientId) ?? [];
    list.push({ id: e.id, email: e.email, label: e.label, isPrimary: e.isPrimary });
    byClient.set(e.clientId, list);
  }

  return rows.map((r) => {
    const mine = byClient.get(r.id) ?? [];
    return {
      id: r.id,
      name: r.name,
      company: r.company,
      contactPerson: r.contactPerson,
      phone: r.phone,
      address: [r.addressLine1, r.addressLine2, r.city, r.state, r.pincode]
        .filter((x) => x && String(x).trim() !== "")
        .join(", "),
      notes: r.notes,
      emails: mine,
      // Fall back to the first address so a client with emails but no primary
      // flag still shows one rather than an empty Email ID field.
      primaryEmail: mine.find((e) => e.isPrimary)?.email ?? mine[0]?.email ?? null,
    };
  });
}
