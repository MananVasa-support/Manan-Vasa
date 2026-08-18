import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingPeopleAllocation,
  billingAllocationScope,
  billingClients,
  employees,
} from "@/db/schema";
import type { BillRaiseOption } from "@/db/enums";

/**
 * Read side of Billing › People Allocation.
 *
 * Member ids are resolved to names through ONE roster lookup for the whole page
 * rather than a join per array — arrays cannot be joined, and a departed
 * employee simply resolves to null instead of breaking the allocation.
 */
export interface ScopeRow {
  id: string;
  /** Product code. Billing's product list, or a legacy scope value. */
  scope: string;
  /** Start Date / End Date in the UI; columns keep their original names. */
  dueDate: string | null;
  actualDate: string | null;
  billRaise: BillRaiseOption | null;
}

export interface AllocationRow {
  id: string;
  clientId: string;
  clientName: string;
  appLeadId: string | null;
  appLeadName: string | null;
  appMemberIds: string[];
  appMemberNames: string[];
  handholdingLeadId: string | null;
  handholdingLeadName: string | null;
  handholdingMemberIds: string[];
  handholdingMemberNames: string[];
  notes: string | null;
  scopes: ScopeRow[];
}

export async function listAllocations(): Promise<AllocationRow[]> {
  const rows = await db
    .select({
      a: billingPeopleAllocation,
      clientName: billingClients.name,
    })
    .from(billingPeopleAllocation)
    .innerJoin(billingClients, eq(billingClients.id, billingPeopleAllocation.clientId))
    .orderBy(asc(billingClients.name));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.a.id);
  const scopes = await db
    .select()
    .from(billingAllocationScope)
    .where(inArray(billingAllocationScope.allocationId, ids))
    .orderBy(asc(billingAllocationScope.sortOrder));

  // One roster read covers every lead and member on the page.
  const everyPerson = [
    ...new Set(
      rows.flatMap((r) => [
        ...(r.a.appLeadId ? [r.a.appLeadId] : []),
        ...(r.a.handholdingLeadId ? [r.a.handholdingLeadId] : []),
        ...r.a.appMemberIds,
        ...r.a.handholdingMemberIds,
      ]),
    ),
  ];
  const nameById = new Map<string, string>();
  if (everyPerson.length > 0) {
    const people = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, everyPerson));
    for (const p of people) nameById.set(p.id, p.name);
  }

  const scopesByAlloc = new Map<string, ScopeRow[]>();
  for (const s of scopes) {
    const list = scopesByAlloc.get(s.allocationId) ?? [];
    list.push({
      id: s.id,
      scope: s.scope,
      dueDate: s.dueDate,
      actualDate: s.actualDate,
      billRaise: s.billRaise as BillRaiseOption | null,
    });
    scopesByAlloc.set(s.allocationId, list);
  }

  return rows.map(({ a, clientName }) => ({
    id: a.id,
    clientId: a.clientId,
    clientName,
    appLeadId: a.appLeadId,
    appLeadName: a.appLeadId ? (nameById.get(a.appLeadId) ?? null) : null,
    appMemberIds: a.appMemberIds,
    appMemberNames: a.appMemberIds.map((id) => nameById.get(id) ?? "Unknown"),
    handholdingLeadId: a.handholdingLeadId,
    handholdingLeadName: a.handholdingLeadId ? (nameById.get(a.handholdingLeadId) ?? null) : null,
    handholdingMemberIds: a.handholdingMemberIds,
    handholdingMemberNames: a.handholdingMemberIds.map((id) => nameById.get(id) ?? "Unknown"),
    notes: a.notes,
    scopes: scopesByAlloc.get(a.id) ?? [],
  }));
}
