"use client";

import * as React from "react";
import {
  ChevronDown,
  Download,
  Share2,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircle,
  Link2,
  Loader2,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { VasaCell } from "@/lib/queries/accounts-vasa";
import { emailVasaSnapshot } from "@/app/(app)/accounts/vasa-family-interpersonal/actions";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function fmt(n: number): string {
  if (n === 0) return "0";
  const s = inr.format(Math.abs(n));
  return n < 0 ? `-${s}` : s;
}

/**
 * Per-snapshot download URL, keyed by the ROW's own date.
 *
 * Never by whatever the Sheet view happens to have open — that is the one way a
 * download or share quietly hands over the wrong report, and on a reconciliation
 * sheet a wrong-but-plausible file is worse than no file.
 */
function downloadHref(asOn: string, format: "xlsx" | "csv"): string {
  const qs = new URLSearchParams({ asOn, format });
  return `/accounts/vasa-family-interpersonal/export?${qs}`;
}

/**
 * LIST VIEW — every saved snapshot as one row, not one matrix.
 *
 * Created date · sheet name · quarter · Download · Share. A row expands in place
 * to the full matrix for THAT snapshot, so history can be reviewed without
 * leaving the list. Everything here is READ-ONLY by construction: there is no
 * input in this component, so the list can never become a second, unguarded way
 * to edit a historical report.
 */
export function VasaSnapshotList({
  snapshots,
  cells,
  parties,
  labelOf,
  nameOf,
  quarterOf,
}: {
  snapshots: string[];
  cells: VasaCell[];
  parties: string[];
  labelOf: (s: string) => string;
  nameOf: (s: string) => string;
  quarterOf: (s: string) => string;
}) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState<string | null>(null);

  const byKey = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) {
      if (c.asOn) m.set(`${c.asOn}|${c.party}|${c.counterparty}`, Number(c.amount));
    }
    return m;
  }, [cells]);

  async function emailIt(asOn: string) {
    setSending(asOn);
    setMenu(null);
    const res = await emailVasaSnapshot({ asOn });
    setSending(null);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `${labelOf(asOn)} emailed to ${res.sentTo}.`, type: "success" });
  }

  function shareLink(asOn: string, via: "whatsapp" | "copy") {
    setMenu(null);
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const url = `${origin}${downloadHref(asOn, "xlsx")}`;
    const text = `Vasa Family Interpersonal Balance — ${labelOf(asOn)} (${quarterOf(asOn)}): ${url}`;
    if (via === "whatsapp") {
      // A LINK, not the file: WhatsApp cannot take an attachment from a URL, and
      // the link resolves to this exact snapshot behind the same access check.
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      return;
    }
    void navigator.clipboard?.writeText(text).then(
      () => fireToast({ message: "Link copied.", type: "success" }),
      () => fireToast({ message: "Could not copy.", type: "error" }),
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-section border border-hairline bg-surface-card px-6 py-14 text-center">
        <FileSpreadsheet size={22} className="mx-auto mb-3 text-ink-subtle" aria-hidden />
        <p className="text-[15px] font-bold text-ink-strong">No snapshots in this quarter</p>
        <p className="mt-1 text-[13px] text-ink-subtle">
          Use New Snapshot on the Sheet tab to start one.
        </p>
      </div>
    );
  }

  const COLS = "132px 1fr 108px auto";

  return (
    <div
      className="overflow-hidden rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div
        className="grid items-center gap-3 border-b border-hairline px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle"
        style={{ background: "var(--color-surface-soft)", gridTemplateColumns: COLS }}
      >
        <span>Created</span>
        <span>Sheet</span>
        <span>Period</span>
        <span className="text-right">Actions</span>
      </div>

      <ul>
        {snapshots.map((s) => {
          const expanded = open === s;
          return (
            <li key={s} className="border-b border-hairline last:border-b-0">
              <div
                className="grid items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-soft"
                style={{ gridTemplateColumns: COLS }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s)}
                  aria-expanded={expanded}
                  className="flex items-center gap-1.5 text-left text-[13.5px] font-bold tabular-nums text-ink-strong"
                >
                  <ChevronDown
                    size={14}
                    strokeWidth={2.6}
                    aria-hidden
                    className="shrink-0 text-ink-subtle transition-transform duration-200"
                    style={{ transform: expanded ? "rotate(180deg)" : "none" }}
                  />
                  {labelOf(s)}
                </button>

                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s)}
                  className="truncate text-left text-[13.5px] font-semibold text-ink-soft"
                >
                  {nameOf(s)}
                </button>

                <span className="text-[12.5px] font-bold text-ink-subtle">{quarterOf(s)}</span>

                <span className="relative flex items-center justify-end gap-1.5">
                  <a
                    href={downloadHref(s, "xlsx")}
                    title={`Download ${labelOf(s)} as Excel`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red"
                  >
                    <Download size={14} strokeWidth={2.4} /> xlsx
                  </a>
                  <a
                    href={downloadHref(s, "csv")}
                    title={`Download ${labelOf(s)} as CSV`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red"
                  >
                    <FileText size={14} strokeWidth={2.4} /> csv
                  </a>

                  <button
                    type="button"
                    onClick={() => setMenu(menu === s ? null : s)}
                    disabled={sending === s}
                    aria-haspopup="menu"
                    aria-expanded={menu === s}
                    title={`Share ${labelOf(s)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50"
                  >
                    {sending === s ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Share2 size={14} strokeWidth={2.4} />
                    )}{" "}
                    Share
                  </button>

                  {menu === s && (
                    <>
                      {/* Click-away catcher. A plain overlay rather than a
                          document listener, which would also swallow the first
                          click on another row's Share button. */}
                      <span
                        className="fixed inset-0 z-40"
                        onClick={() => setMenu(null)}
                        aria-hidden
                      />
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-hairline-strong bg-white py-1"
                        style={{ boxShadow: "0 12px 32px rgba(15,23,42,0.16)" }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void emailIt(s)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
                        >
                          <Mail size={14} strokeWidth={2.4} /> Email the .xlsx
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => shareLink(s, "whatsapp")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
                        >
                          <MessageCircle size={14} strokeWidth={2.4} /> WhatsApp a link
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => shareLink(s, "copy")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
                        >
                          <Link2 size={14} strokeWidth={2.4} /> Copy link
                        </button>
                      </div>
                    </>
                  )}
                </span>
              </div>

              {expanded && (
                <div
                  className="overflow-x-auto border-t border-hairline px-4 py-3"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <table className="border-collapse text-right text-[12.5px]" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th
                          className="px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle"
                          style={{ minWidth: 130 }}
                        >
                          Party
                        </th>
                        {parties.map((c) => (
                          <th
                            key={c}
                            className="whitespace-nowrap px-2.5 py-2 text-right text-[11.5px] font-bold text-ink-soft"
                          >
                            {c}
                          </th>
                        ))}
                        <th className="px-2.5 py-2 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parties.map((row) => {
                        let net = 0;
                        for (const col of parties) {
                          if (col === row) continue;
                          const v = byKey.get(`${s}|${row}|${col}`);
                          if (v !== undefined) net += v;
                        }
                        return (
                          <tr key={row} style={{ borderTop: "1px solid var(--color-hairline)" }}>
                            <th className="whitespace-nowrap px-2.5 py-1.5 text-left font-bold text-ink-strong">
                              {row}
                            </th>
                            {parties.map((col) => {
                              if (row === col) {
                                return (
                                  <td key={col} className="px-2.5 py-1.5 text-center text-ink-subtle">
                                    —
                                  </td>
                                );
                              }
                              const v = byKey.get(`${s}|${row}|${col}`);
                              return (
                                <td
                                  key={col}
                                  className="px-2.5 py-1.5 tabular-nums"
                                  style={{
                                    color:
                                      v === undefined || v === 0
                                        ? "var(--color-ink-subtle)"
                                        : v < 0
                                          ? "var(--color-altus-red)"
                                          : "var(--color-green-deep)",
                                  }}
                                >
                                  {v === undefined ? "" : fmt(v)}
                                </td>
                              );
                            })}
                            <td
                              className="px-2.5 py-1.5 font-bold tabular-nums"
                              style={{
                                color:
                                  net > 0
                                    ? "var(--color-green-deep)"
                                    : net < 0
                                      ? "var(--color-altus-red)"
                                      : "var(--color-ink-subtle)",
                              }}
                            >
                              {net === 0 ? "—" : fmt(net)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
