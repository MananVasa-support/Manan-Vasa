import { notFound, redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { goalsCascadeEnabled, goalsCanvasOn } from "@/lib/goals/flag";
import { GoalsLevelBoard } from "@/components/goals/board/goals-level-board";
import {
  type GoalPeriod,
  quartersOfFy,
  monthKeysOfFy,
  quarterKey,
  monthKey,
} from "@/lib/goals/types";
import { loadBoardData } from "./board-data";

/** The query params every level page understands. `period` is the canonical
 *  bucket carrier the board itself pushes; `q` ("Q2") and `m` ("2026-07") are
 *  shareable deep-link sugar for the quarterly / monthly pages. */
export interface LevelPageSearchParams {
  emp?: string;
  fy?: string;
  period?: string;
  q?: string;
  m?: string;
  /** Deep-link: open this goal's drawer on mount. */
  focus?: string;
}

/**
 * Shared shell for the Goals LEVEL PAGES (Yearly / Quarterly / Monthly).
 * Each route is a thin wrapper that renders this with its level + heading; the
 * page renders the weekly-goals-BOARD design (GoalsLevelBoard) locked to that
 * level, with period pills (Q1–Q4 / the 12 FY months) as the in-page bucket
 * nav + always-on drop targets. ONE lean data-load (loadBoardData).
 * Gated by GOALS_CANVAS_ON (redirects to /goals when off, so production —
 * where the flag is off — is unaffected).
 */
export async function LevelPageShell({
  sp,
  level,
  basePath,
  heading,
  tagline,
}: {
  sp: LevelPageSearchParams;
  /** The level this page is locked to. */
  level: GoalPeriod;
  /** The page's own route ("/goals/quarterly") — bucket/person/FY nav stays on it. */
  basePath: string;
  /** Page H1 ("Quarterly Goals"). */
  heading: string;
  /** One-line subtitle under the H1 (the board has a sensible default). */
  tagline?: string;
}) {
  if (!goalsCascadeEnabled()) notFound();
  if (!goalsCanvasOn()) redirect("/goals");

  const data = await loadBoardData(sp);
  const periodKey = resolveBucket(level, data.fyStartYear, sp);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full">
        <GoalsLevelBoard
          {...data}
          level={level}
          periodKey={periodKey}
          basePath={basePath}
          heading={heading}
          tagline={tagline}
          focusId={sp.focus ?? null}
        />
      </main>
      <DashboardFooter />
    </>
  );
}

/** Pick the selected bucket at `level` inside the viewed FY: an explicit
 *  (valid) URL param wins; otherwise the CURRENT quarter/month when the viewed
 *  FY contains it; otherwise the FY's first bucket (Q1 / April). */
function resolveBucket(
  level: GoalPeriod,
  fy: number,
  sp: LevelPageSearchParams,
): string {
  if (level === "year") return String(fy);

  const buckets = level === "quarter" ? quartersOfFy(fy) : monthKeysOfFy(fy);
  const sugar =
    level === "quarter"
      ? sp.q && /^Q[1-4]$/i.test(sp.q)
        ? `${fy}-${sp.q.toUpperCase()}`
        : undefined
      : sp.m;
  const wanted = sp.period ?? sugar;
  if (wanted && buckets.includes(wanted)) return wanted;

  const current = level === "quarter" ? quarterKey(new Date()) : monthKey(new Date());
  if (buckets.includes(current)) return current;
  return buckets[0] ?? String(fy);
}
