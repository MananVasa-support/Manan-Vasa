import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingPaymentSchedule, billingMilestones } from "@/db/schema";
import { milestoneStageLabel, type BillingPaymentType } from "@/db/enums";
import { lineTotals, sumSchedule, type LineTotals, type ScheduleTotals } from "@/lib/billing/schedule-math";

/**
 * Read side of a proposal's Payment Schedule. Every figure is rolled up through
 * lib/billing/schedule-math.ts, so a number shown on a line and the same number
 * in the totals row cannot disagree.
 */
export interface ScheduleRowView {
  id: string;
  paymentType: BillingPaymentType;
  productType: string | null;
  description: string | null;
  notes: string | null;
  gstRate: number;
  tdsRate: number;
  isFinal: boolean;
  tentativeDate: string | null;
  actualDate: string | null;
  receiptDate: string | null;
  milestoneId: string | null;
  /** Stage label of the linked milestone, e.g. "M2". Null when unlinked. */
  milestoneStage: string | null;
  totals: LineTotals;
}

export async function getProposalSchedule(
  proposalId: string,
): Promise<{ rows: ScheduleRowView[]; totals: ScheduleTotals }> {
  const [lines, milestones] = await Promise.all([
    db
      .select()
      .from(billingPaymentSchedule)
      .where(eq(billingPaymentSchedule.proposalId, proposalId))
      .orderBy(asc(billingPaymentSchedule.sortOrder), asc(billingPaymentSchedule.createdAt)),
    db.select().from(billingMilestones).where(eq(billingMilestones.proposalId, proposalId)),
  ]);

  const stageById = new Map(milestones.map((m) => [m.id, m.stage]));

  const rows: ScheduleRowView[] = lines.map((l) => ({
    id: l.id,
    paymentType: l.paymentType as BillingPaymentType,
    productType: l.productType,
    description: l.description,
    notes: l.notes,
    gstRate: l.gstRate,
    tdsRate: l.tdsRate,
    isFinal: l.isFinal,
    tentativeDate: l.tentativeDate,
    actualDate: l.actualDate,
    receiptDate: l.receiptDate,
    milestoneId: l.milestoneId,
    milestoneStage: l.milestoneId ? (stageById.has(l.milestoneId) ? milestoneStageLabel(stageById.get(l.milestoneId)!) : null) : null,
    totals: lineTotals({
      amount: l.amount,
      gstRate: l.gstRate,
      receiptAmount: l.receiptAmount,
      tdsRate: l.tdsRate,
    }),
  }));

  return { rows, totals: sumSchedule(rows.map((r) => ({ totals: r.totals, isFinal: r.isFinal }))) };
}
