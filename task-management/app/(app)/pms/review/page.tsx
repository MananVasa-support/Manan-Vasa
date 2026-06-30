import Link from "next/link";
import type { Route } from "next";
import { ClipboardCheck, Sparkles, Target } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { MODULE_THEME } from "@/lib/module-theme";
import {
  reviewablePeople,
  getMyReview,
  listMyAuthoredReviews,
  listMyPersonalGoals,
  REVIEW_CHANGE_TAGS,
} from "@/lib/queries/pms-review";
import { ReviewForm, type ReviewPerson } from "@/components/pms/review/review-form";
import { PersonalGoalsEditor, type PersonalGoalRow } from "@/components/pms/review/personal-goals-editor";

export const dynamic = "force-dynamic";

const ACCENT = MODULE_THEME.employees.accent; // green
const ACCENT_DEEP = MODULE_THEME.employees.accentDeep;

/** Current IST month as 'YYYY-MM' (UTC components shifted +5:30 == IST wall clock). */
function istPeriod(): { period: string; label: string } {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const period = `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = ist.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { period, label };
}

export default async function PmsReviewPage() {
  const me = await requireUser();
  const { period, label } = istPeriod();

  const [scope, authored, myGoals] = await Promise.all([
    reviewablePeople({ id: me.id, managerId: me.managerId }),
    listMyAuthoredReviews(me.id, period),
    listMyPersonalGoals(me.id, period),
  ]);

  const doneKey = new Set(authored.map((a) => `${a.subjectId}:${a.relation}`));
  const flat = [...scope.manager, ...scope.subordinate, ...scope.peer];

  // Pre-fetch prior reviews for the subjects the user has already done, so the
  // form opens in edit mode for those. (Batched — bounded to the roster.)
  const priorEntries = await Promise.all(
    flat
      .filter((p) => doneKey.has(`${p.id}:${p.relation}`))
      .map(async (p) => {
        const r = await getMyReview(me.id, p.id, p.relation, period);
        return [p.id, r] as const;
      }),
  );
  const priorById = new Map(priorEntries);

  const people: ReviewPerson[] = flat.map((p) => {
    const prior = priorById.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      department: p.department,
      relation: p.relation,
      done: doneKey.has(`${p.id}:${p.relation}`),
      prior: prior
        ? {
            attitude: prior.attitude,
            behaviour: prior.behaviour,
            skill: prior.skill,
            changeTags: prior.changeTags ?? [],
            explanation: prior.explanation,
            scope: (prior.scope as "internal" | "external") ?? "internal",
          }
        : null,
    };
  });

  const goalRows: PersonalGoalRow[] = myGoals.map((g) => ({
    title: g.title,
    detail: g.detail ?? "",
    status: (g.status as PersonalGoalRow["status"]) ?? "active",
  }));

  const reviewedCount = people.filter((p) => p.done).length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-7 flex items-end justify-between gap-4 flex-wrap wg-rise">
          <div>
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <ClipboardCheck size={13} strokeWidth={2.6} /> Employees · Monthly 360
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.025em", lineHeight: 1.04 }}
            >
              Monthly Review
            </h1>
            <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "68ch" }}>
              Rate the people you work with on Attitude, Behaviour and Skill (3–5) for {label}. Your
              ratings feed the Attitude and Team-Work pillars of each person&apos;s PMS score — set
              your own three personal goals below.
            </p>
          </div>
          <Link
            href={"/pms" as Route}
            className="inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-[14px] font-bold transition-colors"
            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
          >
            <Target size={16} strokeWidth={2.4} /> View scores
          </Link>
        </header>

        <div className="grid grid-cols-[1.6fr_1fr] gap-5 max-lg:grid-cols-1">
          {/* 360 review workspace */}
          <section
            className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm"
            style={{ animationDelay: "0ms" }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold text-ink-strong">360 Review</h2>
              {people.length > 0 && (
                <span className="text-[12.5px] font-semibold text-ink-subtle">
                  {reviewedCount} of {people.length} done
                </span>
              )}
            </div>
            <ReviewForm
              people={people}
              changeTags={REVIEW_CHANGE_TAGS}
              period={period}
              periodLabel={label}
              accent={ACCENT}
              accentDeep={ACCENT_DEEP}
            />
          </section>

          {/* Personal goals */}
          <section
            className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm"
            style={{ animationDelay: "35ms" }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={18} strokeWidth={2.4} style={{ color: ACCENT }} />
              <h2 className="text-[17px] font-bold text-ink-strong">My Personal Goals</h2>
            </div>
            <p className="mb-4 text-[13.5px] text-ink-muted" style={{ maxWidth: "40ch" }}>
              Three non-work goals for {label} — yours to track and reflect on.
            </p>
            <PersonalGoalsEditor
              initial={goalRows}
              period={period}
              periodLabel={label}
              accent={ACCENT}
              accentDeep={ACCENT_DEEP}
            />
          </section>
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
