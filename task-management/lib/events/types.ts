/**
 * Phase B — typed, versioned, domain-owned event contracts (ARCHITECTURE.md
 * Law 3). Each event is owned by exactly one business domain (aggregateType)
 * and carries a version so its shape can evolve through upcasters without
 * breaking consumers.
 *
 * The PAYLOAD of each event captures the facts a consumer needs WITHOUT having
 * to read the operational row (which may have changed since). Keep payloads
 * small, flat, and self-describing.
 */

/** The envelope every event carries through the log (Laws 9, 11). */
export interface EventEnvelope {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  orgId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  actorId?: string | null;
  occurredAt?: Date;
}

/** A persisted event read back from the log (includes the global order `seq`). */
export interface StoredEvent extends EventEnvelope {
  seq: number;
  eventId: string;
  eventVersion: number;
  occurredAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────
// TASK domain (the pilot engine). aggregateType = "task".
// ─────────────────────────────────────────────────────────────────────────

export const TASK_AGGREGATE = "task" as const;

export const TaskEventTypes = {
  Created: "TaskCreated",
  StatusChanged: "TaskStatusChanged",
  Reassigned: "TaskReassigned",
  Archived: "TaskArchived",
  Restored: "TaskRestored",
  FieldUpdated: "TaskFieldUpdated",
  ApprovalDecided: "TaskApprovalDecided",
  Deleted: "TaskDeleted",
} as const;

export type TaskEventType = (typeof TaskEventTypes)[keyof typeof TaskEventTypes];

// Payload shapes (v1). doerId is denormalised onto every payload so the
// task_metrics projection never has to look up the operational row.
export interface TaskCreatedV1 {
  doerId: string;
  initiatorId: string;
  createdById: string;
  title: string;
  subject: string | null;
  priority: string;
  status: string;
  dueAt: string | null; // ISO
}
export interface TaskStatusChangedV1 {
  doerId: string;
  fromStatus: string;
  toStatus: string;
}
export interface TaskReassignedV1 {
  fromDoerId: string;
  toDoerId: string;
  resetStatus: boolean;
}
export interface TaskArchivedV1 {
  doerId: string;
}
export interface TaskRestoredV1 {
  doerId: string;
}
export interface TaskFieldUpdatedV1 {
  doerId: string;
  field: string;
  value: unknown;
}
export interface TaskApprovalDecidedV1 {
  doerId: string;
  decision: "approved" | "not_approved";
}
export interface TaskDeletedV1 {
  doerId: string;
}

/** The current contract version for every task event type. Bump when a payload
 *  shape changes and add an upcaster (see upcasters.ts). */
export const CURRENT_VERSION: Record<TaskEventType, number> = {
  [TaskEventTypes.Created]: 1,
  [TaskEventTypes.StatusChanged]: 1,
  [TaskEventTypes.Reassigned]: 1,
  [TaskEventTypes.Archived]: 1,
  [TaskEventTypes.Restored]: 1,
  [TaskEventTypes.FieldUpdated]: 1,
  [TaskEventTypes.ApprovalDecided]: 1,
  [TaskEventTypes.Deleted]: 1,
};
