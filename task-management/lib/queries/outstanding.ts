import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  employees,
  outstandingEntries,
  outstandingFollowups,
} from "@/db/schema";
import type { OutstandingStatus } from "@/db/enums";

export interface OutstandingFollowupRow {
  id: string;
  actorName: string;
  note: string;
  promisedDate: string | null;
  amountReceived: number | null;
  createdAt: Date;
}

export interface OutstandingEntryRow {
  id: string;
  client: string;
  particulars: string | null;
  amount: number;
  amountReceived: number;
  balance: number;
  dueDate: string | null;
  status: OutstandingStatus;
  ownerId: string | null;
  ownerName: string | null;
  createdByName: string | null;
  createdAt: Date;
  followups: OutstandingFollowupRow[];
}

/**
 * The full receivables ledger, newest first, with each entry's follow-up
 * log embedded (small-team scale — a few hundred rows at most).
 */
export async function listOutstandingEntries(): Promise<OutstandingEntryRow[]> {
  const owner = alias(employees, "owner");
  const creator = alias(employees, "creator");
  const entries = await db
    .select({
      id: outstandingEntries.id,
      client: outstandingEntries.client,
      particulars: outstandingEntries.particulars,
      amount: outstandingEntries.amount,
      amountReceived: outstandingEntries.amountReceived,
      dueDate: outstandingEntries.dueDate,
      status: outstandingEntries.status,
      ownerId: outstandingEntries.ownerId,
      ownerName: owner.name,
      createdByName: creator.name,
      createdAt: outstandingEntries.createdAt,
    })
    .from(outstandingEntries)
    .leftJoin(owner, eq(outstandingEntries.ownerId, owner.id))
    .leftJoin(creator, eq(outstandingEntries.createdById, creator.id))
    .orderBy(desc(outstandingEntries.createdAt))
    .limit(500);

  const ids = entries.map((e) => e.id);
  const followups = ids.length
    ? await db
        .select({
          id: outstandingFollowups.id,
          entryId: outstandingFollowups.entryId,
          actorName: employees.name,
          note: outstandingFollowups.note,
          promisedDate: outstandingFollowups.promisedDate,
          amountReceived: outstandingFollowups.amountReceived,
          createdAt: outstandingFollowups.createdAt,
        })
        .from(outstandingFollowups)
        .innerJoin(employees, eq(outstandingFollowups.actorId, employees.id))
        .where(inArray(outstandingFollowups.entryId, ids))
        .orderBy(desc(outstandingFollowups.createdAt))
    : [];

  const byEntry = new Map<string, OutstandingFollowupRow[]>();
  for (const f of followups) {
    const list = byEntry.get(f.entryId) ?? [];
    list.push({
      id: f.id,
      actorName: f.actorName,
      note: f.note,
      promisedDate: f.promisedDate,
      amountReceived: f.amountReceived === null ? null : Number(f.amountReceived),
      createdAt: f.createdAt,
    });
    byEntry.set(f.entryId, list);
  }

  return entries.map((e) => {
    const amount = Number(e.amount);
    const received = Number(e.amountReceived);
    return {
      id: e.id,
      client: e.client,
      particulars: e.particulars,
      amount,
      amountReceived: received,
      balance: Math.max(0, amount - received),
      dueDate: e.dueDate,
      status: e.status,
      ownerId: e.ownerId,
      ownerName: e.ownerName ?? null,
      createdByName: e.createdByName ?? null,
      createdAt: e.createdAt,
      followups: byEntry.get(e.id) ?? [],
    };
  });
}
