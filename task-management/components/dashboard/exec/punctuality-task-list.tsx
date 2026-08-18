"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
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
          {/* Scrolls INSIDE its own box so the row count can't push the page
              down and the panel keeps the left column's height. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="px-3.5 py-2.5">Task</th>
                  <th className="px-3.5 py-2.5">Assignee</th>
                  <th className="px-3.5 py-2.5 text-right whitespace-nowrap">Days Late</th>
                </tr>
              </thead>
              <tbody>
                {state.data.tasks.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-gray-100 transition-colors hover:bg-gray-50"
                  >
                    <td className="px-3.5 py-2.5">
                      <span
                        className="block max-w-[420px] truncate text-[15px] font-semibold leading-snug text-gray-900"
                        title={t.title}
                      >
                        {t.taskNo ? `#${t.taskNo} · ` : ""}
                        {t.title}
                      </span>
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

          {state.data.truncated && (
            <p className="shrink-0 border-t border-gray-100 bg-gray-50 px-3.5 py-2 text-[12px] font-semibold text-gray-500">
              Showing {state.data.tasks.length.toLocaleString("en-IN")} of{" "}
              {state.data.total.toLocaleString("en-IN")} — narrow the dashboard
              filters to see the rest.
            </p>
          )}
        </>
      )}
    </div>
  );
}
