"use client";

import * as React from "react";
import { motion } from "motion/react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useReducedMotion } from "@/lib/motion-utils";
import type { NotApprovedAging, NotApprovedPerson } from "@/lib/types";
import { bucketWaitingDays } from "@/lib/transforms/aging-bands";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { CollapseToggle, CollapsibleBody } from "@/components/dashboard/section-chrome";

/* ────────────────────────────────────────────────────────────────────────
   NotApprovedSidebar — V2 executive "Attention Required" rail.

   Declined tasks that were sent back to be redone and are still waiting for
   sign-off. A red-toned days-waiting histogram (every band is overdue) sits
   above a person-wise roster, most-waiting-first, each person expanding to
   their declined tasks which deep-link into /tasks/[id].

   Privacy (mirrors the shipped not-approved-section): admins see the full
   `byPerson` roster; a non-admin sees ONLY their own row (filtered to
   `meId`; a null `meId` resolves to none). Empty state when total === 0.

   Brand discipline (altus-premium-ui): Altus-red tokens + color-mix tints on
   a cream-glass surface with aurora wash + layered elevation, --font-display
   numbers with tabular-nums, the .wg-rise entrance + .wg-sheen hover sweep,
   motion/react staggered springs (reduced-motion-gated), and the Avatar
   character (resolveAvatar → url) on every person row.
   ──────────────────────────────────────────────────────────────────────── */

const RED = "var(--color-red-deep)";
const RED_BRAND = "var(--color-altus-red)";

export interface NotApprovedSidebarProps {
  data: NotApprovedAging;
  isAdmin: boolean;
  meId: string | null;
  resolveAvatar: (employeeId: string) => string | null;
}

export function NotApprovedSidebar({
  data,
  isAdmin,
  meId,
  resolveAvatar,
}: NotApprovedSidebarProps) {
  const reduce = useReducedMotion() ?? false;
  const { total, byPerson, bands } = data;

  // Admins see everyone; a non-admin sees only their own row (null → none).
  const [sectionOpen, setSectionOpen] = React.useState(true);
  // Clicking a waiting band filters the roster below to the people who actually
  // have a task sitting in it — and to just those tasks when a row is expanded.
  // Filtering in place beats a drawer here: the roster IS the answer to "who
  // is holding the 30+ day work", so replacing it would hide the context.
  const [band, setBand] = React.useState<string | null>(null);
  const bandLabel = band ? (bands.find((b) => b.id === band)?.label ?? null) : null;

  const scoped = isAdmin ? byPerson : byPerson.filter((p) => p.employeeId === meId);
  const people = React.useMemo(() => {
    if (!band) return scoped;
    return scoped
      .map((p) => {
        const tasks = p.tasks.filter((t) => bucketWaitingDays(t.waitingDays) === band);
        return { ...p, tasks, count: tasks.length };
      })
      .filter((p) => p.count > 0);
  }, [scoped, band]);

  return (
    <div className="flex min-w-0 flex-col">
    {/* Header ABOVE this card — see components/dashboard/section-header.tsx. */}
    <DashboardSectionHeader
      className="mb-3"
      eyebrow="Delivery · Attention"
      icon={
        <span
          className="inline-flex size-9 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 13%, transparent)",
            color: RED_BRAND,
          }}
        >
          <AlertTriangle size={18} strokeWidth={2.4} />
        </span>
      }
      title="Attention Required"
      subtitle="Tasks that were declined during review and are currently waiting to be re-worked."
      actions={
        <CollapseToggle
          expanded={sectionOpen}
          onToggle={() => setSectionOpen((v) => !v)}
          label="Attention required"
        />
      }
    />
    <CollapsibleBody expanded={sectionOpen}>
    {/* Clean white card. The peach wash it replaced — a 24%-opacity red drop
        shadow plus two aurora spans — tinted the roster's own red count pills
        and made every row look faintly alarmed. */}
    <section
      className="wg-rise wms-card relative flex-1 rounded-2xl bg-white p-6 shadow-xs hover:shadow-sm max-md:p-5"
      aria-label="Attention required — declined tasks"
    >
      {total === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-6">
          <BandHistogram
            bands={bands}
            total={total}
            reduce={reduce}
            selected={band}
            onSelect={(id) => setBand((cur) => (cur === id ? null : id))}
          />
          <PersonRoster
            people={people}
            isAdmin={isAdmin}
            resolveAvatar={resolveAvatar}
            reduce={reduce}
            bandLabel={bandLabel}
            onClearBand={() => setBand(null)}
          />
        </div>
      )}
    </section>
    </CollapsibleBody>
    </div>
  );
}

/* ── Red-toned days-waiting histogram (every band is overdue for sign-off) ── */
/**
 * Waiting-band colour. Only the three genuinely-overdue bands get a warning
 * colour; everything four days and under renders on a neutral grey track.
 *
 * That is the point of the scheme: when every band was the same Altus red
 * gradient, a task sent back this morning looked exactly as alarming as one
 * rotting for a month, and the row you actually needed to act on had no way to
 * stand out.
 */
const BAND_FILL: Record<string, string> = {
  w30: "#b91c1c",    // 30+ days   — red-700
  w15_30: "#ef4444", // 15–30 days — red-500
  w8_14: "#f97316",  // 8–14 days  — orange-500
  w4_7: "#e5e7eb",   // gray-200 from here down
  w2_3: "#e5e7eb",
  w1: "#e5e7eb",
  w0: "#e5e7eb",
};
/** Bands whose count is worth chasing — these read as "active". */
const ACTIVE_BANDS = new Set(["w30", "w15_30", "w8_14"]);

function BandHistogram({
  bands,
  total,
  reduce,
  selected,
  onSelect,
}: {
  bands: NotApprovedAging["bands"];
  total: number;
  reduce: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const maxBand = Math.max(...bands.map((b) => b.count), 1);

  // WORST-FIRST for display: 30+ days at the top, counting down to Today at the
  // bottom, so the most-overdue sign-offs lead the list. Reversed HERE and not
  // in `WAITING_AGING_BANDS` for the same reason the aging heatmap reverses its
  // buckets locally — the shared band list is mapped over by the transform to
  // build the payload, so flipping it there would silently reorder every other
  // consumer.
  const ordered = React.useMemo(() => [...bands].reverse(), [bands]);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        Days waiting · {total} declined {total === 1 ? "task" : "tasks"}
      </p>
      <ul className="flex flex-col gap-2">
        {ordered.map((b, i) => {
          const w = (b.count / maxBand) * 100;
          const fill = BAND_FILL[b.id] ?? "#e5e7eb";
          const clickable = b.count > 0;
          const isSelected = selected === b.id;
          return (
            <li key={b.id}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect(b.id)}
                aria-pressed={isSelected}
                aria-label={
                  clickable
                    ? `Filter the roster to the ${b.count} task(s) waiting ${b.label}`
                    : `${b.label}: no tasks`
                }
                title={
                  clickable
                    ? `${b.label}: ${b.count} task${b.count === 1 ? "" : "s"} — click to filter`
                    : undefined
                }
                className={`flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors ${
                  clickable ? "cursor-pointer hover:bg-white" : "cursor-default"
                } ${isSelected ? "bg-white ring-1 ring-gray-300" : ""}`}
              >
              <span
                className={`w-[28%] shrink-0 truncate text-[12.5px] font-bold ${
                  ACTIVE_BANDS.has(b.id) && clickable ? "text-gray-900" : "text-gray-500"
                }`}
                title={b.label}
              >
                {b.label}
              </span>
              <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-200">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: fill }}
                  initial={reduce ? false : { width: 0 }}
                  whileInView={reduce ? undefined : { width: `${w}%` }}
                  animate={reduce ? { width: `${w}%` } : undefined}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{
                    delay: reduce ? 0 : i * 0.05,
                    duration: 0.55,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </span>
              <span
                className="w-9 shrink-0 text-right text-[13px] font-black tabular-nums"
                /* The count borrows the band's colour only for the three
                   warning tiers — gray-200 would be invisible as text. */
                style={{
                  color:
                    b.count === 0
                      ? "#9ca3af"
                      : ACTIVE_BANDS.has(b.id)
                        ? fill
                        : "#4b5563",
                }}
              >
                {b.count}
              </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Person roster — most-waiting-first, each expands to its declined tasks ── */
function PersonRoster({
  people,
  isAdmin,
  resolveAvatar,
  reduce,
  bandLabel,
  onClearBand,
}: {
  people: NotApprovedPerson[];
  isAdmin: boolean;
  resolveAvatar: (employeeId: string) => string | null;
  reduce: boolean;
  /** Set while a waiting band is filtering this list. */
  bandLabel: string | null;
  onClearBand: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">
            {isAdmin ? "Assignees with Pending Re-works" : "Your declined tasks"}
          </p>
          <p className="mt-0.5 text-xs font-normal text-gray-500">
            {bandLabel
              ? `Filtered to tasks waiting ${bandLabel}`
              : isAdmin
                ? "Sorted by highest pending workload"
                : "Sent back to you, oldest first"}
          </p>
        </div>
        {bandLabel && (
          <button
            type="button"
            onClick={onClearBand}
            className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
          >
            Clear filter
          </button>
        )}
      </div>
      {people.length === 0 ? (
        <p className="text-[13.5px] font-semibold text-gray-500">
          {bandLabel
            ? "Nobody has a task waiting in that band."
            : "Nothing sent back to you — you're all clear."}
        </p>
      ) : (
        // Bounded scroll area (~4 rows) so a long roster never stretches the
        // dashboard. A soft fade-mask at the bottom edge hints "more below"
        // only when the list actually overflows; the list scrolls internally.
        <div
          className="not-approved-roster -mx-1 max-h-[17.5rem] overflow-y-auto px-1"
          style={
            people.length > 4
              ? {
                  WebkitMaskImage:
                    "linear-gradient(180deg, #000 calc(100% - 28px), transparent 100%)",
                  maskImage:
                    "linear-gradient(180deg, #000 calc(100% - 28px), transparent 100%)",
                }
              : undefined
          }
        >
          <ul className="flex flex-col gap-2.5 pb-1.5">
            {people.map((p, i) => (
              <PersonRow
                key={p.employeeId}
                person={p}
                avatarUrl={resolveAvatar(p.employeeId)}
                index={i}
                reduce={reduce}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PersonRow({
  person,
  avatarUrl,
  index,
  reduce,
}: {
  person: NotApprovedPerson;
  avatarUrl: string | null;
  index: number;
  reduce: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      animate={reduce ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        delay: reduce ? 0 : index * 0.045,
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1],
      }}
      /* White card on the section's white surface, separated by its border
         rather than by a red tint — the old 3.5% Altus-red fill made every row
         read as an alert, which defeats the point of a ranked roster. */
      className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-red-300 hover:shadow-xs"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} ${person.employeeName}'s ${person.count} declined task(s)`}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={person.employeeName} avatarUrl={avatarUrl} size={32} />
          <span className="min-w-0">
            <span
              className="block truncate text-[13.5px] font-medium text-gray-900"
              title={person.employeeName}
            >
              {person.employeeName}
            </span>
            {person.department && (
              <span className="mt-0.5 inline-block max-w-[20ch] truncate rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                {person.department}
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-red-700">
            {person.count}
          </span>
          <ChevronRight
            size={16}
            strokeWidth={2.6}
            className="shrink-0 text-gray-400 transition-transform duration-300"
            style={{ transform: open ? "rotate(90deg)" : "none" }}
          />
        </span>
      </button>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
        <ul className="flex flex-col gap-1 px-2 pb-2.5">
          {person.tasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tasks/${t.id}` as Route}
                className="flex items-start justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-subtle/60"
              >
                <span
                  className="min-w-0 text-[13px] font-semibold text-ink-soft"
                  style={{
                    lineHeight: 1.35,
                    overflowWrap: "anywhere",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                  title={t.title}
                >
                  {t.title}
                </span>
                <span
                  className="mt-0.5 shrink-0 rounded-pill px-2 py-0.5 text-[12px] font-black tabular-nums"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    color: RED,
                    background: "color-mix(in srgb, var(--color-red-deep) 10%, transparent)",
                  }}
                >
                  {t.waitingDays}d
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.li>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 flex flex-col items-center gap-2.5 px-6 py-10 text-center">
      <span
        className="inline-flex size-12 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--color-green) 14%, transparent)",
          color: "var(--color-green-deep)",
        }}
      >
        <CheckCircle2 size={24} strokeWidth={2.4} />
      </span>
      <p className="text-[14px] font-bold text-ink-soft">Nothing sent back</p>
      <p className="max-w-[240px] text-[12.5px] font-semibold text-ink-subtle">
        No declined tasks are waiting to be redone — the team is all clear.
      </p>
    </div>
  );
}
