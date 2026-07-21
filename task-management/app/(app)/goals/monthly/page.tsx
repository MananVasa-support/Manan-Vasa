import { LevelPageShell, type LevelPageSearchParams } from "../level-page-shell";

export const dynamic = "force-dynamic";

/** Monthly Goals — all 12 FY months (Apr…Mar) grouped under their quarters,
 *  current month pre-selected, scoping the board to that month's goals;
 *  quick-add drops into it, and cards drag between the month pills.
 *  Deep-linkable: `?m=2026-07` (sugar) or `?period=2026-07`. */
export default async function MonthlyGoalsPage({
  searchParams,
}: {
  searchParams: Promise<LevelPageSearchParams>;
}) {
  return (
    <LevelPageShell
      sp={await searchParams}
      level="month"
      basePath="/goals/monthly"
      heading="Monthly Goals"
    />
  );
}
