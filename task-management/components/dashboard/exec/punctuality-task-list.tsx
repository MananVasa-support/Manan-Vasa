"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { getPunctualityDrilldown } from "@/app/(app)/dashboard/drilldown-actions";
import type {
  PunctualityBucket,
  PunctualityDrilldown,
} from "@/lib/queries/punctuality-drilldown";

/**
 * The RIGHT panel of the "Delivered On Time" widget — the task breakdown behind
 * whichever KPI card is selected on the left.
 *
 * Replaces the old `LateTasksBreakdown`, which was a collapsed accordion that
 * only ever showed the LATE half. Three things changed:
 *
 *   · It is always open. It is now a permanent column beside the gauge rather
 *     than a drawer you had to discover, so an accordion around it was a click
 *     between the user and the thing the card is about.
 *   · It takes a `bucket`, so the same list serves "Total Completed" / "On Time"
 *     / "Late Deliveries". Switching cards refetches — the sets genuinely differ.
 *   · The "Revised / Original due date" column is GONE. The columns are TASK ·
 *     ASSIGNEE · DAYS LATE, and the first two are set larger and bolder: this is
 *     a scan-for-a-name list, and 13px grey text made that work.
 *
 * Fetching stays lazy and keyed by `(basis, bucket, filters)` — the dashboard
 * load path never pays for it, and re-selecting a card you've already viewed is
 * served from the last response rather than re-hitting the server.
 */
/** Rows shown before "Load more" — and the size of each further page. */
const PAGE = 6;

export function PunctualityTaskList({
  basis,
  bucket,
}: {
  basis: "original" | "revised";
  bucket: PunctualityBucket;
}) {
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ok"; data: PunctualityDrilldown }
  >({ kind: "loading" });

  // How many rows are on screen. The list runs to hundreds and a wall of them
  // buries the gauge beside it, so it opens at PAGE and grows on demand.
  const [shown, setShown] = React.useState(PAGE);

  // Keyed by everything the result depends on, so flipping back to a card you
  // already looked at doesn't re-hit the server.
  const requestKey = `${basis}|${bucket}|${search}`;
  const loadedKey = React.useRef<string | null>(null);
  const cache = React.useRef(new Map<string, PunctualityDrilldown>());

  React.useEffect(() => {
    const hit = cache.current.get(requestKey);
    if (hit) {
      loadedKey.current = requestKey;
      setState({ kind: "ok", data: hit });
      return;
    }

    // Switching card / basis / filters is a different list — start it at the
    // top rather than carrying the previous list's expansion over.
    setShown(PAGE);

    let cancelled = false;
    setState({ kind: "loading" });
    void getPunctualityDrilldown(basis, bucket, search).then((res) => {
      if (cancelled) return;
      if ("error" in res) {
        setState({ kind: "error", message: res.error });
      } else {
        cache.current.set(requestKey, res);
        loadedKey.current = requestKey;
        setState({ kind: "ok", data: res });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [basis, bucket, search, requestKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200">
      {state.kind === "loading" && (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm font-semibold">Loading tasks…</span>
        </div>
      )}

      {state.kind === "error" && (
        <p className="flex-1 px-4 py-16 text-center text-sm font-semibold text-gray-500">
          Couldn&apos;t load the list. {state.message}
        </p>
      )}

      {state.kind === "ok" && state.data.tasks.length === 0 && (
        <p className="flex-1 px-4 py-16 text-center text-sm font-semibold text-gray-500">
          {bucket === "late"
            ? "No late deliveries in range — everything landed on time."
            : bucket === "onTime"
              ? "No on-time deliveries in range."
              : "No completed tasks in range."}
        </p>
      )}

      {state.kind === "ok" && state.data.tasks.length > 0 && (
        <>
          {/* Scrolls INSIDE its own box, capped at 360px.
              `flex-1` alone was not enough: it only resolves to a fixed height
              when an ancestor is itself height-constrained, and on this
              dashboard nothing above it is — so the box sized to its content and
              every "Load more" press grew the card and shoved the widgets below
              it down the page. The explicit max-h is what makes the cap real, so
              appending rows fills the scroller instead of the layout. */}
          <div className="min-h-0 max-h-[360px] flex-1 overflow-y-auto overscroll-contain">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="px-3.5 py-2.5">Task</th>
                  <th className="px-3.5 py-2.5">Assignee</th>
                  <th className="px-3.5 py-2.5 text-right whitespace-nowrap">Days Late</th>
                </tr>
              </thead>
              <tbody>
                {state.data.tasks.slice(0, shown).map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-gray-100 transition-colors hover:bg-gray-50"
                  >
                    <td className="px-3.5 py-2.5">
                      {/* The whole title is a link to the task — this list is a
                          triage queue, so the next move after spotting a late
                          row is always to open it. */}
                      <Link
                        href={`/tasks/${t.id}` as Route}
                        className="block max-w-[420px] truncate text-[15px] font-semibold leading-snug text-gray-900 hover:text-altus-red hover:underline"
                        title={t.title}
                      >
                        {t.taskNo ? `#${t.taskNo} · ` : ""}
                        {t.title}
                      </Link>
                      {t.client && (
                        <span className="block truncate text-[12.5px] font-medium text-gray-500">
                          {t.client}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-[15px] font-semibold text-gray-900 whitespace-nowrap">
                      {t.doerName ?? "—"}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      {t.daysLate > 0 ? (
                        <span className="inline-flex min-w-[46px] justify-center rounded-full bg-red-50 px-2.5 py-1 text-[13px] font-black tabular-nums text-red-600">
                          {t.daysLate}d
                        </span>
                      ) : (
                        // An on-time row has no days-late to badge. Saying so in
                        // words beats a red "0", which reads as a near-miss.
                        <span className="inline-flex justify-center rounded-full bg-emerald-50 px-2.5 py-1 text-[12.5px] font-bold text-emerald-700">
                          On time
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ONE status bar, always present — it used to be two mutually
              exclusive strips (a Load-more button, then a truncation note that
              only appeared once everything was expanded), so the count vanished
              at exactly the moment the list got long enough to need it. Pinned
              with `sticky bottom-0` so it stays legible while the rows scroll
              behind it. */}
          <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-slate-50 px-3.5 py-2">
            <span className="min-w-0 truncate text-[12px] font-semibold text-gray-500">
              Showing {Math.min(shown, state.data.tasks.length).toLocaleString("en-IN")}{" "}
              of {state.data.total.toLocaleString("en-IN")}
              {state.data.truncated && shown >= state.data.tasks.length
                ? " — narrow the dashboard filters to see the rest."
                : ""}
            </span>
            {shown < state.data.tasks.length && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                <ChevronDown size={14} strokeWidth={2.6} />
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
