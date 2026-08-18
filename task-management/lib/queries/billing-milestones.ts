import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingMilestones, billingProposals, billingClients } from "@/db/schema";
import {
  milestoneStageRank,
  type BillingMilestoneStage,
  type BillingProposalStatus,
  type WmsProposalType,
} from "@/db/enums";

/**
 * Read side of a WMS proposal's Milestones section.
 *
 * Totals are computed in integer PAISE and converted once at the edge. Rupee
 * floats drift the moment you add three amounts, and a total that is a paisa off
 * reads as a data-entry error to whoever is reconciling it.
 */

/** Re-exported so callers keep one import for milestone ordering. */
export function stageRank(stage: string): number {
  return milestoneStageRank(stage);
}

function toPaise(v: string | null): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export interface MilestoneRow {
  id: string;
  stage: BillingMilestoneStage;
  title: string | null;
  description: string | null;
  dueDate: string | null;
  /** Rupees, or null when the milestone carries no payment. */
  amount: number | null;
  isDelivered: boolean;
  deliveredOn: string | null;
}

export interface ProposalWithMilestones {
  proposal: {
    id: string;
    code: string;
    proposalDate: string;
    productType: string;
    wmsType: WmsProposalType | null;
    entity: string | null;
    ccEmails: string[];
    status: BillingProposalStatus;
    notes: string | null;
  };
  client: {
    id: string;
    name: string;
    company: string | null;
    contactPerson: string | null;
    phone: string | null;
  };
  milestones: MilestoneRow[];
  totals: {
    /** Σ of every milestone amount, in rupees. */
    total: number;
    /** Σ of amounts on milestones already marked delivered. */
    delivered: number;
    /** Σ of amounts still outstanding on undelivered milestones. */
    pending: number;
    count: number;
    deliveredCount: number;
    /** 0–1 by VALUE, not by count — a delivered Advance is not "half done". */
    progress: number;
  };
}

export async function getProposalWithMilestones(id: string): Promise<ProposalWithMilestones | null> {
  const head = await db
    .select({
      id: billingProposals.id,
      code: billingProposals.code,
      proposalDate: billingProposals.proposalDate,
      productType: billingProposals.productType,
      wmsType: billingProposals.wmsType,
      entity: billingProposals.entity,
      ccEmails: billingProposals.ccEmails,
      status: billingProposals.status,
      notes: billingProposals.notes,
      clientId: billingClients.id,
      clientName: billingClients.name,
      clientCompany: billingClients.company,
      clientContactPerson: billingClients.contactPerson,
      clientPhone: billingClients.phone,
    })
    .from(billingProposals)
    .innerJoin(billingClients, eq(billingClients.id, billingProposals.clientId))
    .where(eq(billingProposals.id, id))
    .limit(1);

  if (head.length === 0) return null;
  const h = head[0]!;

  const rows = await db.select().from(billingMilestones).where(eq(billingMilestones.proposalId, id));

  const milestones: MilestoneRow[] = rows
    .map((m) => ({
      id: m.id,
      stage: m.stage as BillingMilestoneStage,
      title: m.title,
      description: m.description,
      dueDate: m.dueDate,
      amount: m.amount === null ? null : toPaise(m.amount) / 100,
      isDelivered: m.isDelivered,
      deliveredOn: m.deliveredOn,
    }))
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage));

  let totalP = 0;
  let deliveredP = 0;
  for (const m of rows) {
    const p = toPaise(m.amount);
    totalP += p;
    if (m.isDelivered) deliveredP += p;
  }

  return {
    proposal: {
      id: h.id,
      code: h.code,
      proposalDate: h.proposalDate,
      productType: h.productType,
      wmsType: h.wmsType as WmsProposalType | null,
      entity: h.entity,
      ccEmails: h.ccEmails ?? [],
      status: h.status as BillingProposalStatus,
      notes: h.notes,
    },
    client: {
      id: h.clientId,
      name: h.clientName,
      company: h.clientCompany,
      contactPerson: h.clientContactPerson,
      phone: h.clientPhone,
    },
    milestones,
    totals: {
      total: totalP / 100,
      delivered: deliveredP / 100,
      pending: (totalP - deliveredP) / 100,
      count: rows.length,
      deliveredCount: rows.filter((m) => m.isDelivered).length,
      // By value: delivering the Advance on a ₹5L proposal is 20% done, not 50%
      // just because it is one of two stages. Guard the empty case so a proposal
      // with no priced milestones reads 0%, not NaN.
      progress: totalP <= 0 ? 0 : Math.min(1, deliveredP / totalP),
    },
  };
}
