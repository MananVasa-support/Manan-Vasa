"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { format } from "date-fns";
import {
  Loader2,
  Archive,
  X,
  Flag,
  Tag,
  Building2,
  CalendarDays,
  AlignLeft,
  User,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  USER_TASK_STATUSES,
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
  type StatusColorToken,
} from "@/db/enums";
import { setTaskStatus, archiveTask, unarchiveTask } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { BoardTask } from "@/lib/queries/tasks";

// Priority → colour token + label for the hover-card badge.
const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "orange",
  not_imp_not_urgent: "slate",
};

interface Props {
  tasks: BoardTask[];
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
  /** Roster for the employee filter. */
  employees: { id: string; name: string }[];
  isAdmin: boolean;
  /** Frosted-glass columns for the dark canvas page. */
  dark?: boolean;
}

// Sentinel id for the synthetic "Archived" column (not a real TaskStatus).
const ARCHIVE_COL = "__archived__";
type ColId = TaskStatus | typeof ARCHIVE_COL;

// Admin board column order (Manan's sequence): the working lane first, then
// Done → Not Approved → Approved → [Archived] → Cancelled → Transferred.
// The Archived drop-zone is slotted right before "cancelled".
const KANBAN_ADMIN_STATUSES: TaskStatus[] = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "need_help",
  "need_info",
  "on_hold",
  "done",
  "not_approved",
  "approved",
  "cancelled",
  "transferred",
];

/**
 * Status Kanban (Manan #25). One column per status; drag a card to another
 * column to change its status. HTML5 drag-and-drop (no extra deps). The
 * server action validates the transition + optimistic lock; on success we
 * refresh, on failure we revert and toast.
 *
 * Admins get every status as a column; everyone else gets USER_TASK_STATUSES.
 */
// Cards rendered per column before "Show more"; each tap reveals 10 more.
// Keeps the board light when a column holds dozens of tasks.
const COL_STEP = 10;

export function KanbanBoard({ tasks, labels, tones, employees, isAdmin, dark = false }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(tasks);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<ColId | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  // Client-side filters — the board holds every task in state, so filtering is
  // instant (no server round-trip). "all" = no constraint.
  const [empFilter, setEmpFilter] = React.useState<string>("all");
  const [prioFilter, setPrioFilter] = React.useState<string>("all");
  // Per-column visible cap (status → count). Missing = COL_STEP.
  const [visibleByCol, setVisibleByCol] = React.useState<
    Record<string, number>
  >({});

  // Edge auto-scroll: native HTML5 drag won't scroll an overflow container
  // near its edges, so a card can't be dragged to an off-screen column. While
  // a drag is active we run a rAF loop that scrolls the board left/right when
  // the pointer enters an edge zone — letting a drag cross the full width.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const autoScroll = React.useRef({ dir: 0, speed: 0, raf: 0 });

  function updateEdgeFromPointer(clientX: number) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const zone = 110; // px from each edge that triggers scrolling
    const max = 26; // px per frame at the very edge
    if (clientX < rect.left + zone) {
      autoScroll.current.dir = -1;
      autoScroll.current.speed = Math.ceil(((rect.left + zone - clientX) / zone) * max);
    } else if (clientX > rect.right - zone) {
      autoScroll.current.dir = 1;
      autoScroll.current.speed = Math.ceil(((clientX - (rect.right - zone)) / zone) * max);
    } else {
      autoScroll.current.dir = 0;
    }
  }

  function beginAutoScroll() {
    if (autoScroll.current.raf) return;
    const tick = () => {
      const el = scrollRef.current;
      const { dir, speed } = autoScroll.current;
      if (el && dir !== 0) el.scrollLeft += dir * speed;
      autoScroll.current.raf = requestAnimationFrame(tick);
    };
    autoScroll.current.raf = requestAnimationFrame(tick);
  }

  function endAutoScroll() {
    if (autoScroll.current.raf) cancelAnimationFrame(autoScroll.current.raf);
    autoScroll.current = { dir: 0, speed: 0, raf: 0 };
  }

  // Safety net: stop the loop if the component unmounts mid-drag.
  React.useEffect(
    () => () => {
      if (autoScroll.current.raf) cancelAnimationFrame(autoScroll.current.raf);
    },
    [],
  );

  React.useEffect(() => setItems(tasks), [tasks]);

  const filtered = React.useMemo(
    () =>
      items.filter(
        (t) =>
          (empFilter === "all" || t.doerId === empFilter) &&
          (prioFilter === "all" || t.priority === prioFilter),
      ),
    [items, empFilter, prioFilter],
  );

  // Admins: the curated sequence with the Archived drop-zone before Cancelled.
  // Everyone else: their status set with Archived appended at the end.
  const columns: ColId[] = isAdmin
    ? KANBAN_ADMIN_STATUSES.flatMap((s) => (s === "cancelled" ? [ARCHIVE_COL, s] : [s]))
    : [...USER_TASK_STATUSES, ARCHIVE_COL];

  // Archive (drag a card into the Archived column). Optimistic, with revert.
  async function archiveCard(taskId: string) {
    const task = items.find((t) => t.id === taskId);
    if (!task || task.archived) return;
    const prev = items;
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, archived: true } : t)));
    setSavingId(taskId);
    const res = await archiveTask(taskId);
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
      fireToast({ message: res.error || "Couldn't archive the task." });
      router.refresh();
      return;
    }
    fireToast({ message: "Archived." });
    router.refresh();
  }

  // Restore (drag an archived card back to any status column). Keeps the
  // task's existing status — same semantics as the List view's restore.
  async function restoreCard(taskId: string) {
    const task = items.find((t) => t.id === taskId);
    if (!task || !task.archived) return;
    const prev = items;
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, archived: false } : t)));
    setSavingId(taskId);
    const res = await unarchiveTask(taskId);
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
      fireToast({ message: res.error || "Couldn't restore the task." });
      router.refresh();
      return;
    }
    fireToast({ message: "Restored." });
    router.refresh();
  }

  async function moveTo(taskId: string, status: TaskStatus) {
    const task = items.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    const prev = items;
    // Optimistic move.
    setItems((cur) => cur.map((t) => (t.id === taskId ? { ...t, status } : t)));
    setSavingId(taskId);
    const res = await setTaskStatus(taskId, status, task.updatedAt.toISOString());
    setSavingId(null);
    if (!res.ok) {
      setItems(prev); // revert
      fireToast({
        message:
          res.error === "forbidden"
            ? "You can't move this task to that status."
            : res.error === "invalid"
              ? res.message ?? "That move isn't allowed from here."
              : res.error === "stale"
                ? "Task changed elsewhere — refreshing."
                : "Couldn't update the task.",
      });
      router.refresh();
      return;
    }
    fireToast({ message: `Moved to ${labels[status]}.` });
    router.refresh();
  }

  return (
    <Tooltip.Provider delayDuration={180} skipDelayDuration={400}>
    <div>
      {/* Filters — employee + priority, applied client-side across the board. */}
      <div className="mb-5 flex items-center gap-2.5 flex-wrap">
        <FilterDropdown
          label="Employee"
          value={empFilter}
          onChange={setEmpFilter}
          dark={dark}
          options={[
            { value: "all", label: "All Employees" },
            ...employees.map((e) => ({ value: e.id, label: e.name })),
          ]}
        />
        <FilterDropdown
          label="Priority"
          value={prioFilter}
          onChange={setPrioFilter}
          dark={dark}
          options={[
            { value: "all", label: "All Priorities" },
            ...TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
          ]}
        />
        {(empFilter !== "all" || prioFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setEmpFilter("all");
              setPrioFilter("all");
            }}
            className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] font-bold transition-colors"
            style={{
              color: dark ? "rgba(255,255,255,0.85)" : "var(--color-ink-soft)",
              border: dark
                ? "1px solid rgba(255,255,255,0.18)"
                : "1px solid var(--color-hairline)",
            }}
          >
            <X size={16} strokeWidth={2.6} />
            Reset
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        // items-stretch (not items-start) so every column is as tall as the
        // tallest one — this keeps each column's sticky header pinned for the
        // full vertical scroll, even short columns like "Approved" that would
        // otherwise run out of body and let their header scroll away.
        className="flex items-stretch gap-4 overflow-x-auto overflow-y-auto pb-4 max-sm:snap-x max-sm:snap-mandatory"
        style={{ maxHeight: "calc(100dvh - 280px)", minHeight: 420 }}
        onDragOver={(e) => {
          // Bubbles up from the columns; track the pointer for edge auto-scroll.
          updateEdgeFromPointer(e.clientX);
        }}
      >
      {columns.map((col) => {
        const isArchive = col === ARCHIVE_COL;
        const colTasks = isArchive
          ? filtered.filter((t) => t.archived)
          : filtered.filter((t) => !t.archived && t.status === col);
        const limit = visibleByCol[col] ?? COL_STEP;
        const shownTasks = colTasks.slice(0, limit);
        const hiddenCount = colTasks.length - shownTasks.length;
        const tone = isArchive ? null : tones[col as TaskStatus];
        const isOver = overCol === col;
        // The Archived column has no status token — use a neutral slate accent.
        const accent = isArchive ? "#94a3b8" : `var(--color-${tone})`;
        const accentDeep = isArchive ? "#64748b" : `var(--color-${tone}-deep)`;
        const accentBgLight = isArchive ? "#f1f5f9" : `var(--color-${tone}-bg)`;
        const label = isArchive ? "Archived" : labels[col as TaskStatus];
        return (
          <div
            key={col}
            onDragOver={(e) => {
              e.preventDefault();
              // Tell the browser this is a valid "move" target — without a
              // dropEffect the drop can be silently rejected in some browsers.
              e.dataTransfer.dropEffect = "move";
              setOverCol(col);
            }}
            onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              if (dragId) {
                if (isArchive) {
                  void archiveCard(dragId);
                } else {
                  const card = items.find((t) => t.id === dragId);
                  if (card?.archived) void restoreCard(dragId);
                  else void moveTo(dragId, col as TaskStatus);
                }
              }
              setDragId(null);
              endAutoScroll();
            }}
            className="flex-shrink-0 w-[320px] max-sm:w-[85vw] max-sm:snap-center rounded-section p-3.5 transition-colors"
            style={{
              background: isOver
                ? dark
                  ? `color-mix(in srgb, ${accent} 28%, rgba(18,11,10,0.55))`
                  : accentBgLight
                : dark
                  ? "rgba(255,255,255,0.055)"
                  : "var(--color-surface-soft)",
              border: `1px solid ${
                isOver
                  ? accent
                  : dark
                    ? "rgba(255,255,255,0.12)"
                    : "var(--color-hairline)"
              }`,
              backdropFilter: dark ? "blur(12px)" : undefined,
              WebkitBackdropFilter: dark ? "blur(12px)" : undefined,
              boxShadow: dark
                ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px -12px rgba(0,0,0,0.5)"
                : undefined,
            }}
          >
            {/* Column header — frozen to the top of the board while scrolling so
                the status label stays readable no matter how far you scroll. */}
            <div
              className="sticky top-0 z-20 flex items-center justify-between -mx-3.5 -mt-3.5 mb-3 px-3.5 pt-3.5 pb-2.5"
              style={{
                background: dark ? "rgba(18,11,10,0.82)" : "var(--color-surface-soft)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
              }}
            >
              <span
                className="inline-flex items-center gap-2 text-[15.5px] font-bold"
                style={{
                  color: dark ? "rgba(255,255,255,0.92)" : accentDeep,
                }}
              >
                {isArchive ? (
                  <Archive size={17} strokeWidth={2.4} style={{ color: accent }} />
                ) : (
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{
                      background: accent,
                      boxShadow: dark
                        ? `0 0 8px color-mix(in srgb, ${accent} 70%, transparent)`
                        : undefined,
                    }}
                  />
                )}
                {label}
              </span>
              <span
                className="text-[14px] font-bold tabular-nums"
                style={{
                  color: dark ? "rgba(255,255,255,0.7)" : "var(--color-ink-subtle)",
                }}
              >
                {colTasks.length}
              </span>
            </div>

            <div className="flex flex-col gap-2 min-h-[40px]">
              {isArchive && colTasks.length === 0 && (
                <p
                  className="px-2 py-6 text-center text-[14px] font-semibold leading-relaxed"
                  style={{
                    color: dark ? "rgba(255,255,255,0.5)" : "var(--color-ink-subtle)",
                  }}
                >
                  Drag a card here to archive it.
                </p>
              )}
              {shownTasks.map((t) => (
                // The draggable wrapper is OUTSIDE the Radix Tooltip.Trigger.
                // Wrapping a native-draggable node *as* a Radix trigger (and
                // nesting a draggable <Link> inside it) reliably broke HTML5
                // drag — the anchor / trigger hijacked the gesture. Keeping
                // drag on this plain wrapper and the tooltip on the inner card
                // lets both work without fighting each other.
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    // Firefox refuses to start a drag unless data is set;
                    // effectAllowed "move" pairs with the column's dropEffect.
                    e.dataTransfer.setData("text/plain", t.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(t.id);
                    beginAutoScroll();
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                    endAutoScroll();
                  }}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ opacity: dragId === t.id ? 0.5 : 1 }}
                >
                <Tooltip.Root delayDuration={180}>
                  <Tooltip.Trigger asChild>
                    <div className="group rounded-chip bg-white border border-hairline p-3.5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-altus-red/40">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/tasks/${t.id}/focus` as Route}
                          // draggable={false}: stop the anchor from starting
                          // its own "drag link" gesture and stealing the card's.
                          draggable={false}
                          className="text-[15.5px] font-semibold text-ink-strong leading-snug hover:underline"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {t.description || t.title}
                        </Link>
                        {savingId === t.id && (
                          <Loader2 size={14} className="animate-spin text-ink-subtle shrink-0 mt-0.5" />
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        {t.taskNo != null && (
                          <span className="text-[12.5px] font-bold tabular-nums text-ink-subtle">
                            #{t.taskNo}
                          </span>
                        )}
                        {t.subject && (
                          <span className="text-[13px] font-semibold text-ink-subtle">
                            {t.taskNo != null ? "· " : ""}{t.subject}
                          </span>
                        )}
                        {t.doerName && (
                          <span className="text-[13px] text-ink-subtle">· {t.doerName}</span>
                        )}
                      </div>
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      align="start"
                      sideOffset={12}
                      collisionPadding={16}
                      className="kanban-hovercard z-[80]"
                    >
                      <TaskHoverCard t={t} labels={labels} tones={tones} />
                      <Tooltip.Arrow width={14} height={7} style={{ fill: "var(--color-surface-card)" }} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                </div>
              ))}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleByCol((m) => ({ ...m, [col]: limit + COL_STEP }))
                  }
                  className="mt-1 w-full rounded-chip py-2.5 text-[14px] font-bold transition-colors"
                  style={{
                    border: dark
                      ? "1px dashed rgba(255,255,255,0.22)"
                      : "1px dashed var(--color-hairline-strong)",
                    color: dark ? "rgba(255,255,255,0.82)" : "var(--color-ink-soft)",
                    background: dark ? "rgba(255,255,255,0.04)" : "transparent",
                  }}
                >
                  Show {Math.min(COL_STEP, hiddenCount)} more ({hiddenCount} hidden)
                </button>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
    </Tooltip.Provider>
  );
}

// Labelled single-select for the board's employee / priority filters. Built on
// the app's Radix dropdown (NOT a native <select> — those render unstyleable
// white-on-white option lists over the dark board). The trigger is dark-themed;
// the menu is the standard light popover with a check on the active option.
function FilterDropdown({
  label,
  value,
  onChange,
  dark,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dark: boolean;
  options: { value: string; label: string }[];
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="text-[13.5px] font-bold uppercase tracking-[0.05em]"
        style={{ color: dark ? "rgba(255,255,255,0.7)" : "var(--color-ink-subtle)" }}
      >
        {label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group inline-flex items-center gap-2 h-12 rounded-pill px-5 text-[16px] font-semibold transition-colors outline-none data-[state=open]:ring-2 data-[state=open]:ring-altus-red/40"
            style={{
              color: dark ? "#fff" : "var(--color-ink-strong)",
              background: dark ? "rgba(255,255,255,0.09)" : "var(--color-surface-card)",
              border: dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--color-hairline)",
            }}
          >
            <span className="truncate max-w-[200px]">{current?.label ?? ""}</span>
            <ChevronDown
              size={16}
              strokeWidth={2.4}
              className="shrink-0 opacity-70 transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <DropdownMenuItem
                key={o.value}
                onSelect={() => onChange(o.value)}
                className={selected ? "font-bold" : ""}
              >
                <span className="inline-flex w-4 justify-center shrink-0">
                  {selected ? (
                    <Check size={15} strokeWidth={2.8} className="text-altus-red" />
                  ) : null}
                </span>
                <span className="truncate">{o.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Hover preview ─────────────────────────────────────────────────────────
// The whole task at a glance on card hover — status, priority, full title +
// description, client/subject/due/doer — so you never have to open it just to
// read it. Always a light card so it reads over the dark board.

function Pill({
  tone,
  icon,
  children,
}: {
  tone: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold whitespace-nowrap"
      style={{
        color: `var(--color-${tone}-deep)`,
        background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 30%, transparent)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function FieldHead({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-1.5 text-ink-subtle"
      style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}
    >
      {icon}
      {children}
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <FieldHead icon={icon}>{label}</FieldHead>
      <div className="mt-1 truncate text-ink-strong" style={{ fontSize: 14.5, fontWeight: 600 }}>
        {value && value.trim() ? value : "—"}
      </div>
    </div>
  );
}

function TaskHoverCard({
  t,
  labels,
  tones,
}: {
  t: BoardTask;
  labels: Record<TaskStatus, string>;
  tones: Record<TaskStatus, StatusColorToken>;
}) {
  const statusTone = tones[t.status] ?? "blue";
  const prioTone = PRIORITY_TONE[t.priority] ?? "slate";
  const desc = t.description?.trim();
  // Staggered entrance delays — header, title, description, divider, meta.
  const DELAY = ["40ms", "95ms", "150ms", "205ms", "260ms"] as const;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-surface-card"
      style={{
        width: 384,
        maxWidth: "calc(100vw - 32px)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
      }}
    >
      {/* Status accent that sweeps across the top */}
      <span
        aria-hidden
        className="hc-accent absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, var(--color-${statusTone}), var(--color-${statusTone}-deep))`,
        }}
      />

      <div className="p-5 pt-6">
        {/* Status / priority / archived badges */}
        <div className="hc-item flex items-center gap-2 flex-wrap" style={{ animationDelay: DELAY[0] }}>
          <Pill
            tone={statusTone}
            icon={<span className="h-2 w-2 rounded-full" style={{ background: `var(--color-${statusTone})` }} />}
          >
            {labels[t.status]}
          </Pill>
          <Pill tone={prioTone} icon={<Flag size={12} strokeWidth={2.6} />}>
            {PRIORITY_LABELS[t.priority]}
          </Pill>
          {t.archived && (
            <Pill tone="slate" icon={<Archive size={12} strokeWidth={2.4} />}>
              Archived
            </Pill>
          )}
        </div>

        {/* Title (prefixed with the friendly task No.) */}
        <h3
          className="hc-item mt-3.5 text-ink-strong"
          style={{ animationDelay: DELAY[1], fontSize: 17, fontWeight: 800, lineHeight: 1.3, letterSpacing: "-0.01em" }}
        >
          {t.taskNo != null && (
            <span className="text-ink-subtle tabular-nums">#{t.taskNo} · </span>
          )}
          {t.title}
        </h3>

        {/* Description */}
        <div className="hc-item mt-3" style={{ animationDelay: DELAY[2] }}>
          <FieldHead icon={<AlignLeft size={14} strokeWidth={2.2} />}>Description</FieldHead>
          {desc ? (
            <p
              className="mt-1.5 whitespace-pre-wrap text-ink-soft"
              style={{ fontSize: 14.5, lineHeight: 1.6, maxHeight: 208, overflowY: "auto" }}
            >
              {desc}
            </p>
          ) : (
            <p className="mt-1.5 italic text-ink-subtle" style={{ fontSize: 14 }}>
              No description added.
            </p>
          )}
        </div>

        <div className="hc-item my-4 h-px bg-hairline" style={{ animationDelay: DELAY[3] }} />

        {/* Meta grid */}
        <div className="hc-item grid grid-cols-2 gap-x-4 gap-y-4" style={{ animationDelay: DELAY[4] }}>
          <Meta icon={<Building2 size={14} strokeWidth={2.2} />} label="Client" value={t.client} />
          <Meta icon={<Tag size={14} strokeWidth={2.2} />} label="Subject" value={t.subject} />
          <Meta
            icon={<CalendarDays size={14} strokeWidth={2.2} />}
            label="Due"
            value={t.dueAt ? format(t.dueAt, "MMM d, yyyy") : null}
          />
          <div className="min-w-0">
            <FieldHead icon={<User size={14} strokeWidth={2.2} />}>Doer</FieldHead>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              {t.doerName ? (
                <>
                  <EmployeeAvatar name={t.doerName} size="sm" />
                  <span className="truncate text-ink-strong" style={{ fontSize: 14.5, fontWeight: 600 }}>
                    {t.doerName}
                  </span>
                </>
              ) : (
                <span className="text-ink-subtle" style={{ fontSize: 14.5 }}>
                  Unassigned
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
