"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, CalendarCheck, AlertTriangle, Building2 } from "lucide-react";
import { useReducedMotion } from "@/lib/motion-utils";
import { formatDate } from "@/lib/format";
import { getPunctualityDrilldown } from "@/app/(app)/dashboard/drilldown-actions";
import type {
  PunctualityDrilldown,
  PunctualityBucket,
  PunctualityBasisId,
} from "@/lib/queries/punctuality-drilldown";
import type { DoneOnTime, DoneAgingBandCount } from "@/lib/types";

/* ─────────────────────────── shared chrome ─────────────────────────── */

const OVERLAY_BG =
  "radial-gradient(120% 120% at 50% 30%, color-mix(in srgb, var(--color-altus-red-deep) 16%, transparent), color-mix(in srgb, var(--color-ink-strong) 58%, transparent))";

/** The glassmorphic sheet both surfaces sit on — matches manager-drilldown. */
const SHEET_BG =
  "linear-gradient(155deg, color-mix(in srgb, var(--color-altus-red) 4%, var(--color-surface-card)) 0%, color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card)) 100%)";

function CloseButton() {
  return (
    <Dialog.Close
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong"
      aria-label="Close"
    >
      <X size={18} strokeWidth={2.4} />
    </Dialog.Close>
  );
}

/* ──────────────────── delay-severity bucketing ──────────────────── */

/**
 * The requested 1–3 / 4–7 / 8+ severity view, folded out of the histogram the
 * dashboard already computes. `DONE_AGING_BANDS` splits late work finer than
 * this (1, 2–3, 4–5, 6–7, 8–10, 11–15, 16+), so each bucket is just a sum —
 * no new query and no risk of the two views disagreeing.
 */
export function severityBuckets(histogram: DoneAgingBandCount[]) {
  const at = (id: string) => histogram.find((b) => b.id === id)?.count ?? 0;
  return [
    { id: "d1_3", label: "1–3 days late", count: at("l1") + at("l2_3"), tone: "amber" },
    { id: "d4_7", label: "4–7 days late", count: at("l4_5") + at("l6_7"), tone: "orange" },
    { id: "d8", label: "8+ days late", count: at("l8_10") + at("l11_15") + at("l16"), tone: "red" },
  ];
}

/* ───────────────────────── task-list drawer ───────────────────────── */

/**
 * Right-anchored drawer listing the delivered tasks behind one half of the
 * gauge. Data is fetched ON OPEN via a server action, never with the dashboard,
 * and re-fetched when the basis or bucket changes so it always matches the arc
 * the user clicked.
 */
export function PunctualityDrawer({
  open,
  basis,
  bucket,
  onClose,
}: {
  open: boolean;
  basis: PunctualityBasisId;
  bucket: PunctualityBucket;
  onClose: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; data: PunctualityDrilldown }
  >({ kind: "loading" });

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    void getPunctualityDrilldown(basis, bucket, search).then((res) => {
      if (cancelled) return;
      if ("error" in res) setState({ kind: "error", message: res.error });
      else setState({ kind: "ok", data: res });
    });
    return () => {
      cancelled = true;
    };
  }, [open, basis, bucket, search]);

  const isLate = bucket === "late";
  const title = isLate ? "Delivered late" : "Delivered on time";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[120]"
          style={{ background: OVERLAY_BG, backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-[121] right-0 top-0 h-full w-[560px] max-w-full outline-none flex flex-col
                     max-md:w-full"
          style={{
            background: SHEET_BG,
            borderLeft: "1px solid color-mix(in srgb, var(--color-altus-red) 12%, var(--color-hairline-strong))",
            boxShadow: "0 40px 120px color-mix(in srgb, var(--color-ink-strong) 36%, transparent)",
            animation: reduce ? "none" : "drilldownIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `color-mix(in srgb, var(--color-${isLate ? "red" : "green"}) 12%, transparent)`,
                  color: `var(--color-${isLate ? "red" : "green"}-deep)`,
                }}
              >
                {isLate ? <AlertTriangle size={18} strokeWidth={2.4} /> : <CalendarCheck size={18} strokeWidth={2.4} />}
              </span>
              <div className="min-w-0">
                <Dialog.Title
                  className="leading-none text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 900,
                    fontSize: 19,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {title}
                </Dialog.Title>
                <p className="mt-1.5 text-[12.5px] font-semibold text-ink-subtle">
                  Done tasks · vs the {basis} due date
                  {state.kind === "ok" && ` · ${state.data.total.toLocaleString()} total`}
                </p>
              </div>
            </div>
            <CloseButton />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {state.kind === "loading" && (
              <div className="flex items-center justify-center gap-2 py-16 text-ink-subtle">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-[14px] font-semibold">Loading tasks…</span>
              </div>
            )}

            {state.kind === "error" && (
              <p className="py-16 text-center text-[14px] font-semibold text-ink-soft">
                Couldn&apos;t load the list. {state.message}
              </p>
            )}

            {state.kind === "ok" && state.data.tasks.length === 0 && (
              <p className="py-16 text-center text-[14px] font-semibold text-ink-soft">
                No {isLate ? "late" : "on-time"} deliveries in this range.
              </p>
            )}

            {state.kind === "ok" && state.data.tasks.length > 0 && (
              <>
                <ul className="flex flex-col gap-2">
                  {state.data.tasks.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/tasks/${t.id}/focus` as Route}
                        className="group flex items-start justify-between gap-3 rounded-chip border border-hairline bg-surface-card px-3.5 py-3 transition-colors hover:border-altus-red/40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[14.5px] font-semibold text-ink-strong group-hover:text-altus-red-deep">
                            {t.taskNo != null && (
                              <span className="tabular-nums text-ink-subtle">#{t.taskNo} · </span>
                            )}
                            {t.title}
                          </span>
                          <span className="mt-1 block truncate text-[12.5px] font-semibold text-ink-subtle">
                            {[t.doerName, t.client, t.subject].filter(Boolean).join(" · ") || "—"}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-ink-subtle">
                            Due {formatDate(new Date(t.dueAt))} · done{" "}
                            {formatDate(new Date(t.completedAt))}
                          </span>
                        </span>
                        {/* The delay duration the brief asks for — the reason
                            this row is in the list. */}
                        <span
                          className="shrink-0 rounded-pill px-2.5 py-1 text-[12px] font-black tabular-nums whitespace-nowrap"
                          style={{
                            color: `var(--color-${isLate ? "red" : "green"}-deep)`,
                            background: `color-mix(in srgb, var(--color-${isLate ? "red" : "green"}) 12%, transparent)`,
                            border: `1px solid color-mix(in srgb, var(--color-${isLate ? "red" : "green"}) 26%, transparent)`,
                          }}
                        >
                          {isLate
                            ? `${t.daysLate}d late`
                            : t.daysEarly === 0
                              ? "on the day"
                              : `${t.daysEarly}d early`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {state.data.truncated && (
                  <p className="mt-3 text-center text-[12.5px] font-semibold text-ink-subtle">
                    Showing the first {state.data.tasks.length} of{" "}
                    {state.data.total.toLocaleString()} — narrow the date range to see the rest.
                  </p>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ──────────────────────── expanded breakdown ──────────────────────── */

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <span
      aria-hidden
      className="block overflow-hidden rounded-full"
      style={{ height: 6, background: "var(--color-hairline)" }}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
        }}
      />
    </span>
  );
}

/**
 * The maximized card: delay severity, per-department on-time rates, and both
 * measuring bases side by side. Everything here is derived from data the
 * dashboard already loaded — opening it costs no request.
 */
export function PunctualityExpanded({
  open,
  data,
  basis,
  onClose,
}: {
  open: boolean;
  data: DoneOnTime;
  basis: PunctualityBasisId;
  onClose: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const active = data[basis];
  const buckets = severityBuckets(active.histogram);
  const lateTotal = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[120]"
          style={{ background: OVERLAY_BG, backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-[121] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] max-w-[calc(100vw-32px)]
                     max-h-[calc(100dvh-64px)] overflow-hidden rounded-section outline-none flex flex-col
                     max-md:h-full max-md:max-h-none max-md:w-full max-md:rounded-none max-md:left-0 max-md:top-0 max-md:translate-x-0 max-md:translate-y-0"
          style={{
            background: SHEET_BG,
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 12%, var(--color-hairline-strong))",
            boxShadow: "0 40px 120px color-mix(in srgb, var(--color-ink-strong) 36%, transparent)",
            animation: reduce ? "none" : "drilldownIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
            <div>
              <Dialog.Title
                className="leading-none text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 20,
                  letterSpacing: "-0.02em",
                }}
              >
                Delivery breakdown
              </Dialog.Title>
              <p className="mt-1.5 text-[12.5px] font-semibold text-ink-subtle">
                Measured against the {basis} due date
              </p>
            </div>
            <CloseButton />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-7">
            {/* ── Original vs Revised, side by side ── */}
            <section>
              <h3 className="mb-3 text-[11.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                Original vs Revised
              </h3>
              <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                {(["original", "revised"] as const).map((b) => {
                  const v = data[b];
                  const isActive = b === basis;
                  return (
                    <div
                      key={b}
                      className="rounded-chip px-4 py-3.5"
                      style={{
                        background: "var(--color-surface-card)",
                        border: `1px solid ${isActive ? "var(--color-altus-red)" : "var(--color-hairline)"}`,
                      }}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-black uppercase tracking-[0.1em] text-ink-subtle">
                          {b}
                        </span>
                        {isActive && (
                          <span
                            className="rounded-pill px-2 py-0.5 text-[10px] font-black uppercase"
                            style={{
                              color: "var(--color-altus-red-deep)",
                              background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
                            }}
                          >
                            Showing
                          </span>
                        )}
                      </span>
                      <span
                        className="mt-1.5 block tabular-nums leading-none text-ink-strong"
                        style={{
                          fontFamily: "var(--font-display), system-ui, sans-serif",
                          fontWeight: 900,
                          fontSize: 34,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {v.onTimeRate}
                        <span style={{ fontSize: 18 }}>%</span>
                      </span>
                      <span className="mt-1.5 block text-[12.5px] font-semibold text-ink-subtle tabular-nums">
                        {v.onTime.toLocaleString()} on time · {v.late.toLocaleString()} late
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Delay severity ── */}
            <section>
              <h3 className="mb-3 text-[11.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                Delay severity
              </h3>
              {lateTotal === 0 ? (
                <p className="text-[13.5px] font-semibold text-ink-soft">
                  Nothing delivered late in this range.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {buckets.map((b) => (
                    <li key={b.id}>
                      <span className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="text-[13.5px] font-bold text-ink-strong">{b.label}</span>
                        <span className="tabular-nums text-[13px] font-semibold text-ink-subtle">
                          {b.count.toLocaleString()}
                          <span className="ml-1.5 opacity-70">
                            ({lateTotal > 0 ? Math.round((b.count / lateTotal) * 100) : 0}%)
                          </span>
                        </span>
                      </span>
                      <Bar pct={lateTotal > 0 ? (b.count / lateTotal) * 100 : 0} tone={b.tone} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Departmental performance ── */}
            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-[11.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                <Building2 size={13} strokeWidth={2.6} />
                On-time by department
              </h3>
              {active.byDepartment.length === 0 ? (
                <p className="text-[13.5px] font-semibold text-ink-soft">
                  No department memberships recorded for these doers.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {active.byDepartment.map((d) => (
                    <li key={d.departmentId}>
                      <span className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13.5px] font-bold text-ink-strong">
                          {d.departmentName}
                        </span>
                        <span className="shrink-0 tabular-nums text-[13px] font-semibold text-ink-subtle">
                          {d.rate}%
                          <span className="ml-1.5 opacity-70">
                            ({d.onTime}/{d.done})
                          </span>
                        </span>
                      </span>
                      <Bar pct={d.rate} tone={d.rate >= 80 ? "green" : d.rate >= 60 ? "amber" : "red"} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
