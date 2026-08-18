import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingProposals, billingClients, billingClientEmails } from "@/db/schema";
import type { ProposalAttachment } from "@/db/schema";
import type { BillingProposalStatus, WmsProposalType } from "@/db/enums";

/**
 * Read side of the Billing › Proposals (WMS) section.
 *
 * Client details are JOINED rather than copied onto the proposal, so a phone
 * number corrected in the Client Address Book is immediately correct on every
 * proposal that client holds — the single source of truth the brief asked for.
 */
export interface ProposalRow {
  id: string;
  code: string;
  proposalDate: string;
  productType: string;
  wmsType: WmsProposalType | null;
  entity: string | null;
  toEmails: string[];
  ccEmails: string[];
  attachments: ProposalAttachment[];
  status: BillingProposalStatus;
  notes: string | null;
  clientId: string;
  clientName: string;
  clientCompany: string | null;
  clientPhone: string | null;
  clientContactPerson: string | null;
  clientEmail: string | null;
}

export async function listWmsProposals(): Promise<ProposalRow[]> {
  const rows = await db
    .select({
      id: billingProposals.id,
      code: billingProposals.code,
      proposalDate: billingProposals.proposalDate,
      productType: billingProposals.productType,
      wmsType: billingProposals.wmsType,
      entity: billingProposals.entity,
      toEmails: billingProposals.toEmails,
      ccEmails: billingProposals.ccEmails,
      attachments: billingProposals.attachments,
      status: billingProposals.status,
      notes: billingProposals.notes,
      clientId: billingProposals.clientId,
      clientName: billingClients.name,
      clientCompany: billingClients.company,
      clientPhone: billingClients.phone,
      clientContactPerson: billingClients.contactPerson,
      // The client's primary address, resolved in SQL so the list needs no
      // second query and no per-row fan-out.
      clientEmail: sql<string | null>`(
        SELECT e.email FROM ${billingClientEmails} e
        WHERE e.client_id = ${billingClients.id}
        ORDER BY e.is_primary DESC, e.email ASC
        LIMIT 1
      )`,
    })
    .from(billingProposals)
    .innerJoin(billingClients, eq(billingClients.id, billingProposals.clientId))
    .orderBy(desc(billingProposals.proposalDate), desc(billingProposals.createdAt));

  return rows as ProposalRow[];
}

/** Clients offered in the proposal form's picker — the Address Book, live. */
export async function listClientOptions() {
  return db
    .select({
      id: billingClients.id,
      name: billingClients.name,
      company: billingClients.company,
    })
    .from(billingClients)
    .where(eq(billingClients.isActive, true))
    .orderBy(asc(billingClients.name));
}

/**
 * Suggest the next Proposal Number for the year: WMS-2026-0001, …
 *
 * A suggestion only — the field stays editable because real proposal numbers
 * often have to match an external sequence. Uniqueness is enforced by the
 * database, not by this function.
 */
export async function suggestProposalNumber(year: number): Promise<string> {
  const prefix = `WMS-${year}-`;
  const [row] = await db
    .select({ maxCode: sql<string | null>`max(${billingProposals.code})` })
    .from(billingProposals)
    .where(sql`${billingProposals.code} LIKE ${prefix + "%"}`);
  const last = row?.maxCode ? Number(row.maxCode.slice(prefix.length)) : 0;
  const next = (Number.isFinite(last) ? last : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}
