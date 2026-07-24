"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { FilePlus2, PenLine, Library } from "lucide-react";
import { LetterCompose, type ComposeTemplate, type ComposeEmployee } from "@/components/hr/letter-compose";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * A focused compose station for ONE letter type, embedded inside its lifecycle
 * stage. Uses the self-contained LetterCompose (which talks to the /api/hr-docs
 * endpoints) — importing nothing from the heavy hr-docs action graph.
 */
export function LetterStation({
  template,
  roster,
  hrName,
}: {
  template: ComposeTemplate;
  roster: ComposeEmployee[];
  hrName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-6 max-md:p-5" style={{ animationDelay: "40ms" }}>
      <div className="flex items-start gap-4 max-sm:flex-col">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${ACCENT}14`, color: ACCENT_DEEP }}>
          <PenLine size={24} strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}>
            {template.title}
          </h2>
          <p className="mt-1.5 max-w-[68ch] text-[14px] font-medium leading-relaxed text-ink-muted">
            Pick the recipient, edit the wording inline for this document, then issue. Every issue is frozen exactly as you edit it.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <FilePlus2 size={16} strokeWidth={2.4} /> Compose &amp; issue
            </button>
            <Link href={"/hr-docs" as Route} className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-surface-card px-4 py-2.5 text-[14px] font-semibold text-ink-strong transition-colors hover:border-ink-soft">
              <Library size={16} strokeWidth={2.2} /> Open full letter library
            </Link>
          </div>
        </div>
      </div>

      {open && <LetterCompose template={template} roster={roster} hrName={hrName} onClose={() => setOpen(false)} />}
    </section>
  );
}
