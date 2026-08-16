"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { getPunctualityDrilldown } from "@/app/(app)/dashboard/drilldown-actions";
import type { PunctualityDrilldown } from "@/lib/queries/punctuality-drilldown";

/**
 * Inline, expandable breakdown of the LATE half of the on-time gauge.
 *
 * Sits under the gauge rather than in the side drawer, so the number in the
 * summary strip can be interrogated without leaving the card. The drawer still
 * exists for the click-a-gauge-half path; both read the SAME server action, so
 * the two lists can never disagree.
 *
 * Fetching is lazy and one-shot per (basis, filters): nothing is requested
 * until the panel is first opened, so a dashboard load never pays for it.
 * Re-opening after a basis change refetches, because the set of "late" tasks
 * is different when measured against the original vs the revised due date.
 */
export function LateTasksBreakdown({
  basis,
  lateCount,
}: {
  basis: "original" | "revised";
  lateCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  const [state, setState] = React.useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ok"; data: PunctualityDrilldown }
  >({ kind: "idle" });

  // Keyed by what the result depends on. Collapsing does NOT discard the data,
  // so toggling the panel twice doesn't re-hit the server.
  const requestKey = `${basis}|${search}`;
  const loadedKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (loadedKey.current === requestKey && state.kind === "ok") return;

    let cancelled = false;
    setState({ kind: "loading" });
    void getPunctualityDrilldown(basis, "late", search).then((res) => {
      if (cancelled) return;
      if ("error" in res) {
        setState({ kind: "error", message: res.error });
      } else {
        loadedKey.current = requestKey;
        setState({ kind: "ok", data: res });
      }
    });
    return () => {
      cancelled = true;
    };
    // `state.kind` is deliberately absent: including it would re-run the effect
    // on every state transition this effect itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, basis, search, requestKey]);

  if (lateCount === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="late-tasks-panel"
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-sm font-bold text-gray-900">
          View {lateCount.toLocaleString("en-IN")} Late Task
          {lateCount === 1 ? "" : "s"} Breakdown
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2.6}
          className="shrink-0 text-red-600 transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <div
          id="late-tasks-panel"
          className="mt-2 overflow-hidden rounded-xl border border-gray-200"
        >
          {state.kind === "loading" && (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm font-semibold">Loading late tasks…</span>
            </div>
          )}

          {state.kind === "error" && (
            <p className="py-10 text-center text-sm font-semibold text-gray-500">
              Couldn&apos;t load the list. {state.message}
            </p>
          )}

          {state.kind === "ok" && (
            <>
              {/* Scrollable body with a sticky header — the list can run to
                  hundreds of rows and must not push the page down. */}
              <div className="max-h-[320px] overflow-y-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                      <th className="px-3 py-2">Task</th>
                      <th className="px-3 py-2">Assignee</th>
                      {/* The gauge measures against ONE basis at a time, so this
                          column shows whichever is selected rather than implying
                          both are on screen. */}
                      <th className="px-3 py-2">
                        {basis === "revised" ? "Revised" : "Original"} due date
                      </th>
                      <th className="px-3 py-2 text-right">Days late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.tasks.map((t) => (
                      <tr key={t.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <span className="block max-w-[280px] truncate font-semibold text-gray-900" title={t.title}>
                            {t.taskNo ? `#${t.taskNo} · ` : ""}
                            {t.title}
                          </span>
                          {t.client && (
                            <span className="block truncate text-xs text-gray-500">{t.client}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{t.doerName ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-700">
                          {formatDay(t.dueAt)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex min-w-[42px] justify-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-black tabular-nums text-red-600">
                            {t.daysLate}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {state.data.truncated && (
                <p className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
                  Showing the {state.data.tasks.length.toLocaleString("en-IN")} latest of{" "}
                  {state.data.total.toLocaleString("en-IN")} — narrow the dashboard filters to see the rest.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** "12 Aug 2026" from an ISO string; falls back to the raw value. */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
