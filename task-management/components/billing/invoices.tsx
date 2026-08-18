"use client";

import * as React from "react";
import { Plus, X, FileText, Download, Mail, MessageCircle, Table2, Receipt, Trash2 } from "lucide-react";
import { createInvoice, issueTaxInvoice, deleteInvoice, exportInvoicesCsv, lookupGstin } from "@/app/(app)/billing/invoice-actions";
import type { GstinLookup } from "@/app/(app)/billing/invoice-actions";
import { gstSplit, amountInWords, nextInvoiceDate, financialYearLabel } from "@/lib/billing/invoice-math";
import { formatDMonY } from "@/lib/format";
import type { InvoiceListRow, InvoiceDetail, InvoiceOptions } from "@/lib/queries/billing-invoices";
import { DateField } from "@/components/ui/date-field";

/**
 * BILLING › INVOICES — Proforma and Tax invoices over the existing invoice
 * tables. Clients come from the Address Book (mirrored into billing_customers),
 * entity/bank/PAN from the issuer record, Code and Description from the
 * admin-managed lists. Nothing here is hard-coded.
 */

const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";
const TEAL = "#0F766E";

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#9333ea]/50";
/** Auto-filled from the Address Book — shown, not typed. */
const readOnlyCls = `${inputCls} cursor-default bg-black/[0.035] text-ink-soft focus:ring-0`;
const noSpinner =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const inr = (v: string | number | null | undefined) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const today = () => new Date().toISOString().slice(0, 10);

/** Comparable form of a GSTIN — case and stray spaces must not decide a match. */
const normGstin = (s?: string | null) => (s ?? "").replace(/\s+/g, "").toUpperCase();
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

const LOOKUP_TIMEOUT = "gstin-lookup-timeout";
const LOOKUP_TIMEOUT_MS = 15_000;

/** A resolved-but-unsuccessful lookup, so the UI always leaves the loading state. */
function failedLookup(gstin: string, note: string): GstinLookup {
  const g = normGstin(gstin);
  return {
    valid: false,
    gstin: g,
    stateCode: g.slice(0, 2),
    stateName: null,
    pan: g.slice(2, 12),
    name: null,
    source: null,
    customerId: null,
    kindAttn: null,
    address: null,
    contactNo: null,
    provider: null,
    status: null,
    note,
    unconfigured: false,
  };
}

export function Invoices({
  rows,
  options,
  preview,
}: {
  rows: InvoiceListRow[];
  options: InvoiceOptions;
  preview: InvoiceDetail | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = rows.length > 0 && selected.length === rows.length;

  function exportTally() {
    startTransition(async () => {
      const res = await exportInvoicesCsv(selected);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tally-invoices-${today()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function issue(id: string) {
    startTransition(async () => {
      const res = await issueTaxInvoice(id);
      if (!res.ok) setError(res.error);
      else alert(`Tax Invoice ${res.invoiceNo} issued.`);
    });
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red)" }}
        >
          {error}
        </p>
      )}

      {/* Actions — enabled once one or more invoices are selected. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ActionBtn icon={<Mail size={14} />} label="Email" disabled={!selected.length || pending} onClick={() => setError("Email sending is not wired to a provider yet.")} />
          <ActionBtn icon={<MessageCircle size={14} />} label="WhatsApp" disabled={!selected.length || pending} onClick={() => setError("WhatsApp is not configured — META_WHATSAPP_ACCESS_TOKEN and PHONE_NUMBER_ID are empty.")} />
          <ActionBtn icon={<Download size={14} />} label="Download" disabled={!selected.length || pending} onClick={() => window.print()} />
          <ActionBtn icon={<Table2 size={14} />} label="Export for Tally" disabled={!selected.length || pending} onClick={exportTally} />
          {selected.length > 0 && (
            <span className="text-[12.5px] font-semibold text-ink-subtle">{selected.length} selected</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className="wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
        >
          <Plus size={16} strokeWidth={2.6} /> New Invoice
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[22px] bg-surface-card p-14 text-center" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <Receipt size={26} className="mx-auto text-ink-subtle" />
          <p className="mt-3 text-[15px] font-bold text-ink-strong">No invoices yet</p>
          <p className="mt-1 text-[13.5px] text-ink-subtle">Raise a Proforma, then issue it as a Tax Invoice.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[22px] bg-surface-card" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <table className="w-full min-w-[980px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all invoices"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                  />
                </th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Invoice No.</th>
                <th className="px-3 py-3">Code</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Client</th>
                <th className="px-3 py-3">Tax</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.invoiceNo}`}
                      checked={selected.includes(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Pill
                      label={r.docType === "tax" ? "Tax Invoice" : "Proforma"}
                      tone={r.docType === "tax" ? TEAL : "#B45309"}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <a href={`?preview=${r.id}`} className="font-bold tabular-nums hover:underline" style={{ color: PURPLE }}>
                      {r.invoiceNo}
                    </a>
                  </td>
                  <td className="px-3 py-3 font-semibold">{r.code}</td>
                  <td className="px-3 py-3 tabular-nums">{formatDMonY(r.invoiceDate)}</td>
                  <td className="px-3 py-3">{r.customerName ?? "—"}</td>
                  <td className="px-3 py-3">
                    <Pill label={r.taxMode === "igst" ? "IGST" : "CGST+SGST"} tone={PURPLE} />
                  </td>
                  <td className="px-3 py-3 text-right font-extrabold tabular-nums">{inr(r.total)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1.5">
                      {r.docType === "proforma" && r.status !== "converted" && (
                        <button
                          type="button"
                          onClick={() => issue(r.id)}
                          disabled={pending}
                          className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[12px] font-bold"
                          style={{ background: `color-mix(in srgb, ${TEAL} 12%, transparent)`, color: TEAL }}
                        >
                          <FileText size={12} strokeWidth={2.6} /> Issue Tax Invoice
                        </button>
                      )}
                      {r.status === "converted" && <span className="text-[11.5px] text-ink-subtle">converted</span>}
                      <button
                        type="button"
                        aria-label={`Delete ${r.invoiceNo}`}
                        onClick={() =>
                          confirm(`Delete ${r.invoiceNo}?`) &&
                          startTransition(async () => {
                            const res = await deleteInvoice(r.id);
                            if (!res.ok) setError(res.error);
                          })
                        }
                        className="rounded-lg p-1.5 text-ink-subtle hover:bg-black/5 hover:text-ink-strong"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && <InvoiceDocument detail={preview} />}
      {open && <CreateDialog options={options} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The printable invoice document. */
function InvoiceDocument({ detail }: { detail: InvoiceDetail }) {
  const { invoice: v, lines } = detail;
  const isTax = v.docType === "tax";
  const isIntra = v.taxMode !== "igst";

  return (
    <section
      className="mt-6 rounded-[22px] bg-white p-8 text-[13px] text-ink-strong max-md:p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label="Invoice document"
    >
      <header className="mb-5 flex items-start justify-between gap-6 border-b border-hairline pb-4">
        <div>
          <div className="text-[19px] font-extrabold">{v.entityName ?? "—"}</div>
          {v.entityAddress && <div className="mt-0.5 max-w-[46ch] text-[12px] text-ink-soft">{v.entityAddress}</div>}
          <div className="mt-1 flex flex-wrap gap-x-4 text-[12px]">
            <span><b>PAN:</b> {v.entityPan ?? "—"}</span>
            <span><b>GSTIN:</b> {v.entityGstin ?? "—"}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[17px] font-extrabold uppercase tracking-[0.08em]" style={{ color: isTax ? TEAL : "#B45309" }}>
            {isTax ? "Tax Invoice" : "Proforma Invoice"}
          </div>
        </div>
      </header>

      {/*
        Client / invoice details in the prescribed order:
        GSTIN → To → Kind Attn. → Address → Contact No. → Code → Invoice No. → Invoice Date.
        Single column so the printed sequence is unambiguous.
      */}
      <div className="mb-5">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Bill To</div>
        <dl className="mt-1.5 text-[12.5px]">
          <DocRow k="GSTIN" v={v.customerGstin} />
          <DocRow k="To" v={v.customerName} strong />
          <DocRow k="Kind Attn." v={v.kindAttn} />
          <DocRow k="Address" v={v.billingAddress} />
          <DocRow k="Contact No." v={v.contactNo} />
          <DocRow k="Code" v={v.code} />
          <DocRow k="Invoice No." v={v.invoiceNo} />
          <DocRow k="Invoice Date" v={formatDMonY(v.invoiceDate)} />
        </dl>
      </div>

      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-hairline-strong text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-2">SAC Code</th>
            <th className="py-2 pr-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-hairline">
              <td className="py-2 pr-2 tabular-nums">{i + 1}</td>
              <td className="py-2 pr-2">{l.description}</td>
              <td className="py-2 pr-2 tabular-nums">{l.sacCode ?? "—"}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{inr(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="py-1.5 pr-2 text-right font-semibold">Subtotal</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{inr(v.subtotal)}</td>
          </tr>
          {/* Exactly one tax presentation — never both. */}
          {isIntra ? (
            <>
              <tr>
                <td colSpan={3} className="py-1.5 pr-2 text-right">CGST @ {Number(v.cgstRate ?? 0)}%</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{inr(v.cgstAmount)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="py-1.5 pr-2 text-right">SGST @ {Number(v.sgstRate ?? 0)}%</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{inr(v.sgstAmount)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td colSpan={3} className="py-1.5 pr-2 text-right">IGST @ {Number(v.igstRate ?? 0)}%</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{inr(v.igstAmount)}</td>
            </tr>
          )}
          <tr className="border-t border-hairline-strong">
            <td colSpan={3} className="py-2 pr-2 text-right text-[14px] font-extrabold">Total Amount Payable</td>
            <td className="py-2 pr-2 text-right text-[14px] font-extrabold tabular-nums">{inr(v.total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-3 text-[12.5px]">
        <b>Amount in Words:</b> {v.amountInWords ?? "—"}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Bank Details</div>
          <div className="mt-1 text-[12.5px] leading-relaxed">
            <div><b>Bank:</b> {v.bankName ?? "—"}</div>
            <div><b>A/c No.:</b> {v.bankAccountNo ?? "—"}</div>
            <div><b>IFSC:</b> {v.bankIfsc ?? "—"}</div>
            <div><b>Branch:</b> {v.bankBranch ?? "—"}</div>
          </div>
          {v.interestTerms && <p className="mt-3 max-w-[52ch] text-[11.5px] text-ink-soft">{v.interestTerms}</p>}
          {v.tdsNote && <p className="mt-1 max-w-[52ch] text-[11.5px] text-ink-soft">{v.tdsNote}</p>}
        </div>
        <div className="flex flex-col items-end justify-end">
          <div className="mt-10 border-t border-hairline-strong pt-2 text-[12.5px] font-semibold">
            {v.signatureLabel ?? "Authorised Signatory"}
          </div>
        </div>
      </div>
    </section>
  );
}

/** One labelled line of the invoice's client/invoice details block. */
function DocRow({ k, v, strong }: { k: string; v?: string | null; strong?: boolean }) {
  return (
    <div className="flex gap-2 py-[1px]">
      <dt className="w-[92px] shrink-0 font-bold">{k}:</dt>
      <dd className={`max-w-[62ch] ${strong ? "font-bold" : ""}`}>{v || "—"}</dd>
    </div>
  );
}

function CreateDialog({ options, onClose }: { options: InvoiceOptions; onClose: () => void }) {
  const [pending, startTransition] = React.useTransition();
  const [looking, startLookup] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  /** What the GST registry (and, secondarily, the Address Book) returned. */
  const [fetched, setFetched] = React.useState<GstinLookup | null>(null);
  const latestGstin = React.useRef("");
  const [f, setF] = React.useState({
    docType: "proforma" as "proforma" | "tax",
    customerId: "",
    clientName: "",
    entityId: options.issuers[0]?.id ?? "",
    code: options.codes[0]?.key ?? "WMS",
    // Invoice date snaps to the next 3rd / 12th / 21st / 30th.
    invoiceDate: nextInvoiceDate(today()),
    description: "",
    sacCode: "",
    amount: "",
    gstRate: 18,
    gstin: "",
    // Seeded by the GSTIN lookup / client match, then freely editable.
    kindAttn: "",
    address: "",
    contactNo: "",
  });

  const client = options.customers.find((c) => c.id === f.customerId);
  const g = gstSplit(client?.gstin, Number(f.amount || 0), f.gstRate);

  /**
   * The GSTIN in the box decides whose details are displayed. Once it names a
   * different company than the selected client, that client's name, address and
   * contact must stop showing — a stale one here would print the wrong party on
   * the invoice.
   */
  const shown =
    !normGstin(f.gstin) || normGstin(client?.gstin) === normGstin(f.gstin) ? client : undefined;
  const shownAddress = shown
    ? [shown.address, shown.city, shown.state, shown.pincode].filter(Boolean).join(", ")
    : "";

  /**
   * GSTIN identifies the company. Typing one that belongs to an Address Book
   * client selects that client, which is what fills To / Kind Attn. / Address /
   * Contact No. below — the operator never re-keys them.
   */
  const typed = normGstin(f.gstin);
  const gstinMatch = typed
    ? options.customers.find((c) => normGstin(c.gstin) !== "" && normGstin(c.gstin) === typed)
    : undefined;

  /** One line under the GSTIN box that always says what just happened. */
  const gstinHint = (() => {
    if (!typed) return "Enter a GSTIN to fetch the company automatically.";
    if (gstinMatch) return `Matched ${gstinMatch.name} — details filled from the Address Book.`;
    if (looking || typed.length === 15) {
      if (looking || !fetched) return "Looking up this GSTIN…";
    } else {
      return "Enter the full 15-character GSTIN.";
    }
    if (!fetched) return "Looking up this GSTIN…";
    const where = fetched.stateName ? ` · ${fetched.stateName}` : "";
    if (fetched.name) {
      const via =
        fetched.source === "registry"
          ? `the GST registry${fetched.provider ? ` (${fetched.provider})` : ""}`
          : fetched.source === "past-invoice"
            ? "a previous invoice for this GSTIN"
            : "the Address Book";
      return `Fetched from ${via}${where}${fetched.status ? ` · ${fetched.status}` : ""} · PAN ${fetched.pan}`;
    }
    // No name yet. The GSTIN itself is never called invalid here — a missing
    // API key is a configuration gap, and the note says exactly which one.
    return `GSTIN accepted${where} · PAN ${fetched.pan}. ${fetched.note ?? ""}`.trim();
  })();

  function onGstin(raw: string) {
    const gstin = raw.toUpperCase();
    const hit = options.customers.find(
      (c) => normGstin(c.gstin) !== "" && normGstin(c.gstin) === normGstin(gstin),
    );
    setF((p) => ({
      ...p,
      gstin,
      customerId: hit ? hit.id : p.customerId,
      clientName: hit ? hit.name : p.clientName,
      ...(hit
        ? {
            kindAttn: hit.kindAttn ?? "",
            address: [hit.address, hit.city, hit.state, hit.pincode].filter(Boolean).join(", "),
            contactNo: hit.contactNo ?? "",
          }
        : null),
    }));

    // A client already loaded in the form needs no lookup — its name IS the
    // registered one. Otherwise ask the server, which checks the Address Book
    // and then the GST registry. Guarded by a ref so a slow reply for an
    // earlier keystroke cannot overwrite a newer one.
    // Every full-length GSTIN is looked up, whether or not we hold the company
    // locally — the registry is the source, the Address Book only enriches.
    // A ref guards against a slow reply for an earlier keystroke landing late.
    latestGstin.current = normGstin(gstin);
    if (normGstin(gstin).length < 15) {
      setFetched(null);
      return;
    }
    startLookup(async () => {
      try {
        // Bounded on the client as well as the server: a request that never
        // comes back must surface as a timeout, not leave the field pinned on
        // "Looking up…" forever.
        const res = await Promise.race([
          lookupGstin(gstin),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(LOOKUP_TIMEOUT)), LOOKUP_TIMEOUT_MS),
          ),
        ]);
        if (latestGstin.current !== normGstin(gstin)) return;
        setFetched(res);
        setF((p) => ({
          ...p,
          customerId: res.customerId ?? p.customerId,
          // Fill the name only when the operator has not typed one themselves.
          clientName: p.clientName.trim() ? p.clientName : (res.name ?? ""),
          // Same rule for the contact block — anything already typed is kept,
          // so a lookup never wipes out what the operator entered by hand.
          kindAttn: p.kindAttn.trim() ? p.kindAttn : (res.kindAttn ?? ""),
          address: p.address.trim() ? p.address : (res.address ?? ""),
          contactNo: p.contactNo.trim() ? p.contactNo : (res.contactNo ?? ""),
        }));
      } catch (e) {
        // A rejected action used to leave `fetched` null, which read as a
        // permanent "Looking up…". Every failure now lands in a visible state.
        if (latestGstin.current !== normGstin(gstin)) return;
        const message = (e as Error)?.message;
        setFetched(
          failedLookup(
            gstin,
            message === LOOKUP_TIMEOUT
              ? `GST lookup timed out after ${LOOKUP_TIMEOUT_MS / 1000}s. Check the connection and try again.`
              : `GST lookup failed: ${message || "unknown error"}. Try again.`,
          ),
        );
      }
    });
  }

  /**
   * Typing a name that exactly matches an Address Book client links the invoice
   * to that record and fills its GSTIN; any other name is billed as typed, with
   * no client record required.
   */
  function onClientName(name: string) {
    const c = options.customers.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (c) {
      latestGstin.current = normGstin(c.gstin);
      setFetched(null);
      setF((p) => ({
        ...p,
        clientName: name,
        customerId: c.id,
        gstin: c.gstin ?? p.gstin,
        kindAttn: c.kindAttn ?? "",
        address: [c.address, c.city, c.state, c.pincode].filter(Boolean).join(", "),
        contactNo: c.contactNo ?? "",
      }));
    } else {
      setF((p) => ({ ...p, clientName: name, customerId: "" }));
    }
  }

  /**
   * The number createInvoice will assign, derived the same way it derives it:
   * the live sequence for this code + type + financial year, or the code's own
   * series start when that year has none yet.
   */
  const nextInvoiceNo = (() => {
    const fy = financialYearLabel(f.invoiceDate);
    const seqRow = options.sequences.find(
      (s) => s.code === f.code && s.docType === f.docType && s.fy === fy,
    );
    const codeRow = options.codes.find((c) => c.key === f.code);
    const start = (f.docType === "tax" ? codeRow?.taxCode : codeRow?.proformaCode) ?? 1;
    return `${seqRow ? seqRow.nextSeq : start}/${fy}`;
  })();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createInvoice({
        docType: f.docType,
        customerId: f.customerId,
        customerName: f.clientName.trim() || shown?.name || fetched?.name || "",
        customerGstin: normGstin(f.gstin) || null,
        kindAttn: f.kindAttn.trim() || null,
        billingAddress: f.address.trim() || null,
        contactNo: f.contactNo.trim() || null,
        customerState: fetched?.stateName ?? null,
        customerStateCode: fetched?.stateCode || null,
        entityId: f.entityId || null,
        code: f.code,
        invoiceDate: f.invoiceDate,
        description: f.description,
        sacCode: f.sacCode || null,
        amount: Number(f.amount || 0),
        gstRate: f.gstRate,
      });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm max-md:p-3">
      <div role="dialog" aria-modal="true" aria-label="New invoice" className="my-8 w-full max-w-[760px] rounded-[22px] bg-surface-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <h2 className="text-[19px] font-extrabold tracking-tight text-ink-strong">New invoice</h2>
            <p className="mt-0.5 text-[13px] text-ink-subtle">Client details, GST and totals fill in automatically.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-subtle hover:bg-black/5 hover:text-ink-strong">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit} className="px-6 py-5">
          {error && (
            <p role="alert" className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red)" }}>
              {error}
            </p>
          )}

          {/*
            Client / invoice details, in the prescribed order:
            GSTIN → To → Kind Attn. → Address → Contact No. → Code → Invoice No. → Invoice Date.
            Everything between GSTIN and Contact No. is filled from the Address
            Book, so it is displayed read-only rather than re-typed.
          */}
          <fieldset className="rounded-xl p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
            <legend className="px-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
              Client / Invoice Details
            </legend>
            <div className="grid gap-4 md:grid-cols-3">
              <F
                label="GSTIN"
                hint={gstinHint}
              >
                <input
                  className={inputCls}
                  value={f.gstin}
                  maxLength={15}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="27AAAAA0000A1Z5"
                  onChange={(e) => onGstin(e.target.value)}
                />
              </F>
              <F label="To">
                <input className={readOnlyCls} readOnly value={shown?.name ?? fetched?.name ?? ""} placeholder="—" />
              </F>
              {/*
                Auto-filled from the lookup, but typeable: the registry returns
                a company name without a contact person, so these must stay
                editable or an invoice for a new company cannot be completed.
              */}
              <F label="Kind Attn.">
                <input
                  className={inputCls}
                  value={f.kindAttn}
                  autoComplete="off"
                  placeholder="—"
                  onChange={(e) => setF({ ...f, kindAttn: e.target.value })}
                />
              </F>
              <div className="md:col-span-3">
                <F label="Address">
                  <input
                    className={inputCls}
                    value={f.address}
                    autoComplete="off"
                    placeholder="—"
                    onChange={(e) => setF({ ...f, address: e.target.value })}
                  />
                </F>
              </div>
              <F label="Contact No.">
                <input
                  className={inputCls}
                  value={f.contactNo}
                  autoComplete="off"
                  inputMode="tel"
                  placeholder="—"
                  onChange={(e) => setF({ ...f, contactNo: e.target.value })}
                />
              </F>
              <F label="Code" required>
                <select className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })}>
                  {options.codes.map((c) => (
                    <option key={c.id} value={c.key}>{c.key}</option>
                  ))}
                </select>
              </F>
              <F label="Invoice No." hint="Assigned on create.">
                <input className={readOnlyCls} readOnly value={nextInvoiceNo} />
              </F>
              <F label="Invoice Date" hint="Snaps to the next 3rd / 12th / 21st / 30th.">
                <DateField className={inputCls} value={f.invoiceDate} onChange={(e) => setF({ ...f, invoiceDate: nextInvoiceDate(e.target.value) })} />
              </F>
            </div>
          </fieldset>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <F label="Invoice Type" required>
              <select className={inputCls} value={f.docType} onChange={(e) => setF({ ...f, docType: e.target.value as "proforma" | "tax" })}>
                <option value="proforma">Proforma Invoice</option>
                <option value="tax">Tax Invoice</option>
              </select>
            </F>
            <F label="Client Name" required>
              {/*
                A plain text field — an invoice must be raisable for a company
                that is not in the Address Book. Typing a name that happens to
                match a client links the invoice to that record; anything else
                is billed under the name exactly as typed.
              */}
              <input
                className={inputCls}
                value={f.clientName}
                autoComplete="off"
                placeholder="Type the client / company name"
                onChange={(e) => onClientName(e.target.value)}
                required
              />
            </F>
            <F label="Entity">
              <select className={inputCls} value={f.entityId} onChange={(e) => setF({ ...f, entityId: e.target.value })}>
                {options.issuers.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </F>

            <F label="SAC Code">
              <select className={inputCls} value={f.sacCode} onChange={(e) => setF({ ...f, sacCode: e.target.value })}>
                <option value="">— none —</option>
                {options.sacCodes.map((s) => (
                  <option key={s.id} value={s.code}>
                    {s.code}
                  </option>
                ))}
              </select>
            </F>

            <div className="md:col-span-2">
              <F label="Description" required>
                <select className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required>
                  <option value="">Select a description…</option>
                  {options.services.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </F>
            </div>
            <F label="Amount (pre-GST)" required>
              <input type="number" min="0" step="0.01" placeholder="0" className={`${inputCls} ${noSpinner}`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
            </F>
          </div>

          {/* Tax read-out, straight from the Address Book record. */}
          {(client || fetched?.valid || Number(f.amount) > 0) && (
            <div className="mt-4 rounded-xl p-3 text-[12.5px]" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
              <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                <div>
                  <b>Tax:</b>{" "}
                  {g.isIntraState
                    ? `CGST ${inr(g.cgst)} + SGST ${inr(g.sgst)}`
                    : `IGST ${inr(g.igst)}`}
                </div>
                <div className="md:col-span-2"><b>Total Amount Payable:</b> {inr(g.total)}</div>
                <div className="md:col-span-2 text-ink-soft">{amountInWords(g.total)}</div>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="wg-btn rounded-pill px-4 py-2.5 text-[13.5px] font-bold" style={{ background: "var(--color-surface-card)", color: "var(--color-ink-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
              Cancel
            </button>
            <button type="submit" disabled={pending || !f.clientName.trim()} className="wg-btn rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}>
              {pending ? "Saving…" : "Create invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, disabled, onClick }: { icon: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-bold disabled:opacity-40"
      style={{ background: "var(--color-surface-card)", color: "var(--color-ink-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
    >
      {icon} {label}
    </button>
  );
}

function Pill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold whitespace-nowrap" style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}>
      {label}
    </span>
  );
}

function F({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {label} {required && <span style={{ color: "var(--color-altus-red)" }}>*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-subtle">{hint}</span>}
    </label>
  );
}
