import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsVasaBalances } from "@/db/schema";

export interface VasaRow {
  id: string;
  party: string | null;
  direction: string | null;
  counterparty: string | null;
  amount: string | null;
  asOn: string | null;
  notes: string | null;
  sortOrder: number | null;
}

export async function listVasaBalances(): Promise<VasaRow[]> {
  return db
    .select({
      id: accountsVasaBalances.id,
      party: accountsVasaBalances.party,
      direction: accountsVasaBalances.direction,
      counterparty: accountsVasaBalances.counterparty,
      amount: accountsVasaBalances.amount,
      asOn: accountsVasaBalances.asOn,
      notes: accountsVasaBalances.notes,
      sortOrder: accountsVasaBalances.sortOrder,
    })
    .from(accountsVasaBalances)
    .where(eq(accountsVasaBalances.archived, false))
    .orderBy(asc(accountsVasaBalances.sortOrder));
}
