"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Plus, Pencil, Trash2, X, Search, FileText, Mail, Paperclip } from "lucide-react";
import {
  upsertWmsProposal,
  deleteWmsProposal,
  setProposalStatus,
  uploadProposalAttachment,
  deleteProposalAttachment,
  proposalAttachmentUrl,
} from "@/app/(app)/billing/actions";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
import {
  WMS_PROPOSAL_TYPES,
  WMS_PROPOSAL_TYPE_LABELS,
  BILLING_PROPOSAL_STATUSES,
  BILLING_PROPOSAL_STATUS_LABELS,
  BILLING_PRODUCTS,
  BILLING_PRODUCT_LABELS,
  billingProductLabel,
  BILLING_COMPANY_OPTIONS,
  parseEmailList,
} from "@/db/enums";
import type { ProposalRow } from "@/lib/queries/billing-wms-proposals";
import type { ProposalAttachment } from "@/db/schema";
import { formatDMonY } from "@/lib/format";
import { DateField } from "@/components/ui/date-field";

/**
 * BILLING › PROPOSALS (WMS) — create, view, edit and manage WMS proposals.
 *
 * Captured per proposal: Proposal Number, Proposal Date, Client (picked from
 * the Client Address Book), Product (WMS), WMS Type, Proposal Status.
 *
 * The client is a REFERENCE, not a copy — the table renders the client's live
 * name/company/contact straight from the address book, so correcting a client
 * there corrects every proposal at once.
 */

const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";

const STATUS_TONE: Record<string, string> = {
  draft: "#64748B",
  sent: "#2563EB",
  under_review: "#B45309",
  accepted: "#15803D",
  rejected: "#DC2626",
  on_hold: "#7C3AED",
};

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#9333ea]/50";

type Draft = {
  code: string;
  proposalDate: string;
  clientId: string;
  productType: string;
  wmsType: string;
  entity: string;
  /** Held as the raw comma-separated text the field shows; split on save. */
  toEmails: string;
  ccEmails: string;
  status: string;
  notes: string;
  attachments: ProposalAttachment[];
};

const prettyBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Live preview of what a comma-separated address field will actually send. */
function EmailChips({ value }: { value: string }) {
  const list = parseEmailList(value);
  if (list.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((email) => (
        <span
          key={email}
          className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-semibold"
          style={{ background: `color-mix(in srgb, ${PURPLE} 10%, transparent)`, color: PURPLE }}
        >
          <Mail size={12} />
          {email}
        </span>
      ))}
    </div>
  );
}

export function WmsProposals({
  rows,
  clients,
  suggestedNumber,
}: {
  rows: ProposalRow[];
  clients: { id: string; name: string; company: string | null }[];
  suggestedNumber: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProposalRow | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [companyFilter, setCompanyFilter] = React.useState("");
  const [productFilter, setProductFilter] = React.useState("");
  const [wmsTypeFilter, setWmsTypeFilter] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function openCreate() {
    setEditing(null);
    setDraft({
      code: suggestedNumber,
      proposalDate: new Date().toISOString().slice(0, 10),
      clientId: "",
      productType: "wms",
      wmsType: "",
      entity: "",
      toEmails: "",
      ccEmails: "",
      status: "draft",
      notes: "",
      attachments: [],
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(r: ProposalRow) {
    setEditing(r);
    setDraft({
      code: r.code,
      proposalDate: r.proposalDate,
      clientId: r.clientId,
      productType: r.productType,
      wmsType: r.wmsType ?? "",
      entity: r.entity ?? "",
      toEmails: (r.toEmails ?? []).join(", "),
      ccEmails: (r.ccEmails ?? []).join(", "),
      status: r.status,
      notes: r.notes ?? "",
      attachments: r.attachments ?? [],
    });
    setError(null);
    setOpen(true);
  }

  /**
   * Upload each chosen file straight away and append its descriptor. Uploading
   * on selection rather than on save means the list shown is the list that
   * exists, and a failed file is reported while it can still be acted on.
   */
  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(true);
    startTransition(async () => {
      const added: ProposalAttachment[] = [];
      const failed: string[] = [];
      for (const file of chosen) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await uploadProposalAttachment(fd);
        if (res.ok) added.push(res.attachment);
        else failed.push(res.error);
      }
      setUploading(false);
      if (added.length) setDraft((d) => (d ? { ...d, attachments: [...d.attachments, ...added] } : d));
      if (failed.length) setError(failed[0]!);
    });
  }

  function removeFile(path: string) {
    setDraft((d) => (d ? { ...d, attachments: d.attachments.filter((a) => a.path !== path) } : d));
    // Best effort: the descriptor is already out of the draft, so a storage
    // hiccup leaves an orphaned blob rather than a broken proposal.
    startTransition(async () => {
      await deleteProposalAttachment(path);
    });
  }

  function openAttachment(path: string) {
    startTransition(async () => {
      const res = await proposalAttachmentUrl(path);
      if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
      else setError(res.error);
    });
  }

  /** Change status straight from the list, without opening the editor. */
  function changeStatus(r: ProposalRow, status: string) {
    if (status === r.status) return;
    startTransition(async () => {
      const res = await setProposalStatus(r.id, status);
      if (!res.ok) alert(res.error);
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertWmsProposal({
        ...(editing ? { id: editing.id } : {}),
        code: draft.code,
        proposalDate: draft.proposalDate,
        clientId: draft.clientId,
        productType: draft.productType,
        wmsType: draft.wmsType || null,
        entity: draft.entity || null,
        toEmails: draft.toEmails,
        ccEmails: draft.ccEmails,
        status: draft.status,
        notes: draft.notes || null,
        attachments: draft.attachments,
      });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  function remove(r: ProposalRow) {
    if (!confirm(`Delete proposal ${r.code}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteWmsProposal(r.id);
      if (!res.ok) alert(res.error);
    });
  }

  /** Companies actually present, so the filter never offers an empty result. */
  const companiesInUse = React.useMemo(
    () => [...new Set(rows.map((r) => r.entity).filter((v): v is string => !!v))].sort(),
    [rows],
  );

  const filtered = React.useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!statusFilter || r.status === statusFilter) &&
        (!companyFilter || r.entity === companyFilter) &&
        (!productFilter || r.productType === productFilter) &&
        (!wmsTypeFilter || r.wmsType === wmsTypeFilter) &&
        // Period — inclusive on both ends; either end may be left open.
        (!from || r.proposalDate >= from) &&
        (!to || r.proposalDate <= to) &&
        (!n ||
          r.code.toLowerCase().includes(n) ||
          r.clientName.toLowerCase().includes(n) ||
          (r.clientCompany ?? "").toLowerCase().includes(n) ||
          (r.entity ?? "").toLowerCase().includes(n) ||
          r.toEmails.some((e) => e.toLowerCase().includes(n)) ||
          r.ccEmails.some((e) => e.toLowerCase().includes(n))),
    );
  }, [rows, q, statusFilter, companyFilter, productFilter, wmsTypeFilter, from, to]);

  const filtersActive =
    !!q || !!statusFilter || !!companyFilter || !!productFilter || !!wmsTypeFilter || !!from || !!to;

  function clearFilters() {
    setQ("");
    setStatusFilter("");
    setCompanyFilter("");
    setProductFilter("");
    setWmsTypeFilter("");
    setFrom("");
    setTo("");
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-[260px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search number or client…"
              aria-label="Search proposals"
              className={`${inputCls} pl-8`}
            />
          </div>
          <div className="w-[168px]">
            <select
              className={inputCls}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {BILLING_PROPOSAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BILLING_PROPOSAL_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[168px]">
            <select
              className={inputCls}
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              aria-label="Filter by company"
            >
              <option value="">All companies</option>
              {[...new Set([...BILLING_COMPANY_OPTIONS, ...companiesInUse])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[148px]">
            <select
              className={inputCls}
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              aria-label="Filter by product"
            >
              <option value="">All products</option>
              {BILLING_PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {BILLING_PRODUCT_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[186px]">
            <select
              className={inputCls}
              value={wmsTypeFilter}
              onChange={(e) => setWmsTypeFilter(e.target.value)}
              aria-label="Filter by WMS type"
            >
              <option value="">All WMS types</option>
              {WMS_PROPOSAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WMS_PROPOSAL_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {/* Period — either end may be left open. */}
          <div className="flex w-[330px] items-center gap-1.5">
            <DateField
              className={inputCls}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="Proposals from date"
            />
            <span className="text-[12.5px] font-semibold text-ink-subtle">to</span>
            <DateField
              className={inputCls}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Proposals to date"
            />
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="wg-btn rounded-pill px-3.5 py-2 text-[12.5px] font-bold"
              style={{
                background: "var(--color-surface-card)",
                color: "var(--color-ink-soft)",
                boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
              }}
            >
              Clear filters
            </button>
          )}
          <span className="self-center text-[12.5px] font-semibold text-ink-subtle">
            {filtered.length} of {rows.length}
          </span>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={clients.length === 0}
          title={clients.length === 0 ? "Add a client in the Address Book first" : undefined}
          className="wg-btn inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
        >
          <Plus size={16} strokeWidth={2.6} /> Create Proposal
        </button>
      </div>

      {clients.length === 0 && (
        <p
          className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold"
          style={{ background: "color-mix(in srgb, #B45309 10%, transparent)", color: "#B45309" }}
        >
          The Address Book is empty — add a client there first, since every proposal must be raised against one.
        </p>
      )}

      {filtered.length === 0 ? (
        <div
          className="rounded-[22px] bg-surface-card p-14 text-center"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <FileText size={26} className="mx-auto text-ink-subtle" />
          <p className="mt-3 text-[15px] font-bold text-ink-strong">
            {rows.length === 0 ? "No proposals yet" : "No proposals match this filter"}
          </p>
          {rows.length === 0 && (
            <p className="mt-1 text-[13.5px] text-ink-subtle">Create your first WMS proposal to see it here.</p>
          )}
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-[22px] bg-surface-card"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <table className="w-full min-w-[900px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                <th className="px-4 py-3">Proposal No.</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">WMS Type</th>
                <th className="px-4 py-3">Files</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    {/* Opens the proposal's own page, where its Milestones live. */}
                    <Link
                      href={`/billing/proposals/${r.id}` as Route}
                      className="font-bold tabular-nums text-ink-strong hover:underline"
                      style={{ color: PURPLE }}
                    >
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDMonY(r.proposalDate)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink-strong">{r.clientName}</div>
                    {r.clientCompany && <div className="text-[11.5px] text-ink-subtle">{r.clientCompany}</div>}
                    {r.clientContactPerson && (
                      <div className="text-[11.5px] text-ink-subtle">{r.clientContactPerson}</div>
                    )}
                    {r.clientEmail && <div className="text-[11.5px] text-ink-subtle">{r.clientEmail}</div>}
                  </td>
                  <td className="px-4 py-3">{r.entity ?? <span className="text-ink-subtle">—</span>}</td>
                  <td className="px-4 py-3">
                    <Pill label={billingProductLabel(r.productType)} tone={PURPLE} />
                  </td>
                  <td className="px-4 py-3">
                    {r.wmsType ? WMS_PROPOSAL_TYPE_LABELS[r.wmsType] : <span className="text-ink-subtle">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.attachments.length > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-ink-soft">
                        <Paperclip size={12} /> {r.attachments.length}
                      </span>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {/* Changeable in place — the pill's colour tracks the value,
                        so the list stays scannable while staying editable. */}
                    <select
                      value={r.status}
                      onChange={(e) => changeStatus(r, e.target.value)}
                      disabled={pending}
                      aria-label={`Status of ${r.code}`}
                      className="cursor-pointer rounded-pill border-0 px-2.5 py-1 text-[11.5px] font-bold outline-none focus:ring-2 focus:ring-[#9333ea]/50"
                      style={{
                        background: `color-mix(in srgb, ${STATUS_TONE[r.status] ?? "#475569"} 12%, transparent)`,
                        color: STATUS_TONE[r.status] ?? "#475569",
                      }}
                    >
                      {BILLING_PROPOSAL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {BILLING_PROPOSAL_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        aria-label={`Edit ${r.code}`}
                        className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        aria-label={`Delete ${r.code}`}
                        className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && draft && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-sm max-md:p-3">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "Edit proposal" : "Create proposal"}
            className="my-8 w-full max-w-[620px] rounded-[22px] bg-surface-card shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
              <div>
                <h2 className="text-[19px] font-extrabold tracking-tight text-ink-strong">
                  {editing ? `Edit ${editing.code}` : "Create Proposal"}
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-subtle">WMS proposal — client comes from the Address Book.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={save} className="px-6 py-5">
              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded-xl px-3 py-2 text-[13px] font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                    color: "var(--color-altus-red)",
                  }}
                >
                  {error}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Proposal Number" required>
                  <input
                    className={inputCls}
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Proposal Date" required>
                  <DateField
                    className={inputCls}
                    value={draft.proposalDate}
                    onChange={(e) => setDraft({ ...draft, proposalDate: e.target.value })}
                    required
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Client" required hint="From the Address Book.">
                    <select
                      className={inputCls}
                      value={draft.clientId}
                      onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
                      required
                    >
                      <option value="">Select a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.company ? ` — ${c.company}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Product Type" required>
                  <select
                    className={inputCls}
                    value={draft.productType}
                    onChange={(e) => setDraft({ ...draft, productType: e.target.value })}
                  >
                    {BILLING_PRODUCTS.map((p) => (
                      <option key={p} value={p}>
                        {BILLING_PRODUCT_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="WMS Type">
                  <select
                    className={inputCls}
                    value={draft.wmsType}
                    onChange={(e) => setDraft({ ...draft, wmsType: e.target.value })}
                  >
                    <option value="">—</option>
                    {WMS_PROPOSAL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {WMS_PROPOSAL_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Company">
                  <select
                    className={inputCls}
                    value={draft.entity}
                    onChange={(e) => setDraft({ ...draft, entity: e.target.value })}
                  >
                    <option value="">— none —</option>
                    {BILLING_COMPANY_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                    {/* A value saved before this list existed stays selectable,
                        so opening an old proposal cannot silently rewrite it. */}
                    {draft.entity && !(BILLING_COMPANY_OPTIONS as readonly string[]).includes(draft.entity) && (
                      <option value={draft.entity}>{draft.entity} (existing)</option>
                    )}
                  </select>
                </Field>

                {/* Email / CC — typed freely, comma-separated. Addresses are
                    validated server-side and the offending one is named back. */}
                <div className="md:col-span-2">
                  <Field label="Email" hint="Separate multiple addresses with commas.">
                    <input
                      className={inputCls}
                      value={draft.toEmails}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="name@company.com, accounts@company.com"
                      onChange={(e) => setDraft({ ...draft, toEmails: e.target.value })}
                    />
                  </Field>
                  <EmailChips value={draft.toEmails} />
                </div>

                <div className="md:col-span-2">
                  <Field label="CC" hint="Separate multiple addresses with commas.">
                    <input
                      className={inputCls}
                      value={draft.ccEmails}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="manager@company.com, finance@company.com"
                      onChange={(e) => setDraft({ ...draft, ccEmails: e.target.value })}
                    />
                  </Field>
                  <EmailChips value={draft.ccEmails} />
                </div>

                <Field label="Proposal Status">
                  <select
                    className={inputCls}
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  >
                    {BILLING_PROPOSAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {BILLING_PROPOSAL_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Notes">
                    {/* Dictation sits inside the box, bottom-right, so it reads
                        as part of the field rather than a stray control. */}
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
                            setDraft((d) =>
                              d ? { ...d, notes: (d.notes ? d.notes.trimEnd() + " " : "") + t } : d,
                            )
                          }
                        />
                      </span>
                    </div>
                  </Field>
                </div>

                {/* Attach Proposal — any number of files; each uploads as it is
                    chosen so the list is accurate before the proposal is saved. */}
                <div className="md:col-span-2">
                  <Field
                    label="Attach Proposal"
                    hint="PDF, Word, Excel or images — up to 20 MB each. Add as many as you need."
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className={`${inputCls} file:mr-3 file:rounded-pill file:border-0 file:bg-black/[0.06] file:px-3 file:py-1 file:text-[12.5px] file:font-bold file:text-ink-soft`}
                      onChange={(e) => addFiles(e.target.files)}
                    />
                  </Field>
                  {uploading && <p className="mt-1.5 text-[12px] font-semibold text-ink-subtle">Uploading…</p>}
                  {draft.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {draft.attachments.map((a) => (
                        <li
                          key={a.path}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px]"
                          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                        >
                          <Paperclip size={13} className="shrink-0 text-ink-subtle" />
                          <button
                            type="button"
                            onClick={() => openAttachment(a.path)}
                            className="min-w-0 flex-1 truncate text-left font-semibold hover:underline"
                            style={{ color: PURPLE }}
                          >
                            {a.name}
                          </button>
                          <span className="shrink-0 tabular-nums text-ink-subtle">{prettyBytes(a.size)}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${a.name}`}
                            onClick={() => removeFile(a.path)}
                            className="shrink-0 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                          >
                            <X size={13} strokeWidth={3} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="wg-btn rounded-pill px-4 py-2.5 text-[13.5px] font-bold"
                  style={{
                    background: "var(--color-surface-card)",
                    color: "var(--color-ink-soft)",
                    boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !draft.code.trim() || !draft.clientId}
                  className="wg-btn rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
                >
                  {pending ? "Saving…" : editing ? "Save changes" : "Create Proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Pill({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
    >
      {label}
    </span>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
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
