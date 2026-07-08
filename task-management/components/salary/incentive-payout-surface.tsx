"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, HandCoins, Lock } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  payIncentivesWithRun,
  recordIncentivePayout,
} from "@/app/(app)/salary/incentive-payout/actions";

/** One salary run joined to its incentive payable pool for the month. */
export interface PayoutRunRow {
  runId: string;
  employeeName: string;
  payingEntityName: string | null;
  netPayable: number;
  disbursed: boolean;
  incentiveAccrued: number;
  incentivePaid: number;
  incentiveOutstanding: number;
  sourceCount: number;
}

interface Props {
  month: string; // YYYY-MM
  monthLabel: string;
  rows: PayoutRunRow[];
  killed: boolean;
}

const inr = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function IncentivePayoutSurface({ month, monthLabel, rows, killed }: Props) {
  const router = useRouter();
  const [payingAll, startPayAll] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const totalOutstanding = rows.reduce((s, r) => s + r.incentiveOutstanding, 0);
  const anyOutstanding = totalOutstanding > 0.005;

  function onPayOne(row: PayoutRunRow) {
    if (killed) return;
    if (
      !window.confirm(
        `Pay ₹${inr(row.incentiveOutstanding)} accrued incentives to ${row.employeeName} with this ${monthLabel} run?\n\nThis stamps the incentive as paid and links it to the salary run. It is idempotent — re-running only settles what remains.`,
      )
    ) {
      return;
    }
    setBusyId(row.runId);
    void (async () => {
      const res = await recordIncentivePayout({ runId: row.runId });
      setBusyId(null);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message:
          res.paid > 0
            ? `Paid ₹${inr(res.paid)} across ${res.lines} incentive ${res.lines === 1 ? "source" : "sources"} to ${row.employeeName}.`
            : `Nothing outstanding for ${row.employeeName} — already paid.`,
      });
      router.refresh();
    })();
  }

  function onPayAll() {
    if (killed) return;
    if (
      !window.confirm(
        `Pay ALL accrued incentives (₹${inr(totalOutstanding)}) for ${monthLabel}, each linked to that person's salary run?\n\nIdempotent — people already settled are skipped.`,
      )
    ) {
      return;
    }
    startPayAll(async () => {
      const res = await payIncentivesWithRun({ month });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      const bits = [`${res.people} paid`, `₹${inr(res.paid)}`];
      if (res.failed > 0) bits.push(`${res.failed} failed`);
      fireToast({ message: `${monthLabel}: ${bits.join(" · ")}.` });
      router.refresh();
    });
  }

  return (
    <section className="wg-rise admin-panel overflow-hidden" style={{ animationDelay: "120ms" }}>
      {killed && (
        <div
          className="flex items-center gap-2 border-b px-6 py-3 text-[13px] font-semibold"
          style={{
            borderColor: "var(--color-hairline)",
            background: "color-mix(in srgb, #f59e0b 8%, transparent)",
            color: "#92400e",
          }}
        >
          <Lock size={14} strokeWidth={2.6} />
          Unified payout is OFF (INCENTIVE_PAYOUT_OFF). Buttons are disabled; incentives are paid the
          legacy manual way until the flag is cleared.
        </div>
      )}

      {/* Toolbar */}
      <div
        className="flex items-center justify-between gap-3 border-b px-6 py-4 max-md:flex-col max-md:items-stretch"
        style={{ borderColor: "var(--color-hairline)" }}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
          <Coins size={15} strokeWidth={2.4} className="text-emerald-600" />
          {rows.length} salary {rows.length === 1 ? "run" : "runs"} · ₹{inr(totalOutstanding)} accrued
          unpaid
        </div>
        <button
          type="button"
          onClick={onPayAll}
          disabled={killed || payingAll || !anyOutstanding}
          className="wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
        >
          <HandCoins size={15} strokeWidth={2.6} />
          {payingAll ? "Paying…" : "Pay incentives with all runs"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-16 text-center text-[14px] text-ink-subtle">
          No salary runs for {monthLabel}. Generate the month&apos;s runs first, then pay accrued
          incentives here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr
                className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle"
                style={{ borderBottom: "1px solid var(--color-hairline)" }}
              >
                <th className="px-6 py-3">Employee</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3 text-right">Net salary</th>
                <th className="px-4 py-3 text-right">Accrued</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-6 py-3 text-right">Payout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canPay = !killed && r.incentiveOutstanding > 0.005;
                const busy = busyId === r.runId;
                return (
                  <tr
                    key={r.runId}
                    className="tabular-nums"
                    style={{ borderBottom: "1px solid var(--color-hairline)" }}
                  >
                    <td className="px-6 py-3 font-semibold text-ink-strong">
                      {r.employeeName}
                      {r.disbursed && (
                        <span className="ml-2 rounded-pill bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          salary disbursed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{r.payingEntityName ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-ink-soft">₹{inr(r.netPayable)}</td>
                    <td className="px-4 py-3 text-right text-ink-soft">
                      {r.incentiveAccrued > 0 ? `₹${inr(r.incentiveAccrued)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-subtle">
                      {r.incentivePaid > 0 ? `₹${inr(r.incentivePaid)}` : "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-bold"
                      style={{ color: r.incentiveOutstanding > 0.005 ? "#15803d" : "var(--color-ink-subtle)" }}
                    >
                      {r.incentiveOutstanding > 0.005 ? `₹${inr(r.incentiveOutstanding)}` : "₹0"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onPayOne(r)}
                        disabled={!canPay || busy || payingAll}
                        className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
                        style={
                          canPay
                            ? { background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff" }
                            : { background: "var(--color-surface-card)", color: "var(--color-ink-subtle)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }
                        }
                      >
                        <HandCoins size={13} strokeWidth={2.6} />
                        {busy ? "Paying…" : "Pay with run"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
