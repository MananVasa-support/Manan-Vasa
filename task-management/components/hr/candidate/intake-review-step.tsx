"use client";

import { PencilLine, CheckCircle2 } from "lucide-react";
import { vkey, type IntakeSection } from "@/lib/hr/candidate/intake-schema";

const DISPLAY_FONT = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

type ReviewRow = { label: string; value: string; done?: boolean };

export function IntakeReviewStep({
  sections,
  values,
  instances,
  photo,
  sign,
  onEdit,
}: {
  sections: IntakeSection[];
  values: Record<string, string>;
  instances: Record<string, string[]>;
  photo: { path?: string };
  sign: { path?: string };
  onEdit: (i: number) => void;
}) {
  return (
    <div>
      <h3
        className="text-ink-strong"
        style={{ ...DISPLAY_FONT, fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em" }}
      >
        Review &amp; Submit
      </h3>
      <p className="mt-2 text-[15px] text-ink-muted">
        Check everything below, then save the candidate.
      </p>

      <div className="mt-8 space-y-5">
        {sections.map((s, i) => {
          const rows: ReviewRow[] = [];
          if (s.repeat) {
            (instances[s.id] ?? []).forEach((uid, idx) => {
              s.fields.forEach((f) => {
                const v = values[`${s.id}.${uid}.${f.key}`];
                if (v?.trim()) rows.push({ label: `${s.repeat!.itemLabel} ${idx + 1} · ${f.label}`, value: v });
              });
            });
          } else {
            s.fields.forEach((f) => {
              const v = values[vkey(s.id, f.key)];
              if (v?.trim()) rows.push({ label: f.label, value: v });
            });
          }
          if (s.declaration) {
            if (photo.path) rows.push({ label: "Photograph", value: "Uploaded", done: true });
            if (sign.path) rows.push({ label: "Signature", value: "Uploaded", done: true });
          }

          return (
            <section
              key={s.id}
              className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <header className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: "var(--color-altus-red)" }}
                  >
                    {i + 1}
                  </span>
                  <h4
                    className="truncate text-ink-strong"
                    style={{ ...DISPLAY_FONT, fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}
                  >
                    {s.title}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-altus-red transition-colors hover:bg-altus-red/10"
                >
                  <PencilLine size={14} /> Edit
                </button>
              </header>

              <div className="px-6 py-5">
                {rows.length ? (
                  <dl className="grid grid-cols-2 gap-x-8 gap-y-5 max-sm:grid-cols-1">
                    {rows.map((r, j) => (
                      <div key={j} className="min-w-0">
                        <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">
                          {r.label}
                        </dt>
                        {r.done ? (
                          <dd className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#16a34a]">
                            <CheckCircle2 size={16} /> {r.value}
                          </dd>
                        ) : (
                          <dd className="mt-1 break-words text-[15px] leading-snug text-ink-strong">
                            {r.value}
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-[14px] italic text-ink-subtle">Nothing entered.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
