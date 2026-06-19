import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist } from "@/db/schema";
import { todayYmd } from "@/lib/queries/daily-checklist";

/**
 * Mandatory daily-plan gate (WMS_OVERHAUL_MASTER_PLAN §5.3 + §6). A user must
 * commit at least MIN_DAILY_ITEMS items to today's checklist before entering the
 * app — the in-app replacement for the WhatsApp "what I'll do today" message.
 * The gate is open (passes) only once today's plan has ≥ MIN_DAILY_ITEMS rows.
 */
export const MIN_DAILY_ITEMS = 5;

export async function needsDailyPlan(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const ymd = todayYmd(now);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)));
  return (rows[0]?.n ?? 0) < MIN_DAILY_ITEMS;
}
