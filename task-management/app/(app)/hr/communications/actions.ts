"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { broadcasts, broadcastRecipients, employees } from "@/db/schema";
import type { BroadcastAuthorIdentity } from "@/db/enums";
import { requireUser } from "@/lib/auth/current";
import { isHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/dispatch";
import { sendBroadcastEmail } from "@/lib/email/resend";
import { emit } from "@/lib/events/emit";
import { resolveAudience, type AudienceRule } from "@/lib/ecos/audience";
import type { SaveBroadcastDraftInput } from "./actions-types";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
type VoidResult = { ok: true } | Err;

const LOCK_PRIORITIES = new Set(["critical", "emergency"]);

/** Resolve the current employee and confirm HR-staff access for authoring actions. */
async function requireAuthor(): Promise<{ me: Awaited<ReturnType<typeof requireUser>> } | Err> {
  const me = await requireUser();
  if (!(await isHrStaff(me))) return { ok: false, error: "Communications is HR-staff only." };
  return { me };
}

/** Normalise the stored `channels` JSONB into a clean string[] (with defaults). */
function normChannels(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out = raw.filter((x): x is string => typeof x === "string");
    return out.length > 0 ? out : ["in_app", "email"];
  }
  return ["in_app", "email"];
}

/** Human sender label for the email header / display identity. */
function senderLabelFor(b: {
  authorIdentity: BroadcastAuthorIdentity;
  senderName: string | null;
}): string {
  if (b.senderName && b.senderName.trim()) return b.senderName.trim();
  switch (b.authorIdentity) {
    case "ceo":
      return "The CEO";
    case "founder":
      return "The Founder";
    default:
      return "Altus HR";
  }
}

/* ------------------------------------------------------------------ */
/* Compose / lifecycle                                                  */
/* ------------------------------------------------------------------ */

/** Create or update a broadcast draft. HR-staff only. */
export async function saveBroadcastDraft(
  input: SaveBroadcastDraftInput,
): Promise<Ok<{ id: string }> | Err> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const { me } = gate;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Give the broadcast a title." };

  // App-lock is reserved for the two highest priorities.
  if (input.requireLock && !LOCK_PRIORITIES.has(input.priority)) {
    return {
      ok: false,
      error: "The app-lock gate is only available for Critical or Emergency broadcasts.",
    };
  }

  const values = {
    title,
    bodyHtml: input.bodyHtml ?? "",
    bodyText: input.bodyText ?? "",
    category: input.category,
    priority: input.priority,
    ackMode: input.ackMode,
    requireLock: input.requireLock,
    authorIdentity: input.authorIdentity,
    senderName: input.senderName?.trim() || null,
    attachments: input.attachments ?? [],
    audience: input.audience ?? { scope: "org" },
    channels: input.channels && input.channels.length > 0 ? input.channels : ["in_app", "email"],
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      // Only drafts / scheduled broadcasts remain editable.
      const [existing] = await db
        .select({ status: broadcasts.status })
        .from(broadcasts)
        .where(eq(broadcasts.id, input.id))
        .limit(1);
      if (!existing) return { ok: false, error: "That broadcast no longer exists." };
      if (existing.status !== "draft" && existing.status !== "scheduled") {
        return { ok: false, error: "A published broadcast can't be edited." };
      }
      await db.update(broadcasts).set(values).where(eq(broadcasts.id, input.id));
      return { ok: true, id: input.id };
    }

    const [row] = await db
      .insert(broadcasts)
      .values({ ...values, status: "draft", authorId: me.id })
      .returning({ id: broadcasts.id });
    if (!row) return { ok: false, error: "Could not save the draft." };
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the draft." };
  }
}

/**
 * Publish a broadcast: resolve its audience, snapshot `broadcast_recipients`,
 * flip to published, then deliver in-app + email per recipient. Delivery is
 * best-effort and per-recipient try/catch — one failure never aborts the rest.
 */
export async function publishBroadcast(
  id: string,
): Promise<Ok<{ recipientCount: number }> | Err> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const { me } = gate;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const broadcast = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, id) });
  if (!broadcast) return { ok: false, error: "That broadcast no longer exists." };
  if (broadcast.status === "published") {
    return { ok: false, error: "This broadcast is already published." };
  }
  if (broadcast.status === "archived") {
    return { ok: false, error: "An archived broadcast can't be published." };
  }
  if (!broadcast.title.trim()) return { ok: false, error: "Give the broadcast a title first." };

  // Resolve the target set from the stored rule.
  let targetIds: string[] = [];
  try {
    const resolved = await resolveAudience((broadcast.audience ?? { scope: "org" }) as AudienceRule);
    targetIds = resolved.employeeIds;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not resolve the audience." };
  }
  if (targetIds.length === 0) {
    return { ok: false, error: "This audience resolves to zero active employees." };
  }

  const publishedAt = broadcast.publishedAt ?? new Date();

  // Snapshot recipients + flip status + emit the audit event atomically.
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(broadcastRecipients)
        .values(
          targetIds.map((employeeId) => ({
            broadcastId: id,
            employeeId,
            status: "pending" as const,
          })),
        )
        .onConflictDoNothing();

      await tx
        .update(broadcasts)
        .set({
          status: "published",
          publishedAt,
          recipientCount: targetIds.length,
          updatedAt: new Date(),
        })
        .where(eq(broadcasts.id, id));

      await emit(tx, {
        aggregateType: "broadcast",
        aggregateId: id,
        eventType: "BroadcastPublished",
        eventVersion: 1,
        payload: {
          title: broadcast.title,
          category: broadcast.category,
          priority: broadcast.priority,
          ackMode: broadcast.ackMode,
          requireLock: broadcast.requireLock,
          recipientCount: targetIds.length,
        },
        actorId: me.id,
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not publish the broadcast." };
  }

  // Deliver (best-effort, per-recipient). Runs after the snapshot so a slow
  // mailer never holds the publish transaction open.
  await deliverToRecipients(id, targetIds);

  return { ok: true, recipientCount: targetIds.length };
}

/**
 * Fan a broadcast out to a set of employees. In-app row via notify() (kind
 * "broadcast", forceChannels: [] so the generic dispatcher does the inbox row
 * ONLY — the broadcast email is sent separately). Email via sendBroadcastEmail
 * when the broadcast's channels include "email". Stamps deliveredAt +
 * deliveredChannels per recipient. Per-recipient try/catch.
 */
async function deliverToRecipients(broadcastId: string, employeeIds: string[]): Promise<void> {
  const broadcast = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, broadcastId) });
  if (!broadcast) return;

  const channels = normChannels(broadcast.channels);
  const wantInApp = channels.includes("in_app");
  const wantEmail = channels.includes("email");
  const title = broadcast.title;
  const senderLabel = senderLabelFor(broadcast);
  const requireAck = broadcast.ackMode === "acknowledge";
  const body = JSON.stringify({ broadcastId });

  // Contact info for the target set — re-check isActive at delivery time so a
  // just-deactivated employee is dropped even though they were in the snapshot.
  const targets = employeeIds.length
    ? await db
        .select({ id: employees.id, email: employees.email })
        .from(employees)
        .where(and(eq(employees.isActive, true), inArray(employees.id, employeeIds)))
    : [];

  await Promise.allSettled(
    targets.map(async (c) => {
      try {
        const deliveredChannels: string[] = [];

        if (wantInApp) {
          // forceChannels: [] → notify() writes ONLY the in-app inbox row and
          // skips its own email/slack/whatsapp/push arms (which have no
          // broadcast template). The broadcast email is sent below.
          await notify({
            userId: c.id,
            kind: "broadcast",
            title,
            body,
            forceChannels: [],
          });
          deliveredChannels.push("in_app");
        }

        if (wantEmail && c.email) {
          const res = await sendBroadcastEmail({
            to: c.email,
            subject: title,
            bodyHtml: broadcast.bodyHtml,
            bodyText: broadcast.bodyText,
            senderLabel,
            priority: broadcast.priority,
            requireAck,
            broadcastId,
          });
          if (!res.error) deliveredChannels.push("email");
        }

        await db
          .update(broadcastRecipients)
          .set({ deliveredAt: new Date(), deliveredChannels })
          .where(
            and(
              eq(broadcastRecipients.broadcastId, broadcastId),
              eq(broadcastRecipients.employeeId, c.id),
            ),
          );
      } catch {
        // Best-effort — a single recipient's failure never aborts the fan-out.
      }
    }),
  );
}

/** Archive a broadcast (hides it from the active list; receipts are kept). */
export async function archiveBroadcast(id: string): Promise<VoidResult> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  try {
    await db
      .update(broadcasts)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(broadcasts.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive." };
  }
}

/** Pause a published broadcast (stops it counting toward gates; receipts kept). */
export async function pauseBroadcast(id: string): Promise<VoidResult> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;
  try {
    await db
      .update(broadcasts)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(broadcasts.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not pause." };
  }
}

/** Re-notify recipients who are still pending (delivered but not yet read). */
export async function resendToUnread(id: string): Promise<Ok<{ resent: number }> | Err> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  const broadcast = await db.query.broadcasts.findFirst({ where: eq(broadcasts.id, id) });
  if (!broadcast) return { ok: false, error: "That broadcast no longer exists." };

  const pending = await db
    .select({ employeeId: broadcastRecipients.employeeId })
    .from(broadcastRecipients)
    .where(
      and(
        eq(broadcastRecipients.broadcastId, id),
        eq(broadcastRecipients.status, "pending"),
      ),
    );

  const ids = pending.map((p) => p.employeeId);
  if (ids.length === 0) return { ok: true, resent: 0 };

  await deliverToRecipients(id, ids);
  return { ok: true, resent: ids.length };
}

/** Composer live-count — resolve an (unsaved) audience rule to a headcount. */
export async function previewAudienceCount(rule: AudienceRule): Promise<{ count: number }> {
  const me = await requireUser();
  if (!(await isHrStaff(me))) return { count: 0 };
  try {
    const { count } = await resolveAudience(rule);
    return { count };
  } catch {
    return { count: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* Recipient-side receipts                                              */
/* ------------------------------------------------------------------ */

/** The current user marks a broadcast read. Idempotent; never downgrades ack. */
export async function markBroadcastRead(broadcastId: string): Promise<{ ok: boolean }> {
  try {
    const me = await requireUser();
    await db
      .update(broadcastRecipients)
      .set({ status: "read", readAt: new Date() })
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcastId),
          eq(broadcastRecipients.employeeId, me.id),
          // Only pending → read, so we never clobber an existing acknowledgement.
          eq(broadcastRecipients.status, "pending"),
        ),
      );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** The current user acknowledges a broadcast (satisfies the app-lock gate). */
export async function acknowledgeBroadcast(
  broadcastId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await requireUser();
    const [rec] = await db
      .select({ readAt: broadcastRecipients.readAt })
      .from(broadcastRecipients)
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcastId),
          eq(broadcastRecipients.employeeId, me.id),
        ),
      )
      .limit(1);
    if (!rec) return { ok: false, error: "This message wasn't sent to you." };

    const now = new Date();
    await db
      .update(broadcastRecipients)
      .set({ status: "acknowledged", acknowledgedAt: now, readAt: rec.readAt ?? now })
      .where(
        and(
          eq(broadcastRecipients.broadcastId, broadcastId),
          eq(broadcastRecipients.employeeId, me.id),
        ),
      );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not acknowledge." };
  }
}

/* ------------------------------------------------------------------ */
/* AI compose assistant                                                 */
/* ------------------------------------------------------------------ */

/** HR-gated AI writing assistant (generate / rewrite / translate / summarize). */
export async function aiComposeAssistant(input: {
  action: "generate" | "rewrite" | "translate" | "summarize";
  text?: string;
  prompt?: string;
  language?: string;
}): Promise<Ok<{ text: string }> | Err> {
  const gate = await requireAuthor();
  if ("ok" in gate) return gate;
  const limited = rateLimitOrError(gate.me.id, "write");
  if (limited) return limited;

  // Imported lazily so a missing OpenRouter key never affects the other actions.
  const { composeWithAI } = await import("@/lib/ecos/ai");
  const result = await composeWithAI(input);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, text: result.text };
}
