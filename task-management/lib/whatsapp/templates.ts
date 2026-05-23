import type { NotificationKind } from "@/db/schema";

/**
 * Maps a `NotificationKind` to the Meta Cloud API utility-template name
 * we registered for it. All templates live under the `vp_*` namespace
 * so they're easy to filter inside Meta's Business Manager.
 */
const NAMES: Record<NotificationKind, string> = {
  task_assigned: "vp_assigned",
  task_initiated: "vp_initiated",
  status_changed: "vp_status_changed",
  approved: "vp_approved",
  declined: "vp_declined",
  reassigned: "vp_reassigned",
  transferred: "vp_transferred",
  cancelled: "vp_cancelled",
  commented: "vp_commented",
  overdue_digest: "vp_overdue_digest",
};

export function templateNameForKind(kind: NotificationKind): string {
  return NAMES[kind];
}

export interface TemplateCtx {
  actorName: string;
  taskSubject: string;
  body?: string;
  shortId: string;
  digestCount?: number;
  digestPreview?: string;
  // M5.1 — admin-resolved status label. status_changed uses this as the
  // body parameter so renamed statuses propagate. Other kinds ignore it.
  statusLabel?: string;
}

type Param = { type: "text"; text: string };

function t(s: string): Param {
  return { type: "text", text: s };
}

/**
 * Per-kind positional parameter builders, matching the registered Meta
 * templates' body variable counts from spec section 4. Templates that
 * don't need a `body` field (e.g. vp_assigned only needs the due date
 * which arrives via `ctx.body`) still expect a non-empty string for
 * every positional slot, so we default missing fields to "".
 */
const VARS: Record<NotificationKind, (ctx: TemplateCtx) => Param[]> = {
  task_assigned: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  task_initiated: (c) => [t(c.actorName), t(c.taskSubject), t(c.shortId)],
  status_changed: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    // M5.1 — prefer the resolved status label over the raw JSON meta in
    // c.body. Pre-M5.1 callers passed JSON here, which surfaced as
    // "{\"toStatus\":\"done\"}" inside the WhatsApp message.
    t(c.statusLabel ?? c.body ?? ""),
    t(c.shortId),
  ],
  approved: (c) => [t(c.actorName), t(c.taskSubject), t(c.shortId)],
  declined: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  reassigned: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  transferred: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  cancelled: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  commented: (c) => [
    t(c.actorName),
    t(c.taskSubject),
    t(c.body ?? ""),
    t(c.shortId),
  ],
  overdue_digest: (c) => [
    t(String(c.digestCount ?? 0)),
    t(c.digestPreview ?? ""),
  ],
};

/**
 * Returns the `components` payload that Meta Cloud API expects in
 * `template.components`. We only ever build a single `body` component;
 * header/footer/button components stay registered with default values
 * on the template itself.
 */
export function buildTemplateComponents(
  kind: NotificationKind,
  ctx: TemplateCtx,
): Array<{ type: "body"; parameters: Param[] }> {
  return [{ type: "body", parameters: VARS[kind](ctx) }];
}
