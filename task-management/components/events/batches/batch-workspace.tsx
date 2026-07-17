"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseISO, format } from "date-fns";
import {
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  Power,
  MapPin,
  Layers,
  Clock,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { EVENT_STATUS_LABELS } from "@/db/enums";
import { minToLabel } from "@/lib/monthly-events/types";
import {
  deleteBatchSchedule,
  setBatchScheduleActive,
} from "@/app/(app)/events/batches/actions";
import { BatchScheduleForm } from "./batch-schedule-form";
import type {
  BatchScheduleRow,
  BatchTypeOption,
  CategoryOption,
} from "./types";

const ACCENT = "#0891b2";
const ACCENT_DEEP = "#0e7490";
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

export function BatchWorkspace({
  schedules,
  batchTypes,
  categories,
}: {
  schedules: BatchScheduleRow[];
  batchTypes: BatchTypeOption[];
  categories: CategoryOption[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BatchScheduleRow | null>(null);

  const noTypes = batchTypes.length === 0;

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(row: BatchScheduleRow) {
    setEditing(row);
    setDialogOpen(true);
  }

  return (
    <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 wg-rise">
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#ffffff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <CalendarClock size={13} strokeWidth={2.6} />
            Batch Schedules
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(26px, 3vw, 38px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
            }}
          >
            PS · BSS · Conclave · Graduate — auto-blocked
          </h1>
          <p className="mt-2 max-w-[62ch] text-[15px] font-medium text-ink-muted">
            Enter a batch&apos;s dates, times and days — the calendar auto-creates
            locked blocks across the whole range. Editing reconciles them; nothing
            ever duplicates.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          disabled={noTypes}
          className="brand-btn wg-btn inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold text-white disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
            boxShadow: "0 10px 24px -12px rgba(8,145,178,0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          <Plus size={17} strokeWidth={2.6} />
          New schedule
        </button>
      </header>

      {noTypes && (
        <div
          className="mb-6 rounded-2xl border px-4 py-3 text-[14px] font-semibold"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 7%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 26%, transparent)",
            color: "var(--color-altus-red-deep)",
          }}
        >
          No active batch types yet. Add batch/section types in{" "}
          <span className="font-extrabold">Category &amp; Batch Masters</span> first,
          then create a schedule here.
        </div>
      )}

      {schedules.length === 0 ? (
        <EmptyState onNew={openNew} disabled={noTypes} />
      ) : (
        <div
          className="grid gap-4 max-md:gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}
        >
          {schedules.map((s, i) => (
            <ScheduleCard key={s.id} row={s} index={i} onEdit={() => openEdit(s)} />
          ))}
        </div>
      )}

      <BatchScheduleForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        batchTypes={batchTypes}
        categories={categories}
      />
    </main>
  );
}

function EmptyState({ onNew, disabled }: { onNew: () => void; disabled: boolean }) {
  return (
    <div className="wg-rise flex flex-col items-center justify-center rounded-2xl border border-dashed border-hairline-strong bg-surface-card px-6 py-16 text-center">
      <span
        className="inline-flex size-14 items-center justify-center rounded-2xl"
        style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
      >
        <CalendarClock size={26} strokeWidth={2.2} />
      </span>
      <h2
        className="mt-4 text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: 20 }}
      >
        No batch schedules yet
      </h2>
      <p className="mt-1.5 max-w-[42ch] text-[14.5px] text-ink-muted">
        Create one and the calendar blocks it automatically across every date and
        time slot in the range.
      </p>
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className="brand-btn wg-btn mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-bold text-white disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        <Plus size={17} strokeWidth={2.6} />
        New schedule
      </button>
    </div>
  );
}

function ScheduleCard({
  row,
  index,
  onEdit,
}: {
  row: BatchScheduleRow;
  index: number;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const title = [row.batchTypeName ?? "Batch", row.name].filter(Boolean).join(" · ");
  const allDay = row.startMin == null || row.endMin == null;
  const timeLabel = allDay
    ? "All-day"
    : `${minToLabel(row.startMin!)} – ${minToLabel(row.endMin!)}`;
  const days =
    row.daysOfWeek && row.daysOfWeek.length > 0
      ? row.daysOfWeek.map((d) => DAY_LABELS[d]).join(" · ")
      : "Every day";

  function onToggleActive() {
    startTransition(async () => {
      const res = await setBatchScheduleActive({ id: row.id, isActive: !row.isActive });
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({
        message: row.isActive
          ? "Schedule deactivated — blocks removed."
          : "Schedule reactivated — calendar re-blocked.",
      });
      router.refresh();
    });
  }

  function onDelete() {
    if (!window.confirm(`Delete "${title}"? This removes its ${row.blockCount} calendar block${row.blockCount === 1 ? "" : "s"}.`))
      return;
    startTransition(async () => {
      const res = await deleteBatchSchedule(row.id);
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({ message: "Batch schedule deleted." });
      router.refresh();
    });
  }

  return (
    <article
      className={cn(
        "wg-rise relative flex flex-col overflow-hidden rounded-2xl border bg-surface-card p-5 transition-all",
        row.isActive ? "border-hairline hover:border-hairline-strong hover:shadow-lg" : "border-hairline opacity-70",
      )}
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: row.categoryColor
            ? row.categoryColor
            : `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})`,
        }}
      />

      <div className="flex items-start justify-between gap-3">
        <h3
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em" }}
        >
          {title}
        </h3>
        <StatusChip status={row.status} />
      </div>

      <div className="mt-3 space-y-1.5 text-[13.5px] text-ink-muted">
        <Line icon={<CalendarClock size={14} strokeWidth={2.2} />}>
          {fmtDate(row.startDate)} → {fmtDate(row.endDate)}
        </Line>
        <Line icon={<Clock size={14} strokeWidth={2.2} />}>
          {timeLabel} · {days}
        </Line>
        {row.categoryName && (
          <Line
            icon={
              <span
                className="inline-block size-3 rounded-full"
                style={{ background: row.categoryColor ?? ACCENT }}
              />
            }
          >
            {row.categoryName}
          </Line>
        )}
        {row.location && (
          <Line icon={<MapPin size={14} strokeWidth={2.2} />}>{row.location}</Line>
        )}
        <Line icon={<Layers size={14} strokeWidth={2.2} />}>
          <span className="font-bold text-ink-strong">{row.blockCount}</span> calendar
          block{row.blockCount === 1 ? "" : "s"}
          {!row.isActive && <span className="ml-1 text-altus-red">· inactive</span>}
        </Line>
      </div>

      {row.notes && (
        <p className="mt-3 rounded-lg bg-surface-soft px-3 py-2 text-[13px] text-ink-muted line-clamp-2">
          {row.notes}
        </p>
      )}

      <div className="mt-4 flex items-center gap-1.5 border-t border-hairline pt-3">
        <button
          type="button"
          onClick={onEdit}
          disabled={pending}
          className="brand-btn inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
        >
          <Pencil size={14} strokeWidth={2.4} />
          Edit
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          disabled={pending}
          className="brand-btn inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-bold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-50"
        >
          <Power size={14} strokeWidth={2.4} />
          {row.isActive ? "Deactivate" : "Reactivate"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="brand-btn ml-auto inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13px] font-bold text-altus-red transition-colors hover:bg-surface-soft disabled:opacity-50"
        >
          <Trash2 size={14} strokeWidth={2.4} />
          Delete
        </button>
      </div>
    </article>
  );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex w-4 shrink-0 justify-center text-ink-subtle">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function StatusChip({ status }: { status: BatchScheduleRow["status"] }) {
  const tentative = status === "tentative";
  return (
    <span
      className={cn(
        "shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]",
        tentative ? "border border-dashed" : "text-white",
      )}
      style={
        tentative
          ? {
              color: ACCENT_DEEP,
              borderColor: ACCENT,
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 4px, color-mix(in srgb, #0891b2 14%, transparent) 4px, color-mix(in srgb, #0891b2 14%, transparent) 8px)",
            }
          : { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }
      }
    >
      {tentative ? "Tent" : EVENT_STATUS_LABELS[status]}
    </span>
  );
}
