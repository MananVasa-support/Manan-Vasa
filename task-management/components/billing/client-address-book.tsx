"use client";

import * as React from "react";
import { Search, Plus, Pencil, X, Archive, Mail, Phone, MapPin, User, StickyNote } from "lucide-react";
import { upsertBillingClient, archiveBillingClient } from "@/app/(app)/billing/actions";
import type { DirectoryClient } from "@/lib/queries/billing-clients";

/**
 * CLIENT ADDRESS BOOK — the Billing room's second surface, reached from the
 * module rail entry directly under "Billing".
 *
 * Master/detail in one page: the directory list on the left of the content area,
 * the selected client's record on the right. The seven captured fields are
 * Client Name, Company Name, Email ID, Phone Number, Address, Contact Person
 * and Note.
 */

// Matches the Billing room's identity in lib/module-theme.ts.
const PURPLE = "#9333ea";
const PURPLE_DEEP = "#7e22ce";

const LABELS = {
  name: "Client Name",
  company: "Company Name",
  email: "Email ID",
  phone: "Phone Number",
  address: "Address",
  contactPerson: "Contact Person",
  notes: "Note",
} as const;

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#9333ea]/50";

type Draft = {
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  notes: string;
};

const BLANK: Draft = { name: "", company: "", email: "", phone: "", address: "", contactPerson: "", notes: "" };

const toDraft = (c: DirectoryClient): Draft => ({
  name: c.name,
  company: c.company ?? "",
  email: c.primaryEmail ?? "",
  phone: c.phone ?? "",
  address: c.address,
  contactPerson: c.contactPerson ?? "",
  notes: c.notes ?? "",
});

export function ClientAddressBook({ clients }: { clients: DirectoryClient[] }) {
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(clients[0]?.id ?? null);
  const [mode, setMode] = React.useState<"view" | "edit" | "create">("view");
  const [draft, setDraft] = React.useState<Draft>(BLANK);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const selected = React.useMemo(() => clients.find((c) => c.id === selectedId) ?? null, [clients, selectedId]);

  // NOTE: there is deliberately no effect syncing `draft` from `selected`.
  // The view renders straight from `selected` (the server's copy), and the Edit
  // button seeds `draft` at the moment it is clicked — so an effect would be
  // both redundant and a source of cascading renders.

  const filtered = React.useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(n) ||
        (c.company ?? "").toLowerCase().includes(n) ||
        (c.contactPerson ?? "").toLowerCase().includes(n) ||
        (c.phone ?? "").includes(n) ||
        c.emails.some((e) => e.email.toLowerCase().includes(n)),
    );
  }, [clients, q]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // This form edits the PRIMARY address only. The action is replace-all, so a
    // client's other addresses must be resent or saving here would delete them.
    const primary = draft.email.trim();
    const others = (mode === "edit" ? (selected?.emails ?? []) : [])
      .filter((e) => e.email.toLowerCase() !== primary.toLowerCase())
      .map((e) => ({ email: e.email, label: e.label, isPrimary: false }));
    const emails = [...(primary ? [{ email: primary, label: null, isPrimary: true }] : []), ...others];

    startTransition(async () => {
      const res = await upsertBillingClient({
        ...(mode === "edit" && selected ? { id: selected.id } : {}),
        name: draft.name,
        company: draft.company || null,
        contactPerson: draft.contactPerson || null,
        phone: draft.phone || null,
        address: draft.address || null,
        notes: draft.notes || null,
        emails,
      });
      if (res.ok) {
        if (mode === "create") setSelectedId(res.id);
        setMode("view");
      } else {
        setError(res.error);
      }
    });
  }

  function archive(c: DirectoryClient) {
    if (!confirm(`Archive ${c.name}? It is hidden from the address book but nothing is deleted.`)) return;
    startTransition(async () => {
      const res = await archiveBillingClient(c.id);
      if (res.ok) setSelectedId(null);
      else alert(res.error);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ── Directory ── */}
      <section
        className="flex max-h-[70vh] flex-col overflow-hidden rounded-[22px] bg-surface-card"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        aria-label="Client directory"
      >
        <div className="border-b border-hairline p-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients…"
              aria-label="Search the address book"
              className={`${inputCls} pl-8`}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(BLANK);
              setError(null);
              setMode("create");
            }}
            className="wg-btn mt-2 flex w-full items-center justify-center gap-1.5 rounded-pill py-2 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
          >
            <Plus size={14} strokeWidth={3} /> Add client
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-subtle">
              {clients.length === 0 ? "No clients yet." : "No match."}
            </p>
          ) : (
            <ul>
              {filtered.map((c) => {
                const active = c.id === selectedId && mode === "view";
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(c.id);
                        setMode("view");
                      }}
                      className="w-full border-b border-hairline/60 px-4 py-3 text-left transition-colors hover:bg-black/[0.03]"
                      style={active ? { background: `color-mix(in srgb, ${PURPLE} 8%, transparent)` } : undefined}
                    >
                      <div className="truncate text-[13.5px] font-bold text-ink-strong">{c.name}</div>
                      {c.company && <div className="truncate text-[12px] text-ink-subtle">{c.company}</div>}
                      {c.primaryEmail && <div className="mt-0.5 truncate text-[11.5px] text-ink-subtle">{c.primaryEmail}</div>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-hairline px-4 py-2.5 text-[11.5px] text-ink-subtle">
          {clients.length} client{clients.length === 1 ? "" : "s"}
        </footer>
      </section>

      {/* ── Record / form ── */}
      <section
        className="rounded-[22px] bg-surface-card p-6 max-md:p-4"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        aria-label="Client record"
      >
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

        {mode === "view" ? (
          selected ? (
            <>
              <header className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-[22px] font-extrabold tracking-tight text-ink-strong">{selected.name}</h2>
                  {selected.company && <p className="text-[13.5px] text-ink-subtle">{selected.company}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(toDraft(selected));
                      setError(null);
                      setMode("edit");
                    }}
                    className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-bold text-white"
                    style={{ background: PURPLE }}
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => archive(selected)}
                    aria-label={`Archive ${selected.name}`}
                    className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
                  >
                    <Archive size={16} />
                  </button>
                </div>
              </header>

              <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <Row icon={<User size={14} />} label={LABELS.name} value={selected.name} />
                <Row icon={<User size={14} />} label={LABELS.company} value={selected.company} />
                <Row icon={<Mail size={14} />} label={LABELS.email} value={selected.primaryEmail} />
                <Row icon={<Phone size={14} />} label={LABELS.phone} value={selected.phone} />
                <Row icon={<MapPin size={14} />} label={LABELS.address} value={selected.address} wide />
                <Row icon={<User size={14} />} label={LABELS.contactPerson} value={selected.contactPerson} />
                <Row icon={<StickyNote size={14} />} label={LABELS.notes} value={selected.notes} wide />
                {selected.emails.length > 1 && (
                  <Row
                    icon={<Mail size={14} />}
                    label="Other emails"
                    value={selected.emails.filter((e) => e.email !== selected.primaryEmail).map((e) => e.email).join(", ")}
                    wide
                  />
                )}
              </dl>
            </>
          ) : (
            <div className="py-16 text-center">
              <p className="text-[15px] font-bold text-ink-strong">
                {clients.length === 0 ? "No clients yet" : "Select a client"}
              </p>
              <p className="mt-1 text-[13.5px] text-ink-subtle">
                {clients.length === 0
                  ? "Add your first client — the address book feeds billing correspondence."
                  : "Pick someone from the directory to see their record."}
              </p>
            </div>
          )
        ) : (
          <form onSubmit={save}>
            <header className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-[20px] font-extrabold tracking-tight text-ink-strong">
                {mode === "edit" ? `Edit ${selected?.name ?? "client"}` : "New client"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setMode("view");
                  setError(null);
                }}
                aria-label="Cancel"
                className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
              >
                <X size={17} />
              </button>
            </header>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldInput label={LABELS.name} required value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              <FieldInput label={LABELS.company} value={draft.company} onChange={(v) => setDraft({ ...draft, company: v })} />
              <FieldInput label={LABELS.email} type="email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} />
              <FieldInput label={LABELS.phone} value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
              <FieldInput label={LABELS.contactPerson} value={draft.contactPerson} onChange={(v) => setDraft({ ...draft, contactPerson: v })} />
              <div className="md:col-span-2">
                <FieldInput label={LABELS.address} multiline value={draft.address} onChange={(v) => setDraft({ ...draft, address: v })} />
              </div>
              <div className="md:col-span-2">
                <FieldInput label={LABELS.notes} multiline value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("view");
                  setError(null);
                }}
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
                disabled={pending || !draft.name.trim()}
                className="wg-btn rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_DEEP})` }}
              >
                {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Add client"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <dt className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        <span className="text-ink-subtle">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 break-words whitespace-pre-wrap text-[14px] text-ink-strong">
        {value && value.trim() !== "" ? value : <span className="text-ink-subtle">—</span>}
      </dd>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  multiline,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {label} {required && <span style={{ color: "var(--color-altus-red)" }}>*</span>}
      </span>
      {multiline ? (
        <textarea rows={3} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
      )}
    </label>
  );
}
