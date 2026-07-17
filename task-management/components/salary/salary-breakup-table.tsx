"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Building2, ChevronsUpDown, Search, Check, Loader2, FileDown } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { fireToast } from "@/lib/toast";
import { setSalaryPaid, setSalaryNote, setWaiveOff, setPayoutAdjustment } from "@/app/(app)/salary/actions";
import { perDayRate, waiveAddBack } from "@/lib/salary/waive-off";

/* Employees-module identity — matches the Attendance page. */
const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

/** Plain serializable projection of a `salary_breakup` row (server maps it). */
export interface SalaryRow {
  id: string;
  /** The employee id — powers the downloadable payslip PDF link. */
  employeeId: string | null;
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
  /** Calendar days in the month (sheet col) — denominator for the per-day rate. */
  daysInMonth: string | null;
  monthlyCtc: string | null;
  payableAfterLeave: string | null;
  pt: string | null;
  payableAfterPt: string | null;
  advance: string | null;
  previousPending: string | null;
  finalPayment: string | null;
  paid: boolean;
  /** Editable super-admin note (admin_note). Shown in the Remarks column —
   *  the imported joining-date `remarks`/`manan_remarks` are intentionally NOT
   *  projected to the client. */
  adminNote: string | null;
  /** Super-admin "Wave-Off" GRANT: how many attendance days to condone. The view
   *  adds them back at the per-day rate to reduce the deduction. Additive to the
   *  DISPLAYED net only — the base amounts are never mutated. */
  waiveOffDays: string | null;
  waiveOffNote: string | null;
  /** Super-admin signed pre-payout adjustment (+extra / −deduct), Sir #37. */
  payoutAdjustment: string | null;
  payoutAdjustmentNote: string | null;
}

// perDayRate + waiveAddBack now come from the shared @/lib/salary/waive-off so the
// net-to-pay can never drift between the table, CSV, payroll PDF and mobile.

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
  // Super-admin-only "Wave-Off" GRANT — condone N days; the net is recomputed
  // (final payment + days × per-day rate). Rendered by the component (needs the
  // canWaiveOff flag); placeholder here is replaced in the body. Filtered out of
  // visibleCols when !canWaiveOff.
  {
    key: "waiveOff",
    label: "Wave-Off",
    align: "left",
    groupStart: true,
    minWidth: 168,
    sortValue: (r) => num(r.waiveOffDays),
    render: () => null,
    // Footer: total rupees waived back across the filtered set.
    total: (rows) => {
      const sum = rows.reduce((s, r) => s + waiveAddBack(r), 0);
      if (sum <= 0) return null;
      return (
        <span className="tabular-nums text-[13px] font-black" style={{ color: "#166534" }}>
          + ₹{Math.round(sum).toLocaleString("en-IN")}
        </span>
      );
    },
  },
  // Super-admin-only pre-payout ADJUSTMENT (+extra / −deduct), Sir #37. Rendered
  // by the component (needs canWaiveOff); filtered out of visibleCols otherwise.
  {
    key: "payoutAdj",
    label: "Adjustment",
    align: "left",
    groupStart: true,
    minWidth: 168,
    sortValue: (r) => num(r.payoutAdjustment),
    render: () => null,
    total: (rows) => {
      const sum = rows.reduce((s, r) => s + num(r.payoutAdjustment), 0);
      if (sum === 0) return null;
      return (
        <span className="tabular-nums text-[13px] font-black" style={{ color: sum >= 0 ? "#166534" : "#b91c1c" }}>
          {sum >= 0 ? "+" : "−"} ₹{Math.abs(Math.round(sum)).toLocaleString("en-IN")}
        </span>
      );
    },
  },
  // Super-admin-only "Paid" toggle (filtered out of visibleCols when !canMarkPaid).
  // Sortable → paid rows group together. Unpaid sorts before paid ascending.
  {
    key: "paid",
    label: "Paid",
    align: "left",
    groupStart: true,
    minWidth: 120,
    sortValue: (r) => (r.paid ? 1 : 0),
    render: (r) => <PaidToggle row={r} />,
  },
  // Editable super-admin NOTE (admin_note) — pinned to the extreme end. Shows the
  // note (not the imported joining-date remarks). Rendered by the component so it
  // can read the canEditNote flag; placeholder cell here is replaced in the body.
  {
    key: "remarks",
    label: "Remarks",
    align: "left",
    groupStart: true,
    minWidth: 220,
    render: () => null,
  },
  // Extreme-right — a downloadable PDF payslip (salary + attendance + incentives).
  // Rendered by the component (needs the `month`); always shown.
  {
    key: "payslip",
    label: "Payslip",
    align: "left",
    groupStart: true,
    minWidth: 120,
    render: () => null,
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

/* Editable "Remarks" note — super-admins type an inline note (admin_note);
 * everyone else sees it read-only. Optimistic; saves on blur / Enter, reverts on
 * Escape or error. Shows the note, never the imported joining-date remarks. */
function RemarkCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const router = useRouter();
  const [val, setVal] = useState(row.adminNote ?? "");
  const [saved, setSaved] = useState(row.adminNote ?? "");
  const [busy, setBusy] = useState(false);

  if (!editable) {
    return saved ? (
      <span className="block max-w-[300px] truncate text-[12.5px] text-ink-soft" title={saved}>
        {saved}
      </span>
    ) : (
      <span className="text-ink-subtle">—</span>
    );
  }

  async function commit() {
    const next = val.trim();
    if (next === saved.trim()) {
      setVal(next);
      return;
    }
    setBusy(true);
    const res = await setSalaryNote(row.id, next);
    setBusy(false);
    if (!res.ok) {
      setVal(saved);
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setSaved(next);
    setVal(next);
    router.refresh();
  }

  return (
    <input
      type="text"
      value={val}
      disabled={busy}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setVal(saved);
          e.currentTarget.blur();
        }
      }}
      placeholder="Add a note…"
      aria-label={`Note for ${row.employeeName}`}
      className="w-full min-w-[190px] rounded-md border border-transparent bg-transparent px-2 py-1 text-[12.5px] text-ink-soft transition-colors placeholder:text-ink-subtle hover:border-hairline focus:border-[color-mix(in_srgb,#E10600_55%,transparent)] focus:bg-surface-card focus:outline-none disabled:opacity-60"
    />
  );
}

/* Super-admin "Wave-Off" grant — type how many attendance days to CONDONE for a
 * person; the salary is recalculated (final payment + days × per-day rate), i.e.
 * "your money isn't deducted". A GRANT, not a raw-amount edit: the stored base
 * numbers never change — only the displayed net. Optimistic; saves on blur /
 * Enter, reverts on Escape or error. Read-only for everyone but super-admins. */
function WaiveOffCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const router = useRouter();
  const initial = row.waiveOffDays == null || Number(row.waiveOffDays) === 0 ? "" : dec(row.waiveOffDays);
  const [val, setVal] = useState(initial);
  const [savedDays, setSavedDays] = useState(num(row.waiveOffDays));
  const [busy, setBusy] = useState(false);

  const perDay = perDayRate(row);
  // Editable → preview from the live input; read-only → the stored grant.
  const days = editable ? Math.max(0, Number(val) || 0) : savedDays;
  const addBack = days > 0 ? days * perDay : 0;
  const newNet = num(row.finalPayment) + addBack;

  const delta =
    addBack > 0 ? (
      <div className="mt-1 leading-tight">
        <span className="tabular-nums text-[11.5px] font-bold" style={{ color: "#166534" }}>
          + ₹{Math.round(addBack).toLocaleString("en-IN")} waived
        </span>
        <span
          className="ml-1.5 tabular-nums text-[11.5px] font-black"
          style={{ color: GREEN_DEEP }}
          title="Net after wave-off (final payment + condoned days)"
        >
          → ₹{Math.round(newNet).toLocaleString("en-IN")}
        </span>
      </div>
    ) : null;

  if (!editable) {
    return savedDays > 0 ? (
      <div>
        <span className="tabular-nums text-[12.5px] font-bold text-ink-soft">
          {dec(row.waiveOffDays)} {num(row.waiveOffDays) === 1 ? "day" : "days"}
        </span>
        {delta}
      </div>
    ) : (
      <span className="text-ink-subtle">—</span>
    );
  }

  async function commit() {
    const nextDays = Math.round(Math.max(0, Number(val) || 0) * 100) / 100;
    if (nextDays === savedDays) {
      setVal(nextDays === 0 ? "" : String(nextDays));
      return;
    }
    setBusy(true);
    const res = await setWaiveOff({ rowId: row.id, days: nextDays });
    setBusy(false);
    if (!res.ok) {
      setVal(savedDays === 0 ? "" : String(savedDays));
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setSavedDays(nextDays);
    setVal(nextDays === 0 ? "" : String(nextDays));
    router.refresh();
  }

  return (
    <div>
      <div className="inline-flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          max={366}
          step="0.5"
          inputMode="decimal"
          value={val}
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setVal(savedDays === 0 ? "" : String(savedDays));
              e.currentTarget.blur();
            }
          }}
          placeholder="0"
          aria-label={`Wave off days for ${row.employeeName} — your money isn't deducted`}
          title="Condone attendance days — your money isn't deducted"
          className="w-[54px] rounded-md border border-hairline bg-surface-card px-2 py-1 text-right text-[12.5px] font-bold tabular-nums text-ink-strong transition-colors placeholder:font-normal placeholder:text-ink-subtle hover:border-hairline-strong focus:border-[color-mix(in_srgb,#166534_55%,transparent)] focus:outline-none disabled:opacity-60"
        />
        <span className="text-[11px] font-semibold text-ink-subtle">days</span>
        {busy ? <Loader2 size={12} className="animate-spin text-ink-subtle" /> : null}
      </div>
      {delta}
    </div>
  );
}

/* Super-admin pre-payout ADJUSTMENT (Sir #37) — a signed rupee amount added (+)
 * or deducted (−) before the final take-home. Base numbers never change; only the
 * displayed net. Optimistic; saves on blur / Enter, reverts on Escape or error. */
function AdjustmentCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const router = useRouter();
  const initial = row.payoutAdjustment == null || Number(row.payoutAdjustment) === 0 ? "" : dec(row.payoutAdjustment);
  const [val, setVal] = useState(initial);
  const [saved, setSaved] = useState(num(row.payoutAdjustment));
  const [busy, setBusy] = useState(false);

  const amount = editable ? Number(val) || 0 : saved;
  const delta =
    amount !== 0 ? (
      <div className="mt-1 leading-tight">
        <span className="tabular-nums text-[11.5px] font-black" style={{ color: amount >= 0 ? "#166534" : "#b91c1c" }}>
          {amount >= 0 ? "+" : "−"} ₹{Math.abs(Math.round(amount)).toLocaleString("en-IN")} {amount >= 0 ? "extra" : "deducted"}
        </span>
      </div>
    ) : null;

  if (!editable) {
    return saved !== 0 ? <div>{delta}</div> : <span className="text-ink-subtle">—</span>;
  }

  async function commit() {
    const next = Math.round((Number(val) || 0) * 100) / 100;
    if (next === saved) {
      setVal(next === 0 ? "" : String(next));
      return;
    }
    setBusy(true);
    const res = await setPayoutAdjustment({ rowId: row.id, amount: next });
    setBusy(false);
    if (!res.ok) {
      setVal(saved === 0 ? "" : String(saved));
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setSaved(next);
    setVal(next === 0 ? "" : String(next));
    router.refresh();
  }

  return (
    <div>
      <div className="inline-flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-ink-subtle">₹</span>
        <input
          type="number"
          step="100"
          inputMode="numeric"
          value={val}
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setVal(saved === 0 ? "" : String(saved));
              e.currentTarget.blur();
            }
          }}
          placeholder="0"
          aria-label={`Pre-payout adjustment for ${row.employeeName} (+ extra / − deduct)`}
          title="Add (+) or deduct (−) a rupee amount before the final payout"
          className="w-[74px] rounded-md border border-hairline bg-surface-card px-2 py-1 text-right text-[12.5px] font-bold tabular-nums text-ink-strong transition-colors placeholder:font-normal placeholder:text-ink-subtle hover:border-hairline-strong focus:border-[color-mix(in_srgb,#166534_55%,transparent)] focus:outline-none disabled:opacity-60"
        />
        {busy ? <Loader2 size={12} className="animate-spin text-ink-subtle" /> : null}
      </div>
      {delta}
    </div>
  );
}

/* Extreme-right per-row payslip — a downloadable PDF (salary + attendance +
 * incentives) via the combined-earnings route, for the currently-viewed month. */
function PayslipLink({ row, month }: { row: SalaryRow; month?: string }) {
  if (!row.employeeId || !month) {
    return <span className="text-ink-subtle">—</span>;
  }
  const href = `/salary/earnings/${row.employeeId}?month=${month}&name=${encodeURIComponent(row.employeeName)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Download ${row.employeeName}'s payslip (salary + attendance + incentives)`}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-white transition-transform active:scale-[0.98]"
      style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, boxShadow: `0 6px 14px -8px ${GREEN_DEEP}` }}
    >
      <FileDown size={14} strokeWidth={2.5} /> PDF
    </a>
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

export function SalaryBreakupTable({
  rows,
  canMarkPaid = false,
  canEditNote = false,
  canWaiveOff = false,
  month,
  hideCompanyFilter = false,
}: {
  rows: SalaryRow[];
  canMarkPaid?: boolean;
  /** Super-admins can edit the inline Remarks note; others see it read-only. */
  canEditNote?: boolean;
  /** Super-admins can type condoned "Wave-Off" days; others see the grant read-only. */
  canWaiveOff?: boolean;
  /** The payroll month ("YYYY-MM") — powers the per-row payslip PDF link. */
  month?: string;
  /** When the parent already filters by company (salary workspace), hide the
   *  table's own company dropdown so there's a single source of truth. */
  hideCompanyFilter?: boolean;
}) {
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

  // Show the Remarks/Note column when a super-admin can edit it, or when any row
  // already carries a note (so it stays visible read-only for everyone).
  const showRemarks = canEditNote || rows.some((r) => r.adminNote);
  // Show Wave-Off when a super-admin can grant it, or when any row already carries
  // a grant (so it stays visible read-only for everyone).
  const showWaiveOff = canWaiveOff || rows.some((r) => num(r.waiveOffDays) > 0);
  // Adjustment (Sir #37) uses the same super-admin gate as Wave-Off.
  const showAdjust = canWaiveOff || rows.some((r) => num(r.payoutAdjustment) !== 0);
  // Column order (trailing): … Payout · Wave-Off · Adjustment · Paid · Remarks.
  // Drop each when its viewer/flag isn't present. Groups rebuilt to match.
  const visibleCols = COLUMNS.filter(
    (c) =>
      (c.key !== "waiveOff" || showWaiveOff) &&
      (c.key !== "payoutAdj" || showAdjust) &&
      (c.key !== "paid" || canMarkPaid) &&
      (c.key !== "remarks" || showRemarks),
  );
  const visibleGroups: { label: string; span: number }[] = [
    { label: "", span: 1 }, // Company
    { label: "Attendance — days", span: 6 },
    { label: "Pay", span: 4 },
    { label: "Adjustments", span: 2 },
    { label: "Payout", span: 1 },
    ...(showWaiveOff ? [{ label: "", span: 1 }] : []), // Wave-Off (name shown on the column header)
    ...(showAdjust ? [{ label: "", span: 1 }] : []), // Adjustment
    ...(canMarkPaid ? [{ label: "", span: 1 }] : []), // Paid
    ...(showRemarks ? [{ label: "", span: 1 }] : []), // Remarks
    { label: "", span: 1 }, // Payslip (always shown)
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

        {!hideCompanyFilter && companies.length > 1 && (
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
                  className="wg-rise group border-b border-hairline last:border-b-0 hover:bg-[color-mix(in_srgb,#E10600_4%,transparent)]"
                  style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                >
                  {/* Sticky employee cell */}
                  <td
                    className="sticky left-0 z-10 px-4 py-2.5 group-hover:bg-[color-mix(in_srgb,#E10600_4%,var(--color-surface-card))]"
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
                      className={`whitespace-nowrap px-3 py-2.5 ${c.key === "company" ? "sticky z-10 group-hover:bg-[color-mix(in_srgb,#E10600_4%,var(--color-surface-card))]" : ""} ${c.align === "right" ? "text-right" : "text-left"}`}
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
                      {c.key === "remarks" ? (
                        <RemarkCell row={r} editable={canEditNote} />
                      ) : c.key === "waiveOff" ? (
                        <WaiveOffCell row={r} editable={canWaiveOff} />
                      ) : c.key === "payoutAdj" ? (
                        <AdjustmentCell row={r} editable={canWaiveOff} />
                      ) : c.key === "payslip" ? (
                        <PayslipLink row={r} month={month} />
                      ) : (
                        c.render(r)
                      )}
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
