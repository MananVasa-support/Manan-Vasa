"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { UserPlus, ClipboardList, Phone, Mail, Search } from "lucide-react";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";

/**
 * Candidate Records — the searchable list of every filled interview form. The
 * FORM itself lives on its own plain page (/hr/intake); "New candidate" jumps
 * there. Deliberately light (no wizard/motion import) so this list compiles fast.
 */
const RED = "var(--color-altus-red)";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  new: { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: "var(--color-altus-red-deep)" },
  shortlisted: { bg: "color-mix(in srgb, var(--color-green) 16%, white)", fg: "#15803d" },
  rejected: { bg: "var(--color-surface-soft)", fg: "#64748b" },
  hired: { bg: "color-mix(in srgb, var(--color-green) 22%, white)", fg: "#166534" },
};

export function BasicDetailsScreen({ candidates }: { candidates: CandidateRow[] }) {
  const [q, setQ] = React.useState("");

  const rows = candidates.filter((c) => {
    if (!q.trim()) return true;
    const s = `${c.fullName} ${c.positionApplied ?? ""} ${c.mobile ?? ""} ${c.email ?? ""}`.toLowerCase();
    return s.includes(q.trim().toLowerCase());
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-[320px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search candidates…"
            className="w-full rounded-lg border border-hairline-strong bg-white py-2 pl-9 pr-3 text-[14px] text-ink-strong outline-none focus:border-altus-red"
          />
        </div>
        <Link
          href={"/hr/intake" as Route}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
        >
          <UserPlus size={16} strokeWidth={2.4} /> New candidate
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-hairline-strong bg-surface-card px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: "var(--color-altus-red-deep)" }}>
            <ClipboardList size={26} strokeWidth={2.1} />
          </span>
          <h3 className="mt-4 text-[18px] font-bold text-ink-strong">{candidates.length === 0 ? "No candidates yet" : "No matches"}</h3>
          <p className="mt-1 max-w-[42ch] text-[13.5px] text-ink-muted">{candidates.length === 0 ? "Fill a candidate's interview form to see them here." : "Try a different search."}</p>
          {candidates.length === 0 && (
            <Link href={"/hr/intake" as Route} className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}>
              <UserPlus size={15} strokeWidth={2.4} /> Fill interview form
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3 max-md:hidden">Position</th>
                <th className="px-4 py-3 max-md:hidden">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 max-md:hidden">Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const tone = STATUS_TONE[c.status] ?? { bg: "var(--color-surface-soft)", fg: "#64748b" };
                return (
                  <tr key={c.id} className="border-b border-hairline last:border-0 hover:bg-surface-muted/50">
                    <td className="px-4 py-3">
                      <span className="text-[14px] font-bold text-ink-strong">{c.fullName || "Unnamed"}</span>
                    </td>
                    <td className="px-4 py-3 text-[13.5px] text-ink-muted max-md:hidden">{c.positionApplied || "—"}</td>
                    <td className="px-4 py-3 text-[12.5px] text-ink-muted max-md:hidden">
                      <div className="flex flex-col gap-0.5">
                        {c.mobile && <span className="inline-flex items-center gap-1"><Phone size={11} /> {c.mobile}</span>}
                        {c.email && <span className="inline-flex items-center gap-1 truncate"><Mail size={11} /> {c.email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold capitalize" style={{ background: tone.bg, color: tone.fg }}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-ink-subtle max-md:hidden">{new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
