import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { employees } from "@/db/schema";

/**
 * Employee Exit forms — the Exit Interview Questionnaire and the Handover &
 * Clearance Checklist. Defined in this module (not the big db/schema.ts) so the
 * Exit feature owns its own table and stays out of shared-nav merge conflicts;
 * the table itself is created by db/migrations/0160_exit_records.sql.
 *
 * `kind`: 'interview' | 'handover'. `data` holds the full form payload (answers,
 * 1-5 ratings, checklist ticks, sign-offs) as JSON.
 */
export const exitRecords = pgTable(
  "exit_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull().default({}),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("exit_records_employee_idx").on(t.employeeId),
    index("exit_records_kind_idx").on(t.kind),
    index("exit_records_updated_idx").on(t.updatedAt),
  ],
);

export type ExitRecord = typeof exitRecords.$inferSelect;
export type NewExitRecord = typeof exitRecords.$inferInsert;

export type ExitKind = "interview" | "handover";
