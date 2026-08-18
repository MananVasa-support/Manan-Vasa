"use client";

import * as React from "react";
import { Users } from "lucide-react";
import {
  ALLOCATION_PRODUCTS,
  allocationProductLabel,
  allocationProductCode,
} from "@/db/enums";
import { DateField } from "@/components/ui/date-field";
import type { AllocationRow } from "@/lib/queries/billing-allocation";

/**
 * PEOPLE ALLOCATION › DASHBOARD — how many people each lead carries, broken
 * down by product.
 *
 * Two independent boards, one per team, because the same person can lead an App
 * team and sit on a Handholding team: rolling them together would double-count
 * and answer neither question.
 *
 * COUNTING RULE, and it matters for reading the numbers: every count is of
 * DISTINCT PEOPLE. Someone staffed under the same lead on three clients is one
 * person, not three. A person working on two products is counted under BOTH, so
 * the product rows can legitimately sum to more than the lead's total — the
 * total is people, the rows are people-per-product.
 */

const PURPLE = "#9333ea";
const TEAL = "#0F766E";
const ORANGE = "#ea580c";
const ORANGE_DEEP = "#c2410c";

const inputCls =
  "w-full rounded-xl border border-hairline-strong bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#9333ea]/50";

type Team = "app" | "handholding";

interface ProductCount {
  code: string;
  label: string;
  short: string;
  people: number;
}

interface LeadSummary {
  leadId: string;
  leadName: string;
  total: number;
  clients: number;
  products: ProductCount[];
}

/** Roll the filtered allocations up by lead, then by product within each lead. */
function summarise(rows: AllocationRow[], team: Team): LeadSummary[] {
  const byLead = new Map<
    string,
    { name: string; people: Set<string>; clients: Set<string>; perProduct: Map<string, Set<string>> }
  >();

  for (const r of rows) {
    const leadId = team === "app" ? r.appLeadId : r.handholdingLeadId;
    const leadName = team === "app" ? r.appLeadName : r.handholdingLeadName;
    const memberIds = team === "app" ? r.appMemberIds : r.handholdingMemberIds;
    if (!leadId) continue;

    const e =
      byLead.get(leadId) ??
      { name: leadName ?? "Unknown", people: new Set<string>(), clients: new Set<string>(), perProduct: new Map<string, Set<string>>() };

    for (const m of memberIds) e.people.add(m);
    e.clients.add(r.clientId);
    for (const s of r.scopes) {
      const set = e.perProduct.get(s.scope) ?? new Set<string>();
      for (const m of memberIds) set.add(m);
      e.perProduct.set(s.scope, set);
    }
    byLead.set(leadId, e);
  }

  return [...byLead.entries()]
    .map(([leadId, v]) => ({
      leadId,
      leadName: v.name,
      total: v.people.size,
      clients: v.clients.size,
      products: [...v.perProduct.entries()]
        .map(([code, set]) => ({
          code,
          label: allocationProductLabel(code),
          short: allocationProductCode(code),
          people: set.size,
        }))
        .sort((a, b) => b.people - a.people || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.total - a.total || a.leadName.localeCompare(b.leadName));
}

/** The three views of this one page. Tabs, not routes — same data, same filters. */
const VIEWS = [
  { id: "all", label: "Dashboard" },
  { id: "app", label: "Apps" },
  { id: "handholding", label: "Handholding" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export function AllocationDashboard({ rows }: { rows: AllocationRow[] }) {
  const [view, setView] = React.useState<View>("all");
  const [q, setQ] = React.useState("");
  const [leadFilter, setLeadFilter] = React.useState("");
  const [productFilter, setProductFilter] = React.useState("");
  const [codeFilter, setCodeFilter] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const leads = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.appLeadId) m.set(r.appLeadId, r.appLeadName ?? "Unknown");
      if (r.handholdingLeadId) m.set(r.handholdingLeadId, r.handholdingLeadName ?? "Unknown");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const productsInUse = React.useMemo(
    () => [...new Set(rows.flatMap((r) => r.scopes.map((s) => s.scope)))],
    [rows],
  );
  const productOptions = React.useMemo(() => {
    const seen = new Map<string, { code: string; label: string; short: string }>();
    for (const p of ALLOCATION_PRODUCTS) seen.set(p.code, { code: p.code, label: p.label, short: p.short });
    for (const c of productsInUse) {
      if (!seen.has(c)) seen.set(c, { code: c, label: allocationProductLabel(c), short: allocationProductCode(c) });
    }
    return [...seen.values()];
  }, [productsInUse]);

  /**
   * Filters narrow the ALLOCATIONS; both boards are then rolled up from what
   * survives, so every number on the page moves together.
   *
   * A product / code / date filter also narrows the SCOPE LINES inside each
   * allocation — otherwise filtering to one product would still show the other
   * products' rows underneath the lead.
   */
  const filtered = React.useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows
      .filter(
        (r) =>
          (!leadFilter || r.appLeadId === leadFilter || r.handholdingLeadId === leadFilter) &&
          (!n ||
            r.clientName.toLowerCase().includes(n) ||
            (r.appLeadName ?? "").toLowerCase().includes(n) ||
            (r.handholdingLeadName ?? "").toLowerCase().includes(n) ||
            r.appMemberNames.some((m) => m.toLowerCase().includes(n)) ||
            r.handholdingMemberNames.some((m) => m.toLowerCase().includes(n))),
      )
      .map((r) => ({
        ...r,
        scopes: r.scopes.filter(
          (s) =>
            (!productFilter || s.scope === productFilter) &&
            (!codeFilter || allocationProductCode(s.scope) === codeFilter) &&
            // Period — inclusive, either end optional, matched on the line's
            // Start Date / End Date.
            (!from || (s.dueDate ?? "") >= from) &&
            (!to || (s.actualDate ?? s.dueDate ?? "") <= to),
        ),
      }))
      // Once a product or period filter is on, an allocation with no surviving
      // line is not part of the answer.
      .filter((r) => (!productFilter && !codeFilter && !from && !to) || r.scopes.length > 0);
  }, [rows, q, leadFilter, productFilter, codeFilter, from, to]);

  const app = React.useMemo(() => summarise(filtered, "app"), [filtered]);
  const hh = React.useMemo(() => summarise(filtered, "handholding"), [filtered]);

  // Distinct people in the ACTIVE view — both teams on Dashboard, one team on
  // the Apps / Handholding tabs. Someone on both teams still counts once.
  const overall = React.useMemo(() => {
    const all = new Set<string>();
    for (const r of filtered) {
      if (view !== "handholding") for (const m of r.appMemberIds) all.add(m);
      if (view !== "app") for (const m of r.handholdingMemberIds) all.add(m);
    }
    return all.size;
  }, [filtered, view]);

  const filtersActive = !!q || !!leadFilter || !!productFilter || !!codeFilter || !!from || !!to;

  function clearAll() {
    setQ("");
    setLeadFilter("");
    setProductFilter("");
    setCodeFilter("");
    setFrom("");
    setTo("");
  }

  return (
    <section className="mb-6">
      {/* Three views of the SAME page — the filters and the data below are
          shared, only which board(s) are shown changes. */}
      <div
        className="mb-4 inline-flex gap-1.5 rounded-pill p-1.5"
        role="tablist"
        aria-label="Dashboard view"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      >
        {VIEWS.map((v) => {
          const on = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(v.id)}
              className="rounded-pill px-7 py-2.5 text-[15.5px] font-extrabold tracking-tight transition-colors"
              style={
                on
                  ? { background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})`, color: "#fff" }
                  : { color: "var(--color-ink-soft)" }
              }
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/*
        `overflow-x-auto` keeps the six filters on one row, but it also CLIPS
        anything drawn outside the content box — and the focus ring is drawn
        outside. That cropped the ring on the first and last controls (Search and
        End Date) and along the top edge. The inner padding gives the ring room;
        the matching negative margin means the row still sits exactly where it did.
      */}
      <div className="-mx-1 -mt-1 mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1 pt-1">
        <div className="w-[200px] shrink-0">
          <input
            className={inputCls}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search person or client…"
            aria-label="Search allocations"
          />
        </div>
        <div className="w-[186px] shrink-0">
          <select className={inputCls} value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} aria-label="Filter by consultant or lead">
            <option value="">All consultants / leads</option>
            {leads.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <div className="w-[210px] shrink-0">
          <select className={inputCls} value={productFilter} onChange={(e) => setProductFilter(e.target.value)} aria-label="Filter by product">
            <option value="">All products</option>
            {productOptions.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="w-[120px] shrink-0">
          <select className={inputCls} value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} aria-label="Filter by product code">
            <option value="">All codes</option>
            {[...new Set(productOptions.map((p) => p.short))].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="w-[165px] shrink-0">
          <DateField className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Start date" />
        </div>
        <div className="w-[165px] shrink-0">
          <DateField className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} aria-label="End date" />
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={clearAll}
            className="wg-btn shrink-0 rounded-pill px-3.5 py-2 text-[12.5px] font-bold"
            style={{
              background: "var(--color-surface-card)",
              color: "var(--color-ink-soft)",
              boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Overall headline — the whole picture before the two boards split it. */}
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-surface-card px-5 py-4"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        aria-label="Overall totals"
      >
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Total People Allocated</div>
          <div className="text-[30px] font-extrabold leading-none tracking-tight text-ink-strong">{overall}</div>
        </div>
        <div className="flex flex-wrap gap-4 text-[12.5px] font-semibold text-ink-subtle">
          <span>{filtered.length} of {rows.length} allocations</span>
          {view !== "handholding" && <span>{app.length} app {app.length === 1 ? "lead" : "leads"}</span>}
          {view !== "app" && <span>{hh.length} HH {hh.length === 1 ? "consultant" : "consultants"}</span>}
        </div>
      </div>

      <div className={view === "all" ? "grid gap-5 lg:grid-cols-2" : "grid gap-5"}>
        {view !== "handholding" && (
          <Board title="Apps Dashboard" role="App Lead" tone={PURPLE} leads={app} wide={view === "app"} />
        )}
        {view !== "app" && (
          <Board title="Handholding Dashboard" role="HH Consultant" tone={TEAL} leads={hh} wide={view === "handholding"} />
        )}
      </div>
    </section>
  );
}

function Board({
  title,
  role,
  tone,
  leads,
  wide = false,
}: {
  title: string;
  role: string;
  tone: string;
  leads: LeadSummary[];
  /** True when this board has the page to itself. */
  wide?: boolean;
}) {
  return (
    <div
      className="rounded-[22px] bg-surface-card p-5"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      aria-label={`${title}`}
    >
      <h2 className="mb-4 text-[15px] font-extrabold" style={{ color: tone }}>
        {title}
      </h2>

      {leads.length === 0 ? (
        <p
          className="rounded-xl px-3 py-6 text-center text-[13.5px] text-ink-subtle"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          No one staffed on this team for the current filters.
        </p>
      ) : (
        <ul className={wide ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-3"}>
          {leads.map((l) => (
            <li key={l.leadId} className="rounded-xl p-3.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
              {/* Total sits ABOVE the name — the count is the headline. */}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div
                    className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11.5px] font-bold"
                    style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
                  >
                    <Users size={11} strokeWidth={2.8} /> Total People: {l.total}
                  </div>
                  <div className="mt-1 text-[16px] font-extrabold tracking-tight text-ink-strong">{l.leadName}</div>
                  <div className="text-[11.5px] font-semibold text-ink-subtle">
                    {role} · {l.clients} {l.clients === 1 ? "client" : "clients"}
                  </div>
                </div>
              </div>

              {l.products.length > 0 && (
                <table className="mt-2.5 w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                      <th className="py-1.5">Product</th>
                      <th className="py-1.5 w-[70px]">Code</th>
                      <th className="py-1.5 w-[60px] text-right">People</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.products.map((p) => (
                      <tr key={p.code} className="border-t border-hairline">
                        <td className="py-1.5 pr-2">{p.label}</td>
                        <td className="py-1.5">
                          <span
                            className="inline-flex rounded-pill px-2 py-0.5 text-[11px] font-bold"
                            style={{ background: `color-mix(in srgb, ${tone} 10%, transparent)`, color: tone }}
                          >
                            {p.short}
                          </span>
                        </td>
                        <td className="py-1.5 text-right font-bold tabular-nums">{p.people}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
