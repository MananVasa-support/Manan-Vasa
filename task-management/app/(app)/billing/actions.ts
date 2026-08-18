"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingClients,
  billingClientEmails,
  billingProposals,
  billingMilestones,
  billingPaymentSchedule,
  billingPeopleAllocation,
  billingAllocationScope,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  UpsertClientSchema,
  UpsertWmsProposalSchema,
  UpsertMilestoneSchema,
  UpsertScheduleLineSchema,
  UpsertAllocationSchema,
} from "@/lib/validators/billing-clients";
import { milestoneStageRank, milestoneStageLabel, BILLING_PROPOSAL_STATUSES } from "@/db/enums";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import type { ProposalAttachment } from "@/db/schema";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** Collapse a ZodError (or anything else) into one human-readable line. */
function firstIssue(e: unknown): string {
  const err = e as { issues?: { message: string }[]; message?: string };
  if (err?.issues?.length) return err.issues[0]!.message;
  return err?.message ?? "Something went wrong";
}

/**
 * Create or update an address-book client, plus its email addresses.
 *
 * Emails are REPLACE-ALL: the caller always submits the complete set it intends
 * to keep, so diffing would be a slower route to the same state. The rail is
 * careful to resend a client's other addresses alongside the edited primary —
 * see components/billing/client-address-sidebar.tsx.
 */
export async function upsertBillingClient(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;

  let input;
  try {
    input = UpsertClientSchema.parse(raw);
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }

  try {
    const id = await db.transaction(async (tx) => {
      const fields = {
        name: input.name,
        company: input.company ?? null,
        contactPerson: input.contactPerson ?? null,
        phone: input.phone ?? null,
        addressLine1: input.address ?? null,
        notes: input.notes ?? null,
      };

      let clientId = input.id;
      if (clientId) {
        await tx
          .update(billingClients)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(billingClients.id, clientId));
      } else {
        const [row] = await tx
          .insert(billingClients)
          .values({ ...fields, createdById: me.id })
          .returning({ id: billingClients.id });
        clientId = row!.id;
      }

      await tx.delete(billingClientEmails).where(eq(billingClientEmails.clientId, clientId));
      if (input.emails.length > 0) {
        await tx.insert(billingClientEmails).values(
          input.emails.map((e, i) => ({
            clientId: clientId!,
            email: e.email,
            label: e.label ?? null,
            // If the caller flagged nobody, promote the first — a client with
            // addresses but no primary leaves the rail's Email ID field blank.
            isPrimary: e.isPrimary || (i === 0 && !input.emails.some((x) => x.isPrimary)),
          })),
        );
      }
      return clientId!;
    });

    // The rail is rendered by the Billing layout, so every Billing route shows
    // the stale directory until they are revalidated.
    revalidatePath("/billing", "layout");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

/**
 * Archive rather than delete. Billing records will reference clients as the
 * module grows; a soft flag keeps that history intact and is reversible.
 */
export async function archiveBillingClient(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  try {
    await db
      .update(billingClients)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(billingClients.id, id));
    revalidatePath("/billing", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// WMS Proposals
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create or update a WMS proposal. `id` present ⇒ update.
 *
 * The client is stored as a FOREIGN KEY, never copied: the brief asks that
 * client information come from the Client Address Book, so the proposal holds
 * only the link and every read joins through it. Editing a client therefore
 * updates every proposal that references them, with no sync step.
 */
export async function upsertWmsProposal(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;

  let input;
  try {
    input = UpsertWmsProposalSchema.parse(raw);
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }

  const values = {
    code: input.code,
    clientId: input.clientId,
    productType: input.productType,
    wmsType: input.wmsType ?? null,
    entity: input.entity ?? null,
    toEmails: input.toEmails,
    ccEmails: input.ccEmails,
    attachments: input.attachments,
    status: input.status,
    proposalDate: input.proposalDate,
    notes: input.notes ?? null,
  };

  try {
    let id = input.id;
    if (id) {
      await db
        .update(billingProposals)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(billingProposals.id, id));
    } else {
      const [row] = await db
        .insert(billingProposals)
        .values({ ...values, createdById: me.id })
        .returning({ id: billingProposals.id });
      id = row!.id;
    }
    revalidatePath("/billing/proposals");
    return { ok: true, id };
  } catch (e) {
    // The UNIQUE index on `code` is the real guard against duplicate proposal
    // numbers; translate its raw Postgres error into something actionable.
    const msg = firstIssue(e);
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, error: `Proposal number "${input.code}" is already in use.` };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Change one proposal's status from the list, without opening the editor.
 *
 * Deliberately narrow: it touches `status` and nothing else, so a mis-click in
 * the list can never disturb a proposal's number, client or recipients.
 */
export async function setProposalStatus(id: string, status: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!(BILLING_PROPOSAL_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Unknown proposal status" };
  }
  try {
    await db
      .update(billingProposals)
      .set({ status, updatedAt: new Date() })
      .where(eq(billingProposals.id, id));
    revalidatePath("/billing/proposals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

// ── Attached proposal files ────────────────────────────────────────────────
//
// Uploads land in the private `documents` bucket and the proposal stores only a
// descriptor — the same service-role, app-gated path the communications
// attachments already use, rather than a second upload mechanism. Files upload
// BEFORE the proposal is saved, so the dialog shows the real list, and the
// descriptor is just another field on the form.

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_PREFIX = "billing/proposals/";
const SIGNED_URL_TTL = 60 * 10;

export async function uploadProposalAttachment(
  fd: FormData,
): Promise<ActionResult<{ attachment: ProposalAttachment }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: `"${file.name}" is larger than 20 MB.` };

  const name = (file.name || "proposal").replace(/[\r\n"]/g, "").slice(0, 180) || "proposal";
  const ext = (name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const path = `${ATTACHMENT_PREFIX}${randomUUID()}${ext ? `.${ext}` : ""}`;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .upload(path, buf, { contentType: mime, upsert: false });
    if (error) return { ok: false, error: `Upload failed: ${error.message}` };
    return { ok: true, attachment: { path, name, mime, size: file.size } };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

/** Remove a file from storage. The caller drops it from the proposal's list. */
export async function deleteProposalAttachment(path: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  // Confine deletions to this feature's own prefix — a caller must not reach
  // another module's files by passing an arbitrary path.
  if (!path.startsWith(ATTACHMENT_PREFIX)) return { ok: false, error: "Not a proposal attachment." };
  try {
    const { error } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([path]);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

/** A short-lived link to open one attachment. The bucket stays private. */
export async function proposalAttachmentUrl(path: string): Promise<ActionResult<{ url: string }>> {
  await requireUser();
  if (!path.startsWith(ATTACHMENT_PREFIX)) return { ok: false, error: "Not a proposal attachment." };
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? "Could not create a link." };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

export async function deleteWmsProposal(id: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "Only an admin can delete a proposal" };
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  try {
    await db.delete(billingProposals).where(eq(billingProposals.id, id));
    revalidatePath("/billing/proposals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Proposal milestones
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create or update one milestone on a proposal. `id` present ⇒ update.
 *
 * `sort_order` is derived from the stage itself (milestoneStageRank) rather
 * than stored by hand, so the list can never end up ordered M3, M1, M2 because
 * someone typed the numbers in the wrong sequence.
 */
export async function upsertMilestone(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;

  let input;
  try {
    input = UpsertMilestoneSchema.parse(raw);
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }

  const values = {
    proposalId: input.proposalId,
    stage: input.stage,
    title: input.title ?? null,
    description: input.description ?? null,
    dueDate: input.dueDate ?? null,
    amount: input.amount === null || input.amount === undefined ? null : String(input.amount),
    sortOrder: milestoneStageRank(input.stage),
    isDelivered: input.isDelivered,
    // Stamp the delivery date the moment it is ticked, and clear it when
    // un-ticked, so the two fields can never disagree.
    deliveredOn: input.isDelivered ? new Date().toISOString().slice(0, 10) : null,
  };

  try {
    let id = input.id;
    if (id) {
      await db
        .update(billingMilestones)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(billingMilestones.id, id));
    } else {
      const [row] = await db
        .insert(billingMilestones)
        .values(values)
        .returning({ id: billingMilestones.id });
      id = row!.id;
    }
    revalidatePath(`/billing/proposals/${input.proposalId}`);
    revalidatePath("/billing/proposals");
    return { ok: true, id };
  } catch (e) {
    const msg = firstIssue(e);
    // UNIQUE (proposal_id, stage) — one row per stage is the invariant.
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, error: `This proposal already has a ${milestoneStageLabel(input.stage)} milestone. Edit it instead.` };
    }
    return { ok: false, error: msg };
  }
}

/** Tick / untick delivery without opening the full editor. */
export async function setMilestoneDelivered(id: string, isDelivered: boolean): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  try {
    const [row] = await db
      .update(billingMilestones)
      .set({
        isDelivered,
        deliveredOn: isDelivered ? new Date().toISOString().slice(0, 10) : null,
        updatedAt: new Date(),
      })
      .where(eq(billingMilestones.id, id))
      .returning({ proposalId: billingMilestones.proposalId });
    if (row) revalidatePath(`/billing/proposals/${row.proposalId}`);
    revalidatePath("/billing/proposals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  try {
    const [row] = await db
      .delete(billingMilestones)
      .where(eq(billingMilestones.id, id))
      .returning({ proposalId: billingMilestones.proposalId });
    if (row) revalidatePath(`/billing/proposals/${row.proposalId}`);
    revalidatePath("/billing/proposals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Payment Schedule
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create or update one Payment Schedule line. `id` present ⇒ update.
 *
 * `sort_order` follows the linked milestone's stage when there is one, so the
 * schedule reads in delivery order without the user sequencing it by hand.
 * Unlinked lines sort after the milestones they follow.
 */
export async function upsertScheduleLine(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;

  let input;
  try {
    input = UpsertScheduleLineSchema.parse(raw);
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }

  try {
    let sortOrder = 900;
    if (input.milestoneId) {
      const m = await db.query.billingMilestones.findFirst({
        where: eq(billingMilestones.id, input.milestoneId),
        columns: { stage: true },
      });
      if (m) sortOrder = milestoneStageRank(m.stage);
    }
    // A final-balance line always sorts last, whatever it is linked to.
    if (input.isFinal) sortOrder = 999;

    const values = {
      proposalId: input.proposalId,
      milestoneId: input.milestoneId ?? null,
      paymentType: input.paymentType,
      productType: input.productType ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      amount: String(input.amount),
      gstRate: input.gstRate,
      isAdvance: input.paymentType === "advance",
      isFinal: input.isFinal,
      tentativeDate: input.tentativeDate ?? null,
      actualDate: input.actualDate ?? null,
      receiptAmount:
        input.receiptAmount === null || input.receiptAmount === undefined ? null : String(input.receiptAmount),
      receiptDate: input.receiptDate ?? null,
      // TDS is deducted on the PRE-GST value (GST is shown separately on the
      // invoice, and tax is not withheld on tax). Rate and rupee figure are
      // written together from the same inputs, so they cannot drift.
      tdsRate: input.tdsRate,
      tdsAmount: input.tdsRate > 0 ? String(Math.round(input.amount * input.tdsRate) / 100) : null,
      sortOrder,
    };

    let id = input.id;
    if (id) {
      await db
        .update(billingPaymentSchedule)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(billingPaymentSchedule.id, id));
    } else {
      const [row] = await db
        .insert(billingPaymentSchedule)
        .values(values)
        .returning({ id: billingPaymentSchedule.id });
      id = row!.id;
    }
    revalidatePath(`/billing/proposals/${input.proposalId}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

export async function deleteScheduleLine(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  try {
    const [row] = await db
      .delete(billingPaymentSchedule)
      .where(eq(billingPaymentSchedule.id, id))
      .returning({ proposalId: billingPaymentSchedule.proposalId });
    if (row) revalidatePath(`/billing/proposals/${row.proposalId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// People Allocation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create or update a client's people allocation and its scope rows.
 *
 * Scope rows are REPLACE-ALL: the form always submits the complete set, so a
 * diff would be a slower path to the same state. `sort_order` comes from the
 * submitted order, which is the order the user arranged them in.
 */
export async function upsertAllocation(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;

  let input;
  try {
    input = UpsertAllocationSchema.parse(raw);
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }

  try {
    const id = await db.transaction(async (tx) => {
      const fields = {
        clientId: input.clientId,
        appLeadId: input.appLeadId ?? null,
        appMemberIds: input.appMemberIds,
        handholdingLeadId: input.handholdingLeadId ?? null,
        handholdingMemberIds: input.handholdingMemberIds,
        notes: input.notes ?? null,
      };

      let allocId = input.id;
      if (allocId) {
        await tx
          .update(billingPeopleAllocation)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(billingPeopleAllocation.id, allocId));
      } else {
        const [row] = await tx
          .insert(billingPeopleAllocation)
          .values({ ...fields, createdById: me.id })
          .returning({ id: billingPeopleAllocation.id });
        allocId = row!.id;
      }

      await tx.delete(billingAllocationScope).where(eq(billingAllocationScope.allocationId, allocId));
      if (input.scopes.length > 0) {
        await tx.insert(billingAllocationScope).values(
          input.scopes.map((sc, i) => ({
            allocationId: allocId!,
            scope: sc.scope,
            // Start Date / End Date in the UI; columns keep their names.
            dueDate: sc.dueDate ?? null,
            actualDate: sc.actualDate ?? null,
            billRaise: sc.billRaise ?? null,
            sortOrder: i,
          })),
        );
      }
      return allocId!;
    });

    revalidatePath("/billing/people-allocation");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}

export async function deleteAllocation(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  try {
    await db.delete(billingPeopleAllocation).where(eq(billingPeopleAllocation.id, id));
    revalidatePath("/billing/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: firstIssue(e) };
  }
}
