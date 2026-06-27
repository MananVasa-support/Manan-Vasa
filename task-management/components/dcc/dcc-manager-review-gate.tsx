"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Users, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import type { DccManagerReviewState } from "@/lib/dcc/gate";
import { setDccReview, approveAllDccReviews } from "@/app/(app)/dcc/actions";

function fmtLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export function DccManagerReviewGate({ greetingName, state }: { greetingName: string; state: DccManagerReviewState }) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [reviewed, setReviewed] = React.useState<Record<string, "approved" | "needs_rework">>(() => {
    const m: Record<string, "approved" | "needs_rework"> = {};
    for (const r of state.reports) if (r.reviewed) m[r.id] = "approved";
    return m;
  });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [bulk, setBulk] = React.useState(false);

  const remaining = state.reports.filter((r) => !reviewed[r.id]).length;

  function review(ownerId: string, status: "approved" | "needs_rework") {
    setReviewed((m) => ({ ...m, [ownerId]: status }));
    setBusy(ownerId);
    startTransition(async () => {
      const res = await setDccReview({ ownerEmployeeId: ownerId, date: state.date, status });
      setBusy((b) => (b === ownerId ? null : b));
      if (!res.ok) { setReviewed((m) => { const n = { ...m }; delete n[ownerId]; return n; }); fireToast({ message: res.error, type: "error" }); }
    });
  }

  function approveAll() {
    setBulk(true);
    startTransition(async () => {
      const res = await approveAllDccReviews({ date: state.date });
      if (!res.ok) { setBulk(false); fireToast({ message: res.error, type: "error" }); return; }
      setReviewed(() => { const m: Record<string, "approved" | "needs_rework"> = {}; for (const r of state.reports) m[r.id] = "approved"; return m; });
      fireToast({ message: "All approved.", type: "success" });
    });
  }

  function finish() { startTransition(() => router.refresh()); }

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-gradient-to-b from-[#F4EEE3] to-[#FBF7F0]">
      <div className="mx-auto w-full max-w-[860px] px-6 max-md:px-4 pt-10 pb-28">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-white px-4 py-1.5 text-[13px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "var(--color-altus-red-deep)" }}>
            <Users size={16} /> Team review
          </span>
          <h1 className="mt-4 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.03em", lineHeight: 1.04 }}>
            Review your team, {greetingName}.
          </h1>
          <p className="mt-3 text-[17px] font-semibold text-ink-muted">Sign off each report's DCC for <span className="text-ink-strong">{fmtLong(state.date)}</span>.</p>
        </div>

        <div className="mt-7 flex items-center justify-between gap-3 rounded-2xl border border-hairline-strong bg-white px-5 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <span className="text-[15px] font-bold text-ink-muted">{remaining === 0 ? "Everyone reviewed" : `${remaining} of ${state.reports.length} left`}</span>
          <button onClick={approveAll} disabled={bulk || remaining === 0} className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[14.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red disabled:opacity-40">
            {bulk ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Approve all
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-hairline-strong bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {state.reports.map((r, i) => {
            const v = reviewed[r.id];
            const pct = r.due ? Math.round((r.done / r.due) * 100) : -1;
            return (
              <div key={r.id} className={`flex items-center gap-3 px-4 py-3.5 max-md:flex-wrap ${i === 0 ? "" : "border-t border-hairline"}`}>
                <Avatar name={r.name} avatarUrl={r.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold text-ink-strong">{r.name}</p>
                  <p className="text-[13px] font-semibold text-ink-subtle">{r.done}/{r.due} done {pct >= 0 ? `· ${pct}%` : ""}</p>
                </div>
                <Link href={`/dcc?emp=${r.id}` as Route} className="grid h-9 w-9 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-[color:var(--color-surface-track,#eef2f7)]" title="Open their DCC"><ExternalLink size={16} /></Link>
                <button onClick={() => review(r.id, "approved")} className="rounded-xl px-4 py-2.5 text-[14.5px] font-bold transition-colors" style={v === "approved" ? { background: "var(--color-green)", color: "white" } : { background: "white", color: "var(--color-green-deep)", border: "1px solid var(--color-hairline-strong)" }}>✓ Approve</button>
                <button onClick={() => review(r.id, "needs_rework")} className="rounded-xl px-4 py-2.5 text-[14.5px] font-bold transition-colors" style={v === "needs_rework" ? { background: "var(--color-altus-red)", color: "white" } : { background: "white", color: "var(--color-altus-red-deep)", border: "1px solid var(--color-hairline-strong)" }}>Needs rework</button>
                {busy === r.id && <Loader2 size={16} className="animate-spin text-ink-subtle" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-hairline-strong bg-white/95 backdrop-blur px-6 py-4">
        <div className="mx-auto flex max-w-[860px] items-center justify-between gap-4">
          <span className="text-[15px] font-bold text-ink-muted">{remaining === 0 ? "All reviewed 🎉" : `${remaining} report${remaining === 1 ? "" : "s"} to review`}</span>
          <button onClick={finish} disabled={remaining > 0} className="inline-flex items-center gap-2 rounded-xl bg-altus-red px-6 py-3 text-[16px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40">
            <CheckCircle2 size={18} /> Continue
          </button>
        </div>
      </div>
    </div>
  );
}
