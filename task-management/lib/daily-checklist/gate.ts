import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyChecklist } from "@/db/schema";
import { todayYmd } from "@/lib/queries/daily-checklist";

/**
 * Mandatory daily-plan gate (WMS_OVERHAUL_MASTER_PLAN §5.3). A user must commit
 * at least one item to today's checklist before entering the app — the in-app
 * replacement for the WhatsApp "what I'll do today" message. The gate is open
 * (passes) the moment ≥1 row exists for today's plan_date.
 *
 * EXISTS query on `daily_checklist_emp_date_idx` — sub-millisecond.
 */
export async function needsDailyPlan(
  employeeId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const ymd = todayYmd(now);
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(dailyChecklist)
    .where(and(eq(dailyChecklist.employeeId, employeeId), eq(dailyChecklist.planDate, ymd)))
    .limit(1);
  return rows.length === 0;
}
