"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, X, CalendarDays } from "lucide-react";
import { upsertScheduleLine, deleteScheduleLine } from "@/app/(app)/billing/actions";
import {
  BILLING_PAYMENT_TYPES,
  BILLING_PAYMENT_TYPE_LABELS,
  BILLING_TDS_RATES,
  BILLING_SCHEDULE_PRODUCT_TYPES,
  BILLING_SCHEDULE_PRODUCT_LABELS,
  milestoneStageLabel,
} from "@/db/enums";
import { inr, inrPlain } from "@/lib/billing/schedule-math";
import { formatDMonY } from "@/lib/format";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
import type { ScheduleRowView } from "@/lib/queries/billing-schedule";
import type { ScheduleTotals } from "@/lib/billing/schedule-math";
import { DateField } from "@/components/ui/date-field";

/**
 * PAYMENT SCHEDULE — the invoice-able lines of a proposal, sitting directly
 * under Milestones on the proposal's own page.
 *
 * Each line: Type · the milestone/advance stage it settles · Description ·
 * Notes · Amount + GST · Tentative Date · Actual Date · Receipt Amount ·
 * Receipt Date · TDS. Balance is DERIVED (amount + GST − receipt − TDS) and
 * never stored, so it cannot go stale behind an edit.
 *
 * Scope is exactly the requirement sheet: the fields above and nothing more.
 */

const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";
const GREEN = "#15803D";
const RED = "var(--color-altus-red)";

const TYPE_TONE: Record<string, string> = {
  advance: "#B45309",
  milestone: PURPLE,
  final_balance: "#0F766E",
  other: "#64748B",
};

/** GST is not selectable — every line is billed at this rate. */
const FIXED_GST_RATE = 18;

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#9333ea]/50";

// Hides the native up/down stepper on a number input. `type="number"` is kept
// rather than swapped for text, so the field still validates as numeric and
// still raises the numeric keypad on mobile — only the arrows go.
const noSpinner =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

type Draft = {
  id?: string;
  milestoneId: string;
  paymentType: string;
  productType: string;
  description: string;
  notes: string;
  amount: string;
  gstRate: number;
  tentativeDate: string;
  actualDate: string;
  receiptAmount: string;
  receiptDate: string;
  tdsRate: number;
};

const blank = (): Draft => ({
  milestoneId: "",
  paymentType: "milestone",
  productType: "",
  description: "",
  notes: "",
  amount: "",
  gstRate: FIXED_GST_RATE,
  tentativeDate: "",
  actualDate: "",
  receiptAmount: "",
  receiptDate: "",
  tdsRate: BILLING_TDS_RATES[0],
});

export function PaymentSchedule({
  proposalId,
  rows,
  totals,
  milestones,
}: {
  proposalId: string;
  rows: ScheduleRowView[];
  totals: ScheduleTotals;
  milestones: { id: string; stage: string; title: string | null; amount: number | null }[];
}) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function openCreate(preset?: Partial<Draft>) {
    setError(null);
    setDraft({ ...blank(), ...preset });
  }

  function openEdit(r: ScheduleRowView) {
    setError(null);
    setDraft({
      id: r.id,
      milestoneId: r.milestoneId ?? "",
      paymentType: r.paymentType,
      productType: r.productType ?? "",
      description: r.description ?? "",
      notes: r.notes ?? "",
      amount: String(r.totals.base),
      gstRate: FIXED_GST_RATE,
      tentativeDate: r.tentativeDate ?? "",
      actualDate: r.actualDate ?? "",
      receiptAmount: r.totals.received ? String(r.totals.received) : "",
      receiptDate: r.receiptDate ?? "",
      tdsRate: r.tdsRate,
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertScheduleLine({
        ...(draft.id ? { id: draft.id } : {}),
        proposalId,
        milestoneId: draft.milestoneId || null,
        paymentType: draft.paymentType,
        productType: draft.productType || null,
        description: draft.description || null,
        notes: draft.notes || null,
        amount: Number(draft.amount || 0),
        gstRate: FIXED_GST_RATE,
        tentativeDate: draft.tentativeDate || null,
        actualDate: draft.actualDate || null,
        // Blank stays null — "nothing received" must not become "₹0 received".
        receiptAmount: draft.receiptAmount.trim() === "" ? null : Number(draft.receiptAmount),
        receiptDate: draft.receiptDate || null,
        tdsRate: draft.tdsRate,
      });
      if (res.ok) setDraft(null);
      else setError(res.error);
    });
  }

  function remove(r: ScheduleRowView) {
    if (!confirm("Delete this payment schedule line?")) return;
    startTransition(async () => {
      const res = await deleteScheduleLine(r.id);
      if (!res.ok) alert(res.error);
    });
  }


  return (
    <section
      className="mt-6 rounded-[22px] bg-surface-card p-6 max-md:p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label="Payment Schedule"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-extrabold tracking-tight text-ink-strong">Payment Schedule</h2>
          <p className="text-[12.5px] text-ink-subtle">
            Invoice-able lines against this proposal&apos;s milestones — amount + GST, receipts, TDS and the balance due.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openCreate()}
            className="wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
          >
            <Plus size={15} strokeWidth={2.8} /> Add Payment Line
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-strong py-12 text-center">
          <p className="text-[14.5px] font-bold text-ink-strong">No payment lines yet</p>
          <p className="mt-1 text-[13px] text-ink-subtle">
            Add a line per milestone to track invoicing and receipts.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <table className="w-full min-w-[1280px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">Stage</th>
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3">Tentative</th>
                <th className="px-3 py-3">Actual</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-right">GST</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">Receipt</th>
                <th className="px-3 py-3">Receipt date</th>
                <th className="px-3 py-3 text-right">TDS</th>
                <th className="px-3 py-3 text-right">Balance</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                  <tr key={r.id} className="border-t border-hairline align-top">
                    <td className="px-3 py-3">
                      <Pill label={BILLING_PAYMENT_TYPE_LABELS[r.paymentType] ?? r.paymentType} tone={TYPE_TONE[r.paymentType] ?? "#64748B"} />
                    </td>
                    <td className="px-3 py-3">
                      {r.productType ? (
                        <Pill
                          label={BILLING_SCHEDULE_PRODUCT_LABELS[r.productType as keyof typeof BILLING_SCHEDULE_PRODUCT_LABELS] ?? r.productType}
                          tone="#0F766E"
                        />
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.milestoneStage ? <Pill label={r.milestoneStage} tone={PURPLE} /> : <span className="text-ink-subtle">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-ink-strong">{r.description ?? "—"}</div>
                      {r.notes && <div className="text-[11px] text-ink-subtle">{r.notes}</div>}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {r.tentativeDate ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={11} className="text-ink-subtle" />
                          {formatDMonY(r.tentativeDate)}
                        </span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.actualDate ? formatDMonY(r.actualDate) : <span className="text-ink-subtle">—</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{inr(r.totals.base)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-subtle">
                      {inr(r.totals.gst)}
                      <div className="text-[10px]">{r.gstRate}%</div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-ink-strong">{inr(r.totals.gross)}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: r.totals.received > 0 ? GREEN : undefined }}>
                      {r.totals.received > 0 ? inr(r.totals.received) : <span className="text-ink-subtle">—</span>}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.receiptDate ? formatDMonY(r.receiptDate) : <span className="text-ink-subtle">—</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-subtle">
                      {r.totals.tds > 0 ? (
                        <>
                          {inr(r.totals.tds)}
                          <div className="text-[10px]">{r.tdsRate}%</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className="px-3 py-3 text-right font-extrabold tabular-nums"
                      style={{ color: r.totals.isSettled ? GREEN : r.totals.balance > 0 ? RED : undefined }}
                    >
                      {r.totals.isSettled ? "Settled" : inr(r.totals.balance)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => openEdit(r)} aria-label="Edit line" className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => remove(r)} aria-label="Delete line" className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-hairline-strong bg-black/[0.02]">
                <td colSpan={8} className="px-3 py-3 text-right text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                  Totals
                </td>
                <td className="px-3 py-3 text-right font-extrabold tabular-nums text-ink-strong">{inr(totals.gross)}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: GREEN }}>{inr(totals.received)}</td>
                <td />
                <td className="px-3 py-3 text-right tabular-nums text-ink-subtle">{inr(totals.tds)}</td>
                <td className="px-3 py-3 text-right font-extrabold tabular-nums" style={{ color: totals.balance > 0 ? RED : GREEN }}>
                  {inr(totals.balance)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {draft && (
        <Dialog
          draft={draft}
          setDraft={setDraft}
          milestones={milestones}
          onSubmit={save}
          onClose={() => setDraft(null)}
          pending={pending}
          error={error}
        />
      )}
    </section>
  );
}

function Dialog({
  draft,
  setDraft,
  milestones,
  onSubmit,
  onClose,
  pending,
  error,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  milestones: { id: string; stage: string; title: string | null; amount: number | null }[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}) {
  const base = Number(draft.amount || 0);
  const gstAmount = (base * draft.gstRate) / 100;
  const gross = base + gstAmount;
  // TDS on the pre-GST base — see tdsPaise in lib/billing/schedule-math.ts.
  const tdsAmount = (base * draft.tdsRate) / 100;
  const settled = Number(draft.receiptAmount || 0) + tdsAmount;
  const balance = Math.max(0, gross - settled);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm max-md:p-3">
      <div role="dialog" aria-modal="true" aria-label="Payment line" className="my-8 w-full max-w-[720px] rounded-[22px] bg-surface-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <h2 className="text-[19px] font-extrabold tracking-tight text-ink-strong">
              {draft.id ? "Edit payment line" : "Add payment line"}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-subtle">Balance is calculated — amount + GST − receipt − TDS.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={onSubmit} className="px-6 py-5">
          {error && (
            <p role="alert" className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: RED }}>
              {error}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Type" required>
              <select className={inputCls} value={draft.paymentType} onChange={(e) => setDraft({ ...draft, paymentType: e.target.value })}>
                {BILLING_PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{BILLING_PAYMENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="Product Type">
              <select
                className={inputCls}
                value={draft.productType}
                onChange={(e) => setDraft({ ...draft, productType: e.target.value })}
              >
                <option value="">— none —</option>
                {BILLING_SCHEDULE_PRODUCT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {BILLING_SCHEDULE_PRODUCT_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Milestone / stage" hint="Which stage this payment settles.">
              <select className={inputCls} value={draft.milestoneId} onChange={(e) => setDraft({ ...draft, milestoneId: e.target.value })}>
                <option value="">— none —</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {milestoneStageLabel(m.stage)}
                    {m.title ? ` — ${m.title}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {/* GST is fixed at 18% — shown, not chosen, so the rate is visible
                on the line without offering a selection that does nothing. */}
            <Field label="GST">
              <input className={`${inputCls} cursor-not-allowed opacity-70`} value={`${FIXED_GST_RATE}%`} readOnly />
            </Field>

            <div className="md:col-span-2">
              <Field label="Description">
                <input className={inputCls} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
            </div>
            {/* Placeholder rather than a literal "0" value: an empty field that
                LOOKS like 0 still lets you type "150000" and get 150000, where a
                real 0 in the value would leave you with "0150000" unless you
                cleared it first. Same ₹ treatment as Balance payment. */}
            <Field label="Amount (pre-GST)" required>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  className={`${inputCls} ${noSpinner} pr-9`}
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  required
                />
                <span
                  aria-label="rupees"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-subtle"
                >
                  ₹
                </span>
              </div>
            </Field>

            <Field label="Tentative date">
              <DateField className={inputCls} value={draft.tentativeDate} onChange={(e) => setDraft({ ...draft, tentativeDate: e.target.value })} />
            </Field>
            <Field label="Actual date">
              <DateField className={inputCls} value={draft.actualDate} onChange={(e) => setDraft({ ...draft, actualDate: e.target.value })} />
            </Field>
            <Field label="Receipt date">
              <DateField className={inputCls} value={draft.receiptDate} onChange={(e) => setDraft({ ...draft, receiptDate: e.target.value })} />
            </Field>

            <Field label="Receipt amount">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${inputCls} ${noSpinner} pr-9`}
                  value={draft.receiptAmount}
                  onChange={(e) => setDraft({ ...draft, receiptAmount: e.target.value })}
                />
                <span
                  aria-label="rupees"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-subtle"
                >
                  ₹
                </span>
              </div>
            </Field>
            {/* Same slot, same styling as before — a select rather than a free
                number, because TDS is withheld at statutory rates. No hint
                beneath it, matching the GST select. */}
            <Field label="TDS">
              <select className={inputCls} value={draft.tdsRate} onChange={(e) => setDraft({ ...draft, tdsRate: Number(e.target.value) })}>
                {/* A line saved before the options narrowed may hold 0% or 3%.
                    Its own rate is listed (disabled) so opening the row does not
                    silently rewrite its TDS to the first option on save. */}
                {!(BILLING_TDS_RATES as readonly number[]).includes(draft.tdsRate) && (
                  <option value={draft.tdsRate} disabled>
                    {draft.tdsRate}% (existing)
                  </option>
                )}
                {BILLING_TDS_RATES.map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </Field>
            {/* Read-only: the value is derived from amount + GST − receipt − TDS.
                The currency is a static ₹ pinned inside the right edge; `pr-9`
                reserves the space so a long balance can never run underneath it,
                and the span is pointer-events-none so clicking it still targets
                the field. */}
            <Field label="Balance payment">
              <div className="relative">
                <input
                  className={`${inputCls} cursor-not-allowed pr-9 opacity-70`}
                  value={inrPlain(balance)}
                  readOnly
                  aria-describedby="balance-currency-hint"
                />
                <span
                  id="balance-currency-hint"
                  aria-label="rupees"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-subtle"
                >
                  ₹
                </span>
              </div>
            </Field>

            {/* Notes with dictation. The transcript is APPENDED to whatever is
                already typed rather than replacing it, so a voice note can be
                added to written notes (and to a second voice note) without
                losing either. Reuses the app's existing VoiceNoteButton, so
                mic permissions, the recording UI and the Whisper endpoint are
                identical to Tasks and Goals. */}
            <div className="md:col-span-3">
              <label className="block">
                <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                  Notes
                </span>
                {/* The mic sits INSIDE the textarea, bottom-right. `pb-12`
                    reserves a band of empty space above it, so typed text wraps
                    before reaching the button instead of running underneath it.
                    `resize-none` is deliberate: the browser's resize grip lives
                    in exactly this corner and would sit on top of the button. */}
                <div className="relative">
                  <textarea
                    rows={3}
                    className={`${inputCls} resize-none pb-12`}
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                  <span className="absolute bottom-2 right-2">
                    <VoiceNoteButton
                      label="Dictate with Voice"
                      onText={(t) =>
                        setDraft({ ...draft, notes: (draft.notes ? draft.notes.trimEnd() + " " : "") + t })
                      }
                    />
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-ink-subtle tabular-nums">
              {inr(base)} + {inr(gstAmount)} GST = <span className="text-ink-strong">{inr(gross)}</span> · Balance{" "}
              {inr(balance)}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="wg-btn rounded-pill px-4 py-2.5 text-[13.5px] font-bold" style={{ background: "var(--color-surface-card)", color: "var(--color-ink-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
                Cancel
              </button>
              <button type="submit" disabled={pending} className="wg-btn rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}>
                {pending ? "Saving…" : draft.id ? "Save changes" : "Add line"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Pill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold whitespace-nowrap" style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}>
      {label}
    </span>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {label} {required && <span style={{ color: RED }}>*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-subtle">{hint}</span>}
    </label>
  );
}
