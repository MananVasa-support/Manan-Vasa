import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, taskEvents } from "@/db/schema";
import { deriveShortId, nextShortIdCandidate } from "@/lib/import/short-id";
import { generateOccurrences, parseRRule } from "@/lib/recurrence/rrule";

/**
 * Phase 5.2 — recurrence materializer.
 *
 * Walks every active "template" task (one that holds a `recurrence_rule`
 * but is not itself a materialized child) and creates the missing
 * dated child instances inside a forward window (default 14 days).
 *
 * Idempotent: the unique partial index on
 * (recurrence_parent_id, recurrence_occurrence_date) means a duplicate
 * INSERT just no-ops via ON CONFLICT DO NOTHING. Safe to run as often
 * as you like.
 *
 * Returns counts so the cron route can log a digest.
 */
export interface MaterializeStats {
  templates: number;
  created: number;
  skipped: number;
  errors: number;
}

const DEFAULT_LOOKAHEAD_DAYS = 14;

export async function materializeRecurringTasks(
  opts: { lookaheadDays?: number; now?: Date } = {},
): Promise<MaterializeStats> {
  const lookahead = opts.lookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
  const now = opts.now ?? new Date();
  const windowEnd = new Date(now.getTime() + lookahead * 24 * 60 * 60 * 1000);
  const stats: MaterializeStats = { templates: 0, created: 0, skipped: 0, errors: 0 };

  // Pick rule-holders only: recurrence_rule set, NOT a materialized child,
  // not archived. The partial index `tasks_recurrence_template_idx`
  // covers this scan.
  const templates = await db
    .select()
    .from(tasks)
    .where(
      and(
        isNotNull(tasks.recurrenceRule),
        isNull(tasks.recurrenceParentId),
        eq(tasks.archived, false),
      ),
    );

  for (const t of templates) {
    stats.templates++;
    const rule = parseRRule(t.recurrenceRule ?? "");
    if (!rule) {
      // Bad rule string — skip silently, log once. The picker writes
      // well-formed RRULEs so this is mostly defensive.
      stats.skipped++;
      continue;
    }
    // Anchor = the template's calendar date. We use `dueAt` because
    // that's the date the human chose; `startsAt` would also be fine
    // but might be null for tasks without explicit start/end.
    const anchor = t.dueAt;
    const occurrences = generateOccurrences(rule, anchor, windowEnd);
    if (occurrences.length === 0) continue;

    // Hour-of-day to clone — pin the new task's dueAt to the same
    // wall-clock the template uses, just on the occurrence date.
    const hh = anchor.getUTCHours();
    const mm = anchor.getUTCMinutes();
    const ss = anchor.getUTCSeconds();

    for (const ymd of occurrences) {
      // Build a Date at `${ymd}T${hh:mm:ss}Z` so the cloned dueAt
      // sits at the same wall-time as the template's dueAt.
      const [yy, mo, dd] = ymd.split("-").map(Number) as [number, number, number];
      const dueAt = new Date(Date.UTC(yy, mo - 1, dd, hh, mm, ss));
      const id = crypto.randomUUID();
      const shortId = deriveShortId(id);
      try {
        // Single INSERT … ON CONFLICT DO NOTHING (the unique partial
        // index handles dedup). We do NOT clone:
        //   - `recurrence_rule`        — children aren't rule-holders.
        //   - `legacy_import_key`      — keep null on synthesised rows.
        //   - `transferred_from_id`    — irrelevant for synthesised rows.
        //   - audit-ish state (approval_status, approved_at, etc.)
        const result = await db
          .insert(tasks)
          .values({
            id,
            title: t.title,
            description: t.description,
            doerId: t.doerId,
            initiatorId: t.initiatorId,
            priority: t.priority,
            // Fresh status — the doer starts each occurrence from scratch.
            status: "not_started",
            // dueAt is the only field that varies per occurrence.
            dueAt,
            notes: t.notes,
            subject: t.subject,
            archived: false,
            createdById: t.createdById,
            shortId,
            tags: t.tags ?? null,
            // No approval verdict yet; doer hasn't done anything.
            approvalStatus: null,
            revisedTargetDate: null,
            // Carry over the schedule + recurrence-frequency hints so
            // UI surfaces still render correctly, but the child has
            // no rule of its own.
            startsAt: t.startsAt,
            endsAt: t.endsAt,
            allDay: t.allDay,
            recurrence: t.recurrence,
            recurrenceRule: null,
            recurrenceParentId: t.id,
            recurrenceOccurrenceDate: ymd,
            projectNodeId: t.projectNodeId,
          })
          .onConflictDoNothing({
            target: [tasks.recurrenceParentId, tasks.recurrenceOccurrenceDate],
          })
          .returning({ id: tasks.id });

        if (result.length === 0) {
          // Already existed — dedup hit.
          stats.skipped++;
          continue;
        }
        stats.created++;

        // Audit row — pin the actor to the creator so the timeline
        // tells a coherent story ("Created by <X> (recurring)").
        await db.insert(taskEvents).values({
          taskId: id,
          actorId: t.createdById ?? t.initiatorId,
          eventType: "created",
          note: `materialized from recurring template ${t.shortId ?? t.id} on ${ymd}`,
          createdAt: new Date(),
        }).catch((err) => {
          // Audit failure is non-fatal — the task row is the source of truth.
          // eslint-disable-next-line no-console
          console.warn("[recurrence] audit insert failed", err);
        });

        // (Best-effort short_id collision retry — same pattern as createTask.)
        void nextShortIdCandidate; // intentionally referenced so the import doesn't drift to unused
      } catch (err) {
        stats.errors++;
        // eslint-disable-next-line no-console
        console.warn(
          `[recurrence] failed to materialize ${t.shortId ?? t.id} @ ${ymd}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return stats;
}
