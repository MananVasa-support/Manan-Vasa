"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Building2, ChevronsUpDown, Search, Check, Loader2 } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { fireToast } from "@/lib/toast";
import { setSalaryPaid } from "@/app/(app)/salary/actions";

/* Employees-module identity — matches the Attendance page. */
const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

/** Plain serializable projection of a `salary_breakup` row (server maps it). */
export interface SalaryRow {
  id: string;
  srNo: number | null;
  employeeName: string;
  designation: string | null;
  companyName: string | null;
  present: string | null;
  absent: string | null;
  halfDay: string | null;
  weeklyOff: string | null;
  totalDaysWorked: string | null;
  finalWorkingDays: string | null;
  monthlyCtc: string | null;
  payableAfterLeave: string | null;
  pt: string | null;
  payableAfterPt: string | null;
  advance: string | null;
  previousPending: string | null;
  finalPayment: string | null;
  remarks: string | null;
  mananRemarks: string | null;
  paid: boolean;
}

const inr = (v: string | null) =>
  v == null || v === "" ? "—" : `₹${Math.round(Number(v)).toLocaleString("en-IN")}`;
const dec = (v: string | null) => (v == null || v === "" ? "—" : String(Number(v)));
const num = (v: string | null) => (v == null || v === "" ? 0 : Number(v));

/* ── Column model ──────────────────────────────────────────────────────── */

type Align = "left" | "right";

interface Col {
  key: string;
  label: string;
  align: Align;
  /** First column of a visual group → hairline separator on its left. */
  groupStart?: boolean;
  sortValue?: (r: SalaryRow) => string | number;
  render: (r: SalaryRow) => React.ReactNode;
  /** Rendered in the sticky totals row (over the *filtered* set). */
  total?: (rows: SalaryRow[]) => React.ReactNode;
  minWidth?: number;
}

function DayCell({ v, danger }: { v: string | null; danger?: boolean }) {
  const n = num(v);
  return (
    <span
      className="tabular-nums text-[13.5px] font-semibold"
      style={{
        color:
          danger && n > 0
            ? "var(--color-altus-red)"
            : n === 0
              ? "var(--color-ink-subtle)"
              : "var(--color-ink-soft)",
      }}
    >
      {dec(v)}
    </span>
  );
}

function MoneyCell({
  v,
  tone = "plain",
}: {
  v: string | null;
  /** plain · strong · deduction (red when >0) · muted */
  tone?: "plain" | "strong" | "deduction" | "muted";
}) {
  const n = num(v);
  const color =
    tone === "deduction" && n > 0
      ? "var(--color-altus-red)"
      : tone === "strong"
        ? "var(--color-ink-strong)"
        : tone === "muted" || n === 0
          ? "var(--color-ink-subtle)"
          : "var(--color-ink-soft)";
  return (
    <span
      className="tabular-nums text-[13.5px]"
      style={{ color, fontWeight: tone === "strong" ? 700 : 600 }}
    >
      {tone === "deduction" && n > 0 ? `− ${inr(v)}` : inr(v)}
    </span>
  );
}

function MoneyTotal({ rows, pick, tone }: { rows: SalaryRow[]; pick: (r: SalaryRow) => string | null; tone?: "deduction" | "final" }) {
  const sum = rows.reduce((s, r) => s + num(pick(r)), 0);
  return (
    <span
      className="tabular-nums text-[13.5px] font-black"
      style={{
        color:
          tone === "deduction" && sum > 0
            ? "var(--color-altus-red)"
            : tone === "final"
              ? GREEN_DEEP
              : "var(--color-ink-strong)",
      }}
    >
      {tone === "deduction" && sum > 0 ? "− " : ""}₹{Math.round(sum).toLocaleString("en-IN")}
    </span>
  );
}

const COLUMNS: Col[] = [
  {
    key: "company",
    label: "Company",
    align: "left",
    minWidth: 130,
    sortValue: (r) => r.companyName ?? "",
    render: (r) =>
      r.companyName ? (
        <span
          className="inline-flex max-w-[180px] items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold"
          style={{
            background: "var(--color-surface-soft)",
            color: "var(--color-ink-soft)",
            boxShadow: "inset 0 0 0 1px var(--color-hairline)",
          }}
          title={r.companyName}
        >
          <Building2 size={11.5} strokeWidth={2.4} className="shrink-0 opacity-70" />
          <span className="truncate">{r.companyName}</span>
        </span>
      ) : (
        <span className="text-ink-subtle">—</span>
      ),
  },
  // ── Attendance (the sheet's own figures) ──
  { key: "present", label: "Present", align: "right", groupStart: true, sortValue: (r) => num(r.present), render: (r) => <DayCell v={r.present} /> },
  { key: "absent", label: "Absent", align: "right", sortValue: (r) => num(r.absent), render: (r) => <DayCell v={r.absent} danger /> },
  { key: "half", label: "Half", align: "right", sortValue: (r) => num(r.halfDay), render: (r) => <DayCell v={r.halfDay} /> },
  { key: "woff", label: "W-off", align: "right", sortValue: (r) => num(r.weeklyOff), render: (r) => <DayCell v={r.weeklyOff} /> },
  {
    key: "worked",
    label: "Worked",
    align: "right",
    sortValue: (r) => num(r.totalDaysWorked),
    render: (r) => (
      <span className="tabular-nums text-[13.5px] font-bold text-ink-strong">{dec(r.totalDaysWorked)}</span>
    ),
  },
  {
    key: "finalDays",
    label: "Final days",
    align: "right",
    sortValue: (r) => num(r.finalWorkingDays),
    render: (r) => (
      <span className="tabular-nums text-[13.5px] font-bold text-ink-strong">{dec(r.finalWorkingDays)}</span>
    ),
  },
  // ── Pay ──
  {
    key: "ctc",
    label: "Monthly CTC",
    align: "right",
    groupStart: true,
    minWidth: 110,
    sortValue: (r) => num(r.monthlyCtc),
    render: (r) => <MoneyCell v={r.monthlyCtc} />,
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.monthlyCtc} />,
  },
  {
    key: "afterLeave",
    label: "After leave",
    align: "right",
    minWidth: 105,
    sortValue: (r) => num(r.payableAfterLeave),
    render: (r) => <MoneyCell v={r.payableAfterLeave} />,
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.payableAfterLeave} />,
  },
  {
    key: "pt",
    label: "PT",
    align: "right",
    sortValue: (r) => num(r.pt),
    render: (r) => <MoneyCell v={r.pt} tone="deduction" />,
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.pt} tone="deduction" />,
  },
  {
    key: "afterPt",
    label: "After PT",
    align: "right",
    minWidth: 105,
    sortValue: (r) => num(r.payableAfterPt),
    render: (r) => <MoneyCell v={r.payableAfterPt} tone="strong" />,
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.payableAfterPt} />,
  },
  // ── Adjustments ──
  {
    key: "advance",
    label: "Advance",
    align: "right",
    groupStart: true,
    sortValue: (r) => num(r.advance),
    render: (r) => <MoneyCell v={r.advance} tone="deduction" />,
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.advance} tone="deduction" />,
  },
  {
    key: "prevPending",
    label: "Prev pending",
    align: "right",
    minWidth: 105,
    sortValue: (r) => num(r.previousPending),
    render: (r) => <MoneyCell v={r.previousPending} />,
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.previousPending} />,
  },
  // ── Payout ──
  {
    key: "final",
    label: "Final payment",
    align: "right",
    groupStart: true,
    minWidth: 125,
    sortValue: (r) => num(r.finalPayment),
    render: (r) => (
      <span className="tabular-nums text-[14px] font-black" style={{ color: GREEN_DEEP }}>
        {inr(r.finalPayment)}
      </span>
    ),
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.finalPayment} tone="final" />,
  },
  {
    key: "remarks",
    label: "Remarks",
    align: "left",
    groupStart: true,
    minWidth: 160,
    render: (r) => {
      const text = [r.remarks, r.mananRemarks].filter(Boolean).join(" · ");
      return text ? (
        <span className="block max-w-[240px] truncate text-[12.5px] text-ink-subtle" title={text}>
          {text}
        </span>
      ) : (
        <span className="text-ink-subtle">—</span>
      );
    },
  },
  // Super-admin-only "Paid" toggle (filtered out of visibleCols when !canMarkPaid).
  {
    key: "paid",
    label: "Paid",
    align: "left",
    groupStart: true,
    minWidth: 120,
    render: (r) => <PaidToggle row={r} />,
  },
];

/* Super-admin salary "Paid" toggle — optimistic; server action is super-admin-gated. */
function PaidToggle({ row }: { row: SalaryRow }) {
  const router = useRouter();
  const [paid, setPaid] = useState(row.paid);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    const next = !paid;
    setPaid(next);
    setBusy(true);
    const res = await setSalaryPaid(row.id, next);
    setBusy(false);
    if (!res.ok) {
      setPaid(!next);
      fireToast({ message: res.error, type: "error" });
      return;
    }
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={paid ? "Paid — tap to unmark" : "Mark as paid"}
      className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold transition disabled:opacity-60"
      style={
        paid
          ? { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, color: "#fff", boxShadow: `0 4px 12px -6px ${GREEN_DEEP}` }
          : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }
      }
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : paid ? <Check size={12} strokeWidth={3} /> : null}
      {paid ? "Paid" : "Mark paid"}
    </button>
  );
}

/* Header groups are computed inside the component (visibleGroups) so the
 * conditional Remarks + super-admin Paid groups append correctly. */

/* Sticky-header surfaces (solid enough to cover scrolled rows). */
const HEAD_BG = "rgba(248, 250, 252, 0.94)";
const GROUP_ROW_H = 30;
/* Fixed width of the frozen EMPLOYEE column → the left offset the frozen
 * COMPANY column pins to. Both stay put on horizontal scroll. */
const EMP_W = 280;

type SortState = { key: string; dir: "asc" | "desc" } | null;

/* ── The table ─────────────────────────────────────────────────────────── */

export function SalaryBreakupTable({ rows, canMarkPaid = false }: { rows: SalaryRow[]; canMarkPaid?: boolean }) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("__all");
  const [sort, setSort] = useState<SortState>(null);

  const companies = useMemo(
    () =>
      [...new Set(rows.map((r) => r.companyName).filter((c): c is string => Boolean(c)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    let out = rows;
    if (company !== "__all") out = out.filter((r) => r.companyName === company);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        `${r.employeeName} ${r.designation ?? ""} ${r.companyName ?? ""}`.toLowerCase().includes(q),
      );
    }
    if (sort) {
      const col = COLUMNS.find((c) => c.key === sort.key);
      const dir = sort.dir === "asc" ? 1 : -1;
      const sortValue =
        sort.key === "employee" ? (r: SalaryRow) => r.employeeName : col?.sortValue;
      if (sortValue) {
        out = [...out].sort((a, b) => {
          const av = sortValue(a);
          const bv = sortValue(b);
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
          return (
            String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) *
            dir
          );
        });
      }
    }
    return out;
  }, [rows, company, query, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function SortGlyph({ colKey }: { colKey: string }) {
    if (sort?.key !== colKey) return <ChevronsUpDown size={12} strokeWidth={2} className="opacity-40" />;
    return sort.dir === "asc" ? (
      <ArrowUp size={12} strokeWidth={2.8} style={{ color: GREEN_DEEP }} />
    ) : (
      <ArrowDown size={12} strokeWidth={2.8} style={{ color: GREEN_DEEP }} />
    );
  }

  const headBtn = (key: string, label: string, align: Align) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`admin-th-btn ${align === "right" ? "flex-row-reverse" : ""} ${sort?.key === key ? "text-ink-strong" : ""}`}
    >
      {label}
      <SortGlyph colKey={key} />
    </button>
  );

  const anyRemark = rows.some((r) => r.remarks || r.mananRemarks);
  // Columns: drop "remarks" when none exist, drop the super-admin "paid" toggle
  // when the viewer can't mark paid. Groups rebuilt to match (the trailing
  // Remarks + Paid groups are single-span, so they append conditionally).
  const visibleCols = COLUMNS.filter(
    (c) => (c.key !== "remarks" || anyRemark) && (c.key !== "paid" || canMarkPaid),
  );
  const visibleGroups: { label: string; span: number }[] = [
    { label: "", span: 1 }, // Company
    { label: "Attendance — days", span: 6 },
    { label: "Pay", span: 4 },
    { label: "Adjustments", span: 2 },
    { label: "Payout", span: 1 },
    ...(anyRemark ? [{ label: "", span: 1 }] : []),
    ...(canMarkPaid ? [{ label: "", span: 1 }] : []),
  ];

  return (
    <section
      className="wg-rise admin-panel"
      style={{ animationDelay: "140ms" }}
      aria-label="Salary breakup table"
    >
      {/* ── Toolbar: search · company filter · count ── */}
      <div className="admin-toolbar">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search
            size={16}
            strokeWidth={2.2}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, designation or company…"
            aria-label="Search name, designation or company"
            className="admin-search"
          />
        </div>

        {companies.length > 1 && (
          <label className="inline-flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
              Company
            </span>
            <div className="relative">
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                aria-label="Filter by company"
                className="admin-filter-select"
              >
                <option value="__all">All companies</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronsUpDown
                size={14}
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
            </div>
          </label>
        )}

        <div className="ml-auto text-[13px] font-semibold tabular-nums text-ink-subtle">
          {filtered.length} of {rows.length} employees
        </div>
      </div>

      {/* ── Grid: vertical + horizontal scroll, sticky header/first-col/totals ── */}
      <div className="max-h-[72vh] overflow-auto overscroll-contain">
        <table className="w-full min-w-[1280px] border-collapse text-[13.5px]">
          <thead>
            {/* Tier 1 — group labels */}
            <tr>
              <th
                rowSpan={2}
                scope="col"
                className="sticky left-0 top-0 z-30 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle backdrop-blur"
                style={{
                  background: HEAD_BG,
                  boxShadow: "inset -1px -1px 0 var(--color-hairline-strong)",
                  width: EMP_W,
                  minWidth: EMP_W,
                  maxWidth: EMP_W,
                }}
                aria-sort={sort?.key === "employee" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              >
                {headBtn("employee", "Employee", "left")}
              </th>
              {visibleGroups.map((g, i) => (
                <th
                  key={`${g.label}-${i}`}
                  colSpan={g.span}
                  scope="colgroup"
                  className={`sticky top-0 whitespace-nowrap px-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur ${i === 0 ? "z-30" : "z-20"}`}
                  style={{
                    background: HEAD_BG,
                    height: GROUP_ROW_H,
                    color: g.label ? GREEN_DEEP : "transparent",
                    boxShadow: i === 0
                      ? "inset -1px -1px 0 var(--color-hairline-strong)"
                      : `inset ${i > 0 ? "1px" : "0"} -1px 0 var(--color-hairline)`,
                    ...(i === 0 ? { left: EMP_W } : {}),
                  }}
                >
                  {g.label || " "}
                </th>
              ))}
            </tr>
            {/* Tier 2 — column headers */}
            <tr>
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`sticky whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle backdrop-blur ${c.key === "company" ? "z-30" : "z-20"} ${c.align === "right" ? "text-right" : "text-left"}`}
                  style={{
                    top: GROUP_ROW_H,
                    background:
                      c.key === "final"
                        ? `linear-gradient(180deg, color-mix(in srgb, ${GREEN} 9%, ${HEAD_BG}), color-mix(in srgb, ${GREEN} 6%, ${HEAD_BG}))`
                        : HEAD_BG,
                    boxShadow: c.key === "company"
                      ? "inset -1px -1px 0 var(--color-hairline-strong)"
                      : `inset ${c.groupStart ? "1px" : "0"} -1px 0 var(--color-hairline-strong)`,
                    minWidth: c.minWidth,
                    ...(c.key === "company" ? { left: EMP_W } : {}),
                  }}
                  aria-sort={
                    sort?.key === c.key
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : c.sortValue
                        ? "none"
                        : undefined
                  }
                >
                  {c.sortValue ? headBtn(c.key, c.label, c.align) : c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="px-5 py-14 text-center">
                  <p
                    className="text-ink-strong"
                    style={{
                      fontFamily: "var(--font-serif), system-ui, sans-serif",
                      fontStyle: "italic",
                      fontSize: 20,
                    }}
                  >
                    No matches
                  </p>
                  <p className="mt-1.5 text-[13.5px] text-ink-subtle">
                    {query.trim()
                      ? `Nothing matches “${query.trim()}”.`
                      : "No rows match the current filter."}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className="wg-rise group border-b border-hairline last:border-b-0 hover:bg-[color-mix(in_srgb,#16a34a_4%,transparent)]"
                  style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                >
                  {/* Sticky employee cell */}
                  <td
                    className="sticky left-0 z-10 px-4 py-2.5 group-hover:bg-[color-mix(in_srgb,#16a34a_4%,var(--color-surface-card))]"
                    style={{
                      background: "var(--color-surface-card)",
                      boxShadow: "inset -1px 0 0 var(--color-hairline-strong)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-right text-[11px] font-bold tabular-nums text-ink-subtle">
                        {r.srNo ?? i + 1}
                      </span>
                      <EmployeeAvatar
                        name={r.employeeName}
                        size="sm"
                        background={`linear-gradient(135deg, ${GREEN}, #166534)`}
                      />
                      <div className="min-w-0 leading-tight">
                        <div className="truncate text-[14px] font-bold text-ink-strong">
                          {r.employeeName}
                        </div>
                        {r.designation && (
                          <div className="truncate text-[11.5px] font-medium text-ink-subtle">
                            {r.designation}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {visibleCols.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-3 py-2.5 ${c.key === "company" ? "sticky z-10 group-hover:bg-[color-mix(in_srgb,#16a34a_4%,var(--color-surface-card))]" : ""} ${c.align === "right" ? "text-right" : "text-left"}`}
                      style={{
                        boxShadow:
                          c.key === "company"
                            ? "inset -1px 0 0 var(--color-hairline-strong)"
                            : c.groupStart
                              ? "inset 1px 0 0 var(--color-hairline)"
                              : undefined,
                        background:
                          c.key === "company"
                            ? "var(--color-surface-card)"
                            : c.key === "final"
                              ? `color-mix(in srgb, ${GREEN} 5%, transparent)`
                              : undefined,
                        ...(c.key === "company" ? { left: EMP_W } : {}),
                      }}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>

          {/* ── Sticky totals footer (over the filtered set) ── */}
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                <td
                  className="sticky bottom-0 left-0 z-30 px-4 py-3 backdrop-blur"
                  style={{
                    background: HEAD_BG,
                    boxShadow: "inset -1px 1px 0 var(--color-hairline-strong)",
                  }}
                >
                  <span className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-strong">
                    Totals
                  </span>
                  <span className="ml-2 text-[11px] font-semibold tabular-nums text-ink-subtle">
                    {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
                  </span>
                </td>
                {visibleCols.map((c) => (
                  <td
                    key={c.key}
                    className={`sticky bottom-0 whitespace-nowrap px-3 py-3 backdrop-blur ${c.key === "company" ? "z-30" : "z-20"} ${c.align === "right" ? "text-right" : "text-left"}`}
                    style={{
                      background:
                        c.key === "final"
                          ? `color-mix(in srgb, ${GREEN} 9%, ${HEAD_BG})`
                          : HEAD_BG,
                      boxShadow: c.key === "company"
                        ? "inset -1px 1px 0 var(--color-hairline-strong)"
                        : `inset ${c.groupStart ? "1px" : "0"} 1px 0 var(--color-hairline-strong)`,
                      ...(c.key === "company" ? { left: EMP_W } : {}),
                    }}
                  >
                    {c.total ? c.total(filtered) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
