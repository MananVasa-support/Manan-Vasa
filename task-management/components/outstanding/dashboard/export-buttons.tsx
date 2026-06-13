"use client";
import * as React from "react";
import { stringify } from "csv-stringify/sync";
import { Download, Printer } from "lucide-react";
import { format } from "date-fns";
import { exportFilename } from "@/lib/exports/csv";
import { OUTSTANDING_CYCLE_LABELS } from "@/db/enums";
import type { OutstandingCycle } from "@/db/enums";
import type { DerivedInstallment } from "@/lib/outstanding/types";
import type { CollectionDisplayRow } from "@/lib/queries/outstanding";

function cycleLabel(cycle: string | undefined): string {
  if (!cycle) return "";
  return OUTSTANDING_CYCLE_LABELS[cycle as OutstandingCycle] ?? cycle;
}

function fmtDue(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : format(d, "dd-MMM-yyyy");
}

// Match lib/exports/csv.ts: UTF-8 BOM + RFC-4180 quoting via csv-stringify, but
// triggered as a client-side blob download rather than an HTTP Response.
function downloadCsv(
  resource: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const body = "﻿" + stringify([headers, ...rows]);
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFilename(resource);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function OutstandingExportButtons({
  entries,
  collectionEntries,
}: {
  entries: DerivedInstallment[];
  collectionEntries: CollectionDisplayRow[];
}) {
  const exportEntries = React.useCallback(() => {
    const headers = [
      "Client",
      "Product",
      "Cycle",
      "Due Date",
      "Balance",
      "Days Overdue",
      "Entity",
      "Responsible",
      "Status",
    ];
    const rows = entries.map((e) => [
      e.clientName,
      e.productName ?? "",
      cycleLabel(e.cycle),
      fmtDue(e.dueDate),
      e.balance,
      e.state === "overdue" ? e.daysOverdue : "",
      e.entityName ?? "",
      e.responsibleName ?? "",
      e.state === "overdue" ? "Overdue" : "Not Due",
    ]);
    downloadCsv("outstanding-entries", headers, rows);
  }, [entries]);

  const exportCollections = React.useCallback(() => {
    const headers = [
      "Client",
      "Amount",
      "Payment Mode",
      "Responsible",
      "Comments",
      "Collected At",
    ];
    const rows = collectionEntries.map((c) => [
      c.clientName,
      c.amount,
      c.paymentMode ?? "",
      c.responsible ?? "",
      c.comments ?? "",
      c.collectedAt,
    ]);
    downloadCsv("outstanding-collections", headers, rows);
  }, [collectionEntries]);

  return (
    <div className="flex items-center gap-2.5 flex-wrap print:hidden">
      <button
        type="button"
        onClick={exportEntries}
        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill text-[14px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-altus-red hover:text-altus-red transition-all"
      >
        <Download size={16} strokeWidth={2.3} />
        Entries CSV
      </button>
      <button
        type="button"
        onClick={exportCollections}
        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill text-[14px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-altus-red hover:text-altus-red transition-all"
      >
        <Download size={16} strokeWidth={2.3} />
        Collections CSV
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill text-[14px] font-bold border border-hairline bg-surface-card text-ink-soft hover:border-altus-red hover:text-altus-red transition-all"
      >
        <Printer size={16} strokeWidth={2.3} />
        Print
      </button>
    </div>
  );
}
