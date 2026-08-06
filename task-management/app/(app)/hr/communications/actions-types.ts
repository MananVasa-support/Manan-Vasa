import type {
  BroadcastCategory,
  BroadcastPriority,
  BroadcastAckMode,
  BroadcastAuthorIdentity,
} from "@/db/enums";
import type { AudienceRule } from "@/lib/ecos/audience";

/**
 * Shared input contracts for the ECOS Server Actions. Kept in a plain module
 * (NOT the "use server" file) so we can export non-async types — a "use server"
 * module may only export async functions.
 */

/** One stored attachment descriptor (broadcasts.attachments JSONB element). */
export interface BroadcastAttachment {
  path: string;
  name: string;
  mime: string;
  size: number;
}

/** Create-or-update payload for a broadcast draft. */
export interface SaveBroadcastDraftInput {
  /** Present → update that draft; absent → create a new one. */
  id?: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  ackMode: BroadcastAckMode;
  requireLock: boolean;
  authorIdentity: BroadcastAuthorIdentity;
  senderName?: string;
  attachments: BroadcastAttachment[];
  audience: AudienceRule;
  /** Delivery channels — subset of ["in_app","email"]. Defaults applied if empty. */
  channels: string[];
}
