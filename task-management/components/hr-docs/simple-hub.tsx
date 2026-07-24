"use client";

import { useMemo, useState } from "react";
import { FileText, FilePlus2, Search, ArrowUpRight } from "lucide-react";
import { LetterCompose, type ComposeEmployee } from "@/components/hr/letter-compose";

/**
 * A clean, SELF-CONTAINED letter library — browse every template by category and
 * compose any of them via the LetterCompose dialog (which talks to the
 * /api/hr-docs endpoints). Imports nothing from the heavy hr-docs action graph,
 * so it compiles fast (the old DocumentHub + its CTC/admin editors hung webpack).
 */
const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

export interface SimpleTemplate {
  typeKey: string;
  title: string;
  bodyMd: string;
  content: string; // text | structured | certificate
  category: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  recruitment: "Recruitment & Interns",
  appointment: "Appointment & Agreements",
  policies: "Policies",
  compensation: "Compensation",
  milestones: "Milestones & Recognition",
  requests: "Requests",
  separation: "Separation",
};
const CATEGORY_ORDER = ["recruitment", "appointment", "policies", "compensation", "milestones", "requests", "separation"];

export function SimpleDocHub({
  templates,
  roster,
  hrName,
}: {
  templates: SimpleTemplate[];
  roster: ComposeEmployee[];
  hrName: string;
}) {
  const [active, setActive] = useState<SimpleTemplate | null>(null);
  const [q, setQ] = useState("");

  const grouped = useMemo(() => {
    const filtered = q.trim()
      ? templates.filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase()))
      : templates;
    const map = new Map<string, SimpleTemplate[]>();
    for (const t of filtered) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [templates, q]);

  return (
    <>
      <div className="mb-6 relative max-w-[340px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search letters…"
          className="w-full rounded-lg border border-hairline-strong bg-white py-2 pl-9 pr-3 text-[14px] text-ink-strong outline-none focus:border-altus-red"
        />
      </div>

      <div className="space-y-8">
        {grouped.map(({ category, items }) => (
          <section key={category}>
            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-soft">
              {CATEGORY_LABEL[category] ?? category}
            </h3>
            <div className="grid gap-3.5 max-md:gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {items.map((t) => (
                <button
                  key={t.typeKey}
                  type="button"
                  onClick={() => t.content !== "structured" && setActive(t)}
                  className="group relative flex items-start gap-3 rounded-2xl border border-hairline bg-surface-card p-4 text-left transition-all hover:border-hairline-strong hover:shadow-md"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${RED} 12%, white)`, color: RED_DEEP }}>
                    <FileText size={19} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-ink-strong">{t.title}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide" style={{ color: t.content === "structured" ? "var(--color-ink-subtle)" : RED_DEEP }}>
                      {t.content === "structured" ? "Compensation workbench" : (<><FilePlus2 size={12} strokeWidth={2.6} /> Compose</>)}
                    </span>
                  </span>
                  <ArrowUpRight size={16} className="shrink-0 text-ink-soft transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </section>
        ))}
        {grouped.length === 0 && <p className="py-10 text-center text-ink-muted">No letters match “{q}”.</p>}
      </div>

      {active && <LetterCompose template={active} roster={roster} hrName={hrName} onClose={() => setActive(null)} />}
    </>
  );
}
