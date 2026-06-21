"use client";

import * as React from "react";
import { motion } from "motion/react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useReducedMotion } from "@/lib/motion-utils";
import type { NotApprovedAging, NotApprovedPerson } from "@/lib/types";

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
  const people = isAdmin ? byPerson : byPerson.filter((p) => p.employeeId === meId);

  return (
    <section
      className="wg-rise relative overflow-hidden rounded-section p-7 max-md:p-5"
      aria-label="Attention required — declined tasks"
      style={{
        background:
          "linear-gradient(155deg, color-mix(in srgb, #ffffff 86%, transparent) 0%, color-mix(in srgb, var(--color-surface-card) 92%, transparent) 100%)",
        border: "1px solid var(--color-hairline-strong)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.05), 0 22px 54px -30px rgba(225,6,0,0.24), inset 0 1px 0 rgba(255,255,255,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        ["--kpi-tone" as string]: "color-mix(in srgb, var(--color-altus-red) 70%, transparent)",
        ["--kpi-tone-deep" as string]:
          "color-mix(in srgb, var(--color-altus-red-deep) 55%, transparent)",
      }}
    >
      {/* Aurora wash */}
      <span aria-hidden className="kpi-aurora-primary" />
      <span aria-hidden className="kpi-aurora-secondary" />

      <div className="relative">
        {/* ── Header ── */}
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--color-altus-red) 13%, transparent)",
              color: RED_BRAND,
            }}
          >
            <AlertTriangle size={18} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2
              className="leading-none text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 19,
                letterSpacing: "-0.02em",
              }}
            >
              Attention Required
            </h2>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-none text-ink-subtle">
              <span className="font-black tabular-nums" style={{ color: RED }}>
                {total}
              </span>{" "}
              declined · waiting to be redone
            </p>
          </div>
        </div>

        {total === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-6 flex flex-col gap-7">
            <BandHistogram bands={bands} total={total} reduce={reduce} />
            <PersonRoster
              people={people}
              isAdmin={isAdmin}
              resolveAvatar={resolveAvatar}
              reduce={reduce}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Red-toned days-waiting histogram (every band is overdue for sign-off) ── */
function BandHistogram({
  bands,
  total,
  reduce,
}: {
  bands: NotApprovedAging["bands"];
  total: number;
  reduce: boolean;
}) {
  const maxBand = Math.max(...bands.map((b) => b.count), 1);

  return (
    <div>
      <p className="mb-3 text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
        Days waiting · {total} declined {total === 1 ? "task" : "tasks"}
      </p>
      <ul className="flex flex-col gap-2">
        {bands.map((b, i) => {
          const w = (b.count / maxBand) * 100;
          return (
            <li key={b.id} className="flex items-center gap-3">
              <span
                className="w-[28%] shrink-0 truncate text-[12.5px] font-bold text-ink-strong"
                title={b.label}
              >
                {b.label}
              </span>
              <span
                className="relative h-3 flex-1 overflow-hidden rounded-full"
                style={{
                  background: "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)",
                }}
              >
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--color-altus-red), var(--color-red-deep))",
                  }}
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
                style={{ color: b.count > 0 ? RED : "var(--color-ink-subtle)" }}
              >
                {b.count}
              </span>
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
}: {
  people: NotApprovedPerson[];
  isAdmin: boolean;
  resolveAvatar: (employeeId: string) => string | null;
  reduce: boolean;
}) {
  return (
    <div>
      <p className="mb-2.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
        {isAdmin ? "By person · most waiting first" : "Your declined tasks"}
      </p>
      {people.length === 0 ? (
        <p className="text-[13.5px] font-semibold text-ink-subtle">
          Nothing sent back to you — you&apos;re all clear.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
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
      className="wg-sheen overflow-hidden rounded-xl border"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background:
          "color-mix(in srgb, var(--color-altus-red) 3.5%, var(--color-surface-card))",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <Avatar name={person.employeeName} avatarUrl={avatarUrl} size={34} />
        <span
          className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-strong"
          title={person.employeeName}
        >
          {person.employeeName}
        </span>
        <span
          className="shrink-0 rounded-pill px-2.5 py-1 text-[12.5px] font-black tabular-nums"
          style={{
            color: RED,
            background: "color-mix(in srgb, var(--color-red-deep) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-red-deep) 28%, transparent)",
          }}
        >
          {person.count}
        </span>
        <ChevronRight
          size={16}
          strokeWidth={2.6}
          className="shrink-0 transition-transform duration-300"
          style={{
            color: RED_BRAND,
            transform: open ? "rotate(90deg)" : "none",
          }}
        />
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
