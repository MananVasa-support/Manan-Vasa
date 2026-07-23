"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Mail,
  Send,
  Inbox,
  PenLine,
  CheckCircle2,
  Award,
  Table2,
  Pencil,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import {
  HR_CATEGORIES,
  CATEGORY_LABELS,
  type HrCategory,
} from "@/lib/hr-docs/types";
import type { TemplateRow } from "@/app/(app)/hr-docs/actions";
import { ComposeDialog, type HrDocEmployee } from "@/components/hr-docs/compose-dialog";
import { TemplateEditor } from "@/components/hr-docs/template-editor";
import { CtcWorkbench } from "@/components/hr-docs/ctc-editor";
import type { CtcReason } from "@/lib/hr-docs/types";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * The Document Hub — 7 category segments, a search box, and a small grid of
 * template cards per segment (title + trigger/signature/content mini-tags). A card
 * click composes; the admin pencil edits the template body. Never a flat wall of 26.
 */
export function DocumentHub({
  templates,
  roster,
  isAdmin,
  hrName,
}: {
  templates: TemplateRow[];
  roster: HrDocEmployee[];
  isAdmin: boolean;
  hrName: string;
}) {
  const [list, setList] = useState<TemplateRow[]>(templates);
  const [cat, setCat] = useState<HrCategory | "all">("all");
  const [q, setQ] = useState("");
  const [composing, setComposing] = useState<TemplateRow | null>(null);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [ctcFor, setCtcFor] = useState<TemplateRow | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of list) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return m;
  }, [list]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((t) => {
      if (cat !== "all" && t.category !== cat) return false;
      if (!needle) return true;
      return t.title.toLowerCase().includes(needle) || CATEGORY_LABELS[t.category as HrCategory]?.toLowerCase().includes(needle);
    });
  }, [list, cat, q]);

  // When searching across everything, show grouped; when a category is picked, one group.
  const groups = useMemo(() => {
    const order: HrCategory[] = [...HR_CATEGORIES];
    const byCat = new Map<HrCategory, TemplateRow[]>();
    for (const t of filtered) {
      const c = t.category as HrCategory;
      byCat.set(c, [...(byCat.get(c) ?? []), t]);
    }
    return order
      .filter((c) => byCat.has(c))
      .map((c) => ({ category: c, label: CATEGORY_LABELS[c], rows: byCat.get(c)! }));
  }, [filtered]);

  function onTemplateSaved(updated: TemplateRow) {
    setList((prev) => prev.map((t) => (t.typeKey === updated.typeKey ? updated : t)));
  }

  return (
    <div className="wg-rise">
      {/* segments + search */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segment active={cat === "all"} onClick={() => setCat("all")} label="All" count={list.length} />
        {HR_CATEGORIES.map((c) => (
          <Segment key={c} active={cat === c} onClick={() => setCat(c)} label={CATEGORY_LABELS[c]} count={counts.get(c) ?? 0} />
        ))}
        <div className="relative ml-auto max-md:ml-0 max-md:w-full">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents…"
            aria-label="Search documents"
            className="w-[240px] max-md:w-full rounded-pill border border-hairline-strong bg-surface-card py-2 pl-9 pr-3 text-[13.5px] text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-hairline bg-surface-card px-5 py-10 text-center text-[14px] font-medium text-ink-muted">
          No documents match “{q}”.
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                {g.label}
                <span className="text-ink-subtle">· {g.rows.length}</span>
              </h2>
              <div className="grid gap-3.5 max-md:gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {g.rows.map((t) => (
                  <TemplateCard
                    key={t.typeKey}
                    template={t}
                    isAdmin={isAdmin}
                    onCompose={() => (t.content === "structured" ? setCtcFor(t) : setComposing(t))}
                    onEdit={() => setEditing(t)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {composing && (
        <ComposeDialog template={composing} roster={roster} hrName={hrName} onClose={() => setComposing(null)} />
      )}
      {editing && isAdmin && (
        <TemplateEditor template={editing} onClose={() => setEditing(null)} onSaved={onTemplateSaved} />
      )}
      {ctcFor && (
        <CtcWorkbench
          roster={roster}
          initialReason={reasonForTypeKey(ctcFor.typeKey)}
          onClose={() => setCtcFor(null)}
        />
      )}
    </div>
  );
}

function reasonForTypeKey(typeKey: string): CtcReason {
  if (typeKey === "promotion_ctc") return "promotion";
  if (typeKey === "appraisal_ctc") return "appraisal";
  return "initial";
}

function Segment({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-bold transition"
      style={
        active
          ? { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, color: "#fff", boxShadow: `0 8px 20px -12px ${ACCENT_DEEP}` }
          : { background: "var(--color-surface-card)", color: "var(--color-ink-muted)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }
      }
    >
      {label}
      <span className="text-[11px] font-bold" style={{ opacity: active ? 0.85 : 0.6 }}>{count}</span>
    </button>
  );
}

function TemplateCard({
  template,
  isAdmin,
  onCompose,
  onEdit,
}: {
  template: TemplateRow;
  isAdmin: boolean;
  onCompose: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-card p-4 transition-all hover:border-hairline-strong hover:shadow-lg"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }} />
      <button
        type="button"
        onClick={onCompose}
        className="flex-1 text-left outline-none"
        aria-label={`Compose ${template.title}`}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 15.5, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
            {template.title}
          </h3>
          <ArrowUpRight size={16} className="shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        {!template.active && (
          <span className="mt-1 inline-block rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft" style={{ background: "var(--color-surface-muted)" }}>
            Inactive
          </span>
        )}
      </button>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MiniTag {...triggerTag(template.trigger)} />
          {signatureTag(template.signature) && <MiniTag {...signatureTag(template.signature)!} />}
          {contentTag(template.content) && <MiniTag {...contentTag(template.content)!} />}
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onEdit}
            title="Edit template body"
            aria-label={`Edit ${template.title} template`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft transition hover:bg-surface-muted hover:text-ink-strong"
          >
            <Pencil size={13.5} strokeWidth={2.3} />
          </button>
        )}
      </div>
    </div>
  );
}

interface TagSpec {
  Icon: LucideIcon;
  label: string;
}

function MiniTag({ Icon, label }: TagSpec) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
      style={{ background: "var(--color-surface-muted)", color: "var(--color-ink-muted)" }}
      title={label}
    >
      <Icon size={11} strokeWidth={2.4} /> {label}
    </span>
  );
}

function triggerTag(t: string): TagSpec {
  if (t === "email") return { Icon: Mail, label: "Email" };
  if (t === "request") return { Icon: Inbox, label: "Request" };
  return { Icon: Send, label: "Issue" };
}
function signatureTag(s: string): TagSpec | null {
  if (s === "esign") return { Icon: PenLine, label: "E-sign" };
  if (s === "acknowledge") return { Icon: CheckCircle2, label: "Ack" };
  return null;
}
function contentTag(c: string): TagSpec | null {
  if (c === "certificate") return { Icon: Award, label: "Cert" };
  if (c === "structured") return { Icon: Table2, label: "CTC" };
  return null;
}
