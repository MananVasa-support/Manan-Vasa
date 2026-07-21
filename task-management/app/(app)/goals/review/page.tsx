import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ReviewBoard } from "@/components/goals/cascade/review-board";
import { ReviewControls } from "@/components/goals/review/review-controls";
import {
  effectiveGoalPct,
  fyLabel,
  type GoalDTO,
  type GoalPeriodBucket,
} from "@/components/goals/cascade/util";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { currentWeekStart } from "@/lib/weekly-goals/week";
import type { GoalPeriod } from "@/lib/goals/types";
import { loadCanvasData } from "../canvas-data";

export const dynamic = "force-dynamic";

/** Level ordering for the roll-up chart / bucket list (year → quarter → month). */
const LEVEL_RANK: Record<GoalPeriod, number> = { year: 0, quarter: 1, month: 2 };

const eff = (g: { acceptPct: number | null; pctDone: number }): number => effectiveGoalPct(g);
const avg = (xs: number[]): number =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

/**
 * Review & Scores — the manager scorecard for the Goals module. Reuses the
 * shared canvas loader (person-scoped via ?emp=, FY via ?fy=), computes the
 * headline stats + per-period roll-up, resolves evidence storage paths into
 * short-lived signed URLs, then hands everything to the ReviewBoard (self %,
 * manager accept %, notes, evidence — all live). Available to anyone with
 * Goals access; write/review verbs gate on the loader's canWrite / canReview.
 */
export default async function GoalsReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string; fy?: string }>;
}) {
  const sp = await searchParams;
  const data = await loadCanvasData({ emp: sp.emp, fy: sp.fy });

  // ── Headline: this week's weekly score, YTD weekly avg, counts ──
  const thisWeek = currentWeekStart();
  const weekRows = data.weekly.filter((w) => w.weekStart === thisWeek);
  const headline = {
    weekScore: avg(weekRows.map(eff)),
    ytdWeeklyAvg: avg(data.weekly.map(eff)),
    weeklyGoalCount: data.weekly.length,
    cascadeGoalCount: data.goals.length,
  };

  // ── Roll-up: average effective % per period bucket (year/quarter/month) ──
  const byKey = new Map<string, { period: GoalPeriod; vals: number[] }>();
  for (const g of data.goals) {
    const entry = byKey.get(g.periodKey) ?? { period: g.period as GoalPeriod, vals: [] };
    entry.vals.push(eff(g));
    byKey.set(g.periodKey, entry);
  }
  const buckets: GoalPeriodBucket[] = [...byKey.entries()]
    .map(([periodKey, e]) => ({ period: e.period, periodKey, count: e.vals.length, avg: avg(e.vals) }))
    .sort(
      (a, b) => LEVEL_RANK[a.period] - LEVEL_RANK[b.period] || a.periodKey.localeCompare(b.periodKey),
    );

  // ── Evidence: sign bucket-stored files (1h), pass through pasted links ──
  const evidenceHrefs = await resolveEvidence(data.goals);

  const myEmployeeId = data.myEmployeeId ?? "";
  const viewedEmployeeId = data.viewedEmployeeId ?? myEmployeeId;
  const isSelf = viewedEmployeeId === myEmployeeId;
  const viewedName = data.viewedName ?? "This person";
  const canReview = data.canReview ?? false;
  const canSelfRate = data.canWrite ?? false;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 32 }}
            >
              Review &amp; Scores
            </h1>
            <p className="mt-1 text-[14.5px] text-ink-muted">
              Self-ratings, manager acceptance and evidence for{" "}
              <span className="font-bold text-ink-soft">{isSelf ? "your" : `${viewedName}'s`}</span> goals ·{" "}
              {fyLabel(data.fyStartYear)}
            </p>
          </div>
          <ReviewControls
            roster={data.roster}
            viewedEmployeeId={viewedEmployeeId}
            viewedName={viewedName}
            myEmployeeId={myEmployeeId}
            fyStartYear={data.fyStartYear}
          />
        </header>

        <ReviewBoard
          goals={data.goals}
          roster={data.roster}
          headline={headline}
          buckets={buckets}
          canSelfRate={canSelfRate}
          canReview={canReview}
          evidenceHrefs={evidenceHrefs}
        />
      </main>
      <DashboardFooter />
    </>
  );
}

/** Turn each goal's stored evidence into an openable href: `bucket:<path>` →
 *  a 1-hour signed URL from the private documents bucket; a pasted link passes
 *  through unchanged. Failures are skipped (the row just shows no "View"). */
async function resolveEvidence(goals: GoalDTO[]): Promise<Record<string, string>> {
  const withEvidence = goals.filter((g) => g.evidenceUrl);
  if (withEvidence.length === 0) return {};
  const admin = getSupabaseAdmin();
  const out: Record<string, string> = {};
  await Promise.all(
    withEvidence.map(async (g) => {
      const url = g.evidenceUrl!;
      if (url.startsWith("bucket:")) {
        try {
          const { data: signed } = await admin.storage
            .from(DOCUMENTS_BUCKET)
            .createSignedUrl(url.slice("bucket:".length), 3600);
          if (signed?.signedUrl) out[g.id] = signed.signedUrl;
        } catch {
          // storage hiccup — skip; the review row just won't show "View evidence".
        }
      } else {
        out[g.id] = url;
      }
    }),
  );
  return out;
}
