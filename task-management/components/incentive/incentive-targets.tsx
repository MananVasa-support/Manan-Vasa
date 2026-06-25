"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Target, Loader2, Pencil } from "lucide-react";
import { formatInr } from "@/lib/format";
import type { IncentiveTargetVsActual } from "@/lib/queries/incentives";
import { setIncentiveYearTarget } from "@/app/(app)/incentive/admin-actions";
import { fireToast } from "@/lib/toast";
import { IncentivePersonDrilldown } from "./incentive-person-drilldown";

/* Attainment threshold colors: green ≥100, amber ≥60, red below. */
function attainTone(pct: number | null): { color: string; bg: string } {
  if (pct == null) return { color: "var(--color-ink-subtle)", bg: "var(--color-hairline)" };
  if (pct >= 100) return { color: "var(--color-green-deep)", bg: "var(--color-green)" };
  if (pct >= 60) return { color: "#B45309", bg: "#F59E0B" };
  return { color: "var(--color-red-deep)", bg: "var(--color-altus-red)" };
}

export function IncentiveTargets({
  data,
  year,
  isAdmin,
}: {
  data: IncentiveTargetVsActual;
  year: number;
  isAdmin: boolean;
}) {
  const { rows, totals } = data;
  const [drillName, setDrillName] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState<number>(0);

  function openEdit(name: string, current: number) {
    setEditName(name);
    setEditValue(current);
  }

  return (
    <div className="space-y-7">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <SummaryCard label="TOTAL TARGET" value={formatInr(totals.target)} tone="slate" />
        <SummaryCard label="TOTAL ACTUAL" value={formatInr(totals.actual)} tone="red" />
        <SummaryCard
          label="ATTAINMENT"
          value={totals.attainmentPct == null ? "—" : `${totals.attainmentPct.toFixed(0)}%`}
          tone="green"
        />
      </div>

      <section
        className="rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <header className="flex items-start gap-3 mb-5">
          <span
            aria-hidden
            className="mt-1 h-7 w-[3px] shrink-0 rounded-full"
            style={{ background: "linear-gradient(180deg, var(--color-red), var(--color-red-deep))" }}
          />
          <div>
            <h2 className="text-display-lg text-ink-strong">Target vs Actual</h2>
            <p className="text-body-lg text-ink-subtle mt-0.5">
              Year target compared to incentive earned · {year}
            </p>
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="font-semibold" style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}>
            No targets or earnings this year yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th align="right">Target</Th>
                  <Th align="right">Actual</Th>
                  <Th>Attainment</Th>
                  {isAdmin && <Th align="right">Set</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const tone = attainTone(r.attainmentPct);
                  const barPct = r.attainmentPct == null ? 0 : Math.min(100, r.attainmentPct);
                  return (
                    <tr
                      key={r.empName}
                      className="border-t group"
                      style={{ borderColor: "var(--color-hairline)" }}
                    >
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          onClick={() => setDrillName(r.empName)}
                          className="font-bold text-ink-strong text-left hover:text-altus-red transition-colors"
                          style={{ fontSize: 14 }}
                        >
                          {r.empName}
                        </button>
                      </td>
                      <Td align="right">{r.target > 0 ? formatInr(r.target) : "—"}</Td>
                      <Td align="right" bold>
                        {formatInr(r.actual)}
                      </Td>
                      <td className="py-2.5 pl-3 min-w-[180px]">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex-1 h-2.5 rounded-full overflow-hidden"
                            style={{ background: "var(--color-hairline)" }}
                          >
                            <span
                              className="block h-full rounded-full transition-all"
                              style={{ width: `${Math.max(2, barPct)}%`, background: tone.bg }}
                            />
                          </div>
                          <span
                            className="tabular-nums font-black w-12 text-right shrink-0"
                            style={{ fontSize: 13, color: tone.color }}
                          >
                            {r.attainmentPct == null ? "—" : `${r.attainmentPct.toFixed(0)}%`}
                          </span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEdit(r.empName, r.target)}
                            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline px-2.5 py-1 text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-colors"
                            style={{ fontSize: 12, fontWeight: 600 }}
                          >
                            <Pencil size={12} strokeWidth={2.4} />
                            Target
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr className="border-t-2" style={{ borderColor: "var(--color-hairline-strong)" }}>
                  <td
                    className="py-2.5 font-black uppercase tracking-[0.04em] text-ink-strong"
                    style={{ fontSize: 13 }}
                  >
                    Total
                  </td>
                  <Td align="right" bold>
                    {formatInr(totals.target)}
                  </Td>
                  <Td align="right" bold>
                    {formatInr(totals.actual)}
                  </Td>
                  <td className="py-2.5 pl-3">
                    <span
                      className="tabular-nums font-black"
                      style={{ fontSize: 13, color: attainTone(totals.attainmentPct).color }}
                    >
                      {totals.attainmentPct == null ? "—" : `${totals.attainmentPct.toFixed(0)}%`}
                    </span>
                  </td>
                  {isAdmin && <td />}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <IncentivePersonDrilldown empName={drillName} year={year} onClose={() => setDrillName(null)} />

      {isAdmin && (
        <SetTargetDialog
          empName={editName}
          year={year}
          initial={editValue}
          onClose={() => setEditName(null)}
        />
      )}
    </div>
  );
}

function SetTargetDialog({
  empName,
  year,
  initial,
  onClose,
}: {
  empName: string | null;
  year: number;
  initial: number;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState(String(initial || ""));
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setValue(initial ? String(initial) : "");
  }, [initial, empName]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!empName) return;
    const amount = Number(value.replace(/[₹,\s]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) {
      fireToast({ message: "Enter a valid amount.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await setIncentiveYearTarget({ empName, year, targetAmount: amount });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Target set for ${empName}.` });
      onClose();
    });
  }

  return (
    <Dialog.Root open={empName != null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-section bg-surface-card border border-hairline p-6 shadow-lg">
          <Dialog.Title
            className="text-ink-strong mb-1"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 21 }}
          >
            Set {year} target
          </Dialog.Title>
          <Dialog.Description className="text-ink-subtle font-semibold mb-4" style={{ fontSize: 13.5 }}>
            {empName} · whole-year incentive target
          </Dialog.Description>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block font-semibold text-ink-strong mb-1.5" style={{ fontSize: 13.5 }}>
                Target amount (₹)
              </span>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 250000"
                className="w-full rounded-chip border border-hairline bg-surface-card px-3.5 h-11 text-ink-strong tabular-nums outline-none focus:border-altus-red focus:ring-2 focus:ring-altus-red/25 transition-all"
                style={{ fontSize: 15 }}
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button type="button" className="px-4 py-2.5 font-semibold text-ink-subtle" style={{ fontSize: 14 }} disabled={pending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 font-bold text-white disabled:opacity-50"
                style={{ fontSize: 14, background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Target size={15} strokeWidth={2.4} />}
                {pending ? "Saving…" : "Save target"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "slate" | "red" | "green" }) {
  return (
    <div
      className="relative bg-surface-card rounded-section overflow-hidden"
      style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 1px 3px rgba(15,23,42,0.04)", padding: "16px 18px 15px" }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{ height: 5, background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))` }}
      />
      <span
        className="uppercase font-black tracking-[0.08em] leading-none"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 12, color: `var(--color-${tone}-deep)` }}
      >
        {label}
      </span>
      <span
        className="block mt-2 leading-[0.9] tracking-[-0.035em] tabular-nums text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 2vw, 36px)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="pb-2 uppercase font-bold tracking-[0.06em] text-ink-subtle whitespace-nowrap"
      style={{ fontSize: 11, textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  bold = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  bold?: boolean;
}) {
  return (
    <td
      className={`py-2.5 tabular-nums whitespace-nowrap ${bold ? "font-black text-ink-strong" : "font-semibold text-ink-soft"}`}
      style={{ fontSize: 14, textAlign: align }}
    >
      {children}
    </td>
  );
}
