"use client";

import * as React from "react";
import {
  motion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ChevronDown,
  Crown,
  Users,
  ArrowUpRight,
  GitBranch,
  Network,
  UserCheck,
  Target,
  CheckCircle2,
  MinusCircle,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { AttainmentRing } from "@/components/dashboard/exec/viz/attainment-ring";
import { useReducedMotion } from "@/lib/motion-utils";
import type { InitiatorScorecard } from "@/lib/types";

/* ────────────────────────────────────────────────────────────────────────
   ManagerInitiatorCard — an editorial "leadership scorecard" tile.

   A manager's initiation throughput, split by who they hand work to
   (direct reports · counterparts · founder/management), scored against a
   target via the AttainmentRing primitive (Task 6), with an expandable
   per-report breakdown.

   Brand discipline (altus-premium-ui): Altus-red tokens + color-mix tints
   over a cream-glass surface, --font-display numbers with tabular-nums,
   --font-serif name, the .wg-rise / .wg-sheen / .wg-pip-pop motion utilities,
   pointer parallax-tilt for GPU depth (reduced-motion-gated), and the Avatar
   character (avatarUrl) for the manager AND every per-report row.

   Clicking the card body opens the drill-down; the expander region stops
   propagation so toggling the breakdown never triggers the drill-down.
   ──────────────────────────────────────────────────────────────────────── */

/* Project threshold convention: green ≥100 · amber ≥60 · red below. */
const GREEN = "var(--color-green-deep)";
const AMBER = "var(--color-amber-deep)";
const RED = "var(--color-altus-red)";

function attainColor(pct: number): string {
  if (pct >= 100) return GREEN;
  if (pct >= 60) return AMBER;
  return RED;
}

/** One destination-channel stat (Direct / Counterpart / Founder / Total). */
function ChannelStat({
  icon,
  label,
  value,
  tone,
  hero = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
  hero?: boolean;
}) {
  return (
    /* `overflow-hidden` removed and padding tightened to p-2: with the longer
       labels this row now carries, the old px-3 + 0.08em tracking pushed
       "COUNTERPART" past the chip's edge and the clip ate its final T. The
       label also gets min-w-0 + a tighter track so it shrinks before it
       overflows. */
    <div
      className="relative rounded-xl border p-2"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background: hero
          ? "color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card))"
          : "var(--color-surface-card)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md"
          style={{
            background: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
          }}
        >
          {icon}
        </span>
        <span
          className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.02em]"
          style={{ color: "var(--color-ink-subtle)" }}
          title={label}
        >
          {label}
        </span>
      </div>
      <span
        className="mt-1.5 block tabular-nums leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 800,
          fontSize: hero ? 30 : 24,
          letterSpacing: "-0.02em",
          color: hero
            ? "var(--color-altus-red-deep)"
            : "var(--color-ink-strong)",
        }}
      >
        {value.toLocaleString("en-IN")}
      </span>
    </div>
  );
}

export interface ManagerInitiatorCardProps {
  scorecard: InitiatorScorecard;
  avatarUrl: string | null;
  resolveAvatar: (employeeId: string) => string | null;
  onOpenDrilldown: (managerId: string) => void;
}

export function ManagerInitiatorCard({
  scorecard,
  avatarUrl,
  resolveAvatar,
  onOpenDrilldown,
}: ManagerInitiatorCardProps) {
  const {
    managerId,
    managerName,
    directReports,
    totalInitiated,
    toDirectReports,
    toDownline,
    toCounterparts,
    toFounderMgmt,
    toSelf,
    target,
    actual,
    attainmentPct,
    workingDays,
    perReportPerDay,
    perReport,
  } = scorecard;

  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = React.useState(false);

  // Pointer parallax-tilt (GPU-only, transform/opacity). Springs settle at 0;
  // never engaged under reduced motion (handlers no-op).
  const rx = useSpring(0, { stiffness: 150, damping: 18 });
  const ry = useSpring(0, { stiffness: 150, damping: 18 });
  const tiltX = useTransform(rx, (v) => `${v}deg`);
  const tiltY = useTransform(ry, (v) => `${v}deg`);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const b = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - 0.5;
    const py = (e.clientY - b.top) / b.height - 0.5;
    ry.set(px * 6);
    rx.set(-py * 6);
  }
  function onLeave() {
    rx.set(0);
    ry.set(0);
  }

  const color = attainColor(attainmentPct);
  const hitCount = perReport.filter((r) => r.hit).length;

  return (
    <motion.section
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={() => onOpenDrilldown(managerId)}
      style={
        reduce
          ? { transformPerspective: 1000 }
          : { rotateX: tiltX, rotateY: tiltY, transformPerspective: 1000 }
      }
      className="wg-rise wg-sheen group relative cursor-pointer overflow-hidden rounded-2xl border"
      aria-label={`${managerName} — initiation scorecard. Open drill-down.`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDrilldown(managerId);
        }
      }}
    >
      {/* Surface: cream-glass + aurora wash */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 4%, #FBF7F0) 0%, #F4EEE3 100%)",
          borderColor: "var(--color-hairline-strong)",
        }}
        aria-hidden
      />
      <span
        className="kpi-aurora-primary"
        style={{
          ["--kpi-tone" as string]:
            "color-mix(in srgb, var(--color-altus-red) 60%, transparent)",
        }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          border: "1px solid var(--color-hairline-strong)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 18px 40px -22px rgba(168,4,0,0.35), 0 4px 12px -6px rgba(15,23,42,0.18)",
        }}
        aria-hidden
      />

      <div className="relative p-6 max-md:p-4">
        {/* ── Header: avatar (character) + name + direct reports + ring ── */}
        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0">
            <Avatar
              name={managerName}
              avatarUrl={avatarUrl}
              size={56}
              className="ring-2 ring-white/70"
            />
            <span
              className="absolute -right-1 -top-1 inline-flex size-6 items-center justify-center rounded-full text-white shadow"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              }}
              title="Manager"
              aria-hidden
            >
              <Crown size={13} strokeWidth={2.6} />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-black uppercase tracking-[0.16em]"
              style={{ color: "var(--color-altus-red-deep)" }}
            >
              Manager · Initiator
            </p>
            <h3
              className="mt-0.5 truncate text-[20px] font-black leading-tight"
              style={{
                fontFamily: "var(--font-serif), serif",
                color: "var(--color-ink-strong)",
              }}
              title={managerName}
            >
              {managerName}
            </h3>
            <p
              className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-bold"
              style={{ color: "var(--color-ink-soft)" }}
            >
              <Users
                size={13}
                strokeWidth={2.6}
                style={{ color: "var(--color-ink-subtle)" }}
              />
              <span className="tabular-nums">{directReports}</span>
              {directReports === 1 ? "direct report" : "direct reports"}
            </p>
          </div>

          {/* Attainment ring (Task 6 primitive). Fixed footprint + a hair of
              padding so the ≥100% glow halo is never clipped by the card. */}
          <div className="shrink-0 px-1 pt-0.5 text-center">
            <AttainmentRing value={actual} max={target} size={120} />
            <p
              className="mt-1 text-[11px] font-bold tabular-nums"
              style={{ color: "var(--color-ink-subtle)" }}
            >
              <span style={{ color }}>{actual.toLocaleString("en-IN")}</span>
              {" / "}
              {target.toLocaleString("en-IN")}
            </p>
            {/* The formula, spelled out from the SAME numbers that produced the
                target — so the caption cannot drift from the arithmetic. */}
            <p
              className="mt-0.5 text-[10px] font-semibold leading-tight"
              style={{ color: "var(--color-ink-subtle)" }}
            >
              Target = {perReportPerDay} × {workingDays} working day
              {workingDays === 1 ? "" : "s"} × direct reports
            </p>
          </div>
        </div>

        {/* ── Channel split — six mutually-exclusive delegation channels, so
            Direct + Downline + Counterpart + Founder + Self always equals
            Total. Direct is the hero: it is the only channel scored against
            the target. Five across on xl, folding to 3 then 2 so no chip is
            ever narrow enough to clip its own label. ── */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <ChannelStat
            icon={<GitBranch size={12} strokeWidth={2.6} />}
            label="Direct"
            value={toDirectReports}
            tone="var(--color-altus-red)"
            hero
          />
          <ChannelStat
            icon={<Network size={12} strokeWidth={2.6} />}
            label="Downline"
            value={toDownline}
            tone="var(--color-amber-deep, #B45309)"
          />
          <ChannelStat
            icon={<ArrowUpRight size={12} strokeWidth={2.6} />}
            label="Counterpart"
            value={toCounterparts}
            tone="var(--color-blue)"
          />
          <ChannelStat
            icon={<Crown size={12} strokeWidth={2.6} />}
            label="Founder"
            value={toFounderMgmt}
            tone="var(--color-purple)"
          />
          <ChannelStat
            icon={<UserCheck size={12} strokeWidth={2.6} />}
            label="Self"
            value={toSelf}
            tone="var(--color-green-deep, #15803D)"
          />
          <ChannelStat
            icon={<Target size={12} strokeWidth={2.6} />}
            label="Total"
            value={totalInitiated}
            tone="var(--color-ink-soft)"
          />
        </div>

        {/* ── Expandable per-report breakdown (stops drill-down) ── */}
        {perReport.length > 0 && (
          <div
            className="mt-4"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              aria-expanded={open}
              className="brand-btn wg-btn flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left"
              style={{
                borderColor: "var(--color-hairline-strong)",
                background:
                  "color-mix(in srgb, var(--color-altus-red) 4%, var(--color-surface-card))",
              }}
            >
              <span
                className="text-[12.5px] font-black"
                style={{ color: "var(--color-ink-strong)" }}
              >
                Show Breakdown
                <span
                  className="ml-2 font-bold tabular-nums"
                  style={{ color: "var(--color-ink-subtle)" }}
                >
                  {hitCount}/{perReport.length}
                </span>
              </span>
              <ChevronDown
                size={17}
                strokeWidth={2.6}
                className="transition-transform duration-300"
                style={{
                  color: "var(--color-altus-red)",
                  transform: open ? "rotate(180deg)" : "none",
                }}
              />
            </button>

            <motion.div
              initial={false}
              animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <ul className="mt-2.5 flex flex-col gap-2">
                {perReport.map((r, i) => {
                  const pct =
                    r.goal > 0
                      ? Math.min(100, (r.given / r.goal) * 100)
                      : r.given > 0
                        ? 100
                        : 0;
                  const barColor = r.hit ? GREEN : pct >= 60 ? AMBER : RED;
                  return (
                    <motion.li
                      key={r.employeeId}
                      initial={open ? { opacity: 0, y: 6 } : false}
                      animate={open ? { opacity: 1, y: 0 } : {}}
                      transition={{
                        delay: open ? i * 0.04 : 0,
                        duration: 0.3,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                      style={{
                        background:
                          "color-mix(in srgb, var(--color-ink-strong) 2.5%, transparent)",
                      }}
                    >
                      <Avatar
                        name={r.employeeName}
                        avatarUrl={resolveAvatar(r.employeeId)}
                        size={30}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="truncate text-[13px] font-bold"
                            style={{ color: "var(--color-ink-strong)" }}
                            title={r.employeeName}
                          >
                            {r.employeeName}
                          </span>
                          <span
                            className="shrink-0 text-[12px] font-black tabular-nums"
                            style={{ color: barColor }}
                          >
                            {r.given}
                            <span
                              className="font-semibold"
                              style={{ color: "var(--color-ink-subtle)" }}
                            >
                              {" / "}
                              {r.goal}
                            </span>
                          </span>
                        </div>

                        {/* Hierarchy line — only rendered for reports who
                            themselves manage people. `downlineGiven` is work
                            the manager routed PAST this person into their team,
                            which is the number worth seeing next to their own. */}
                        {(r.reportCount > 0 || r.downlineGiven > 0) && (
                          <div
                            className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] font-semibold"
                            style={{ color: "var(--color-ink-subtle)" }}
                          >
                            {r.reportCount > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Network size={10} strokeWidth={2.6} />
                                <span className="tabular-nums">{r.reportCount}</span>
                                {r.reportCount === 1 ? "report" : "reports"}
                              </span>
                            )}
                            {r.downlineGiven > 0 && (
                              <span
                                className="inline-flex items-center gap-1"
                                style={{ color: "var(--color-amber-deep, #B45309)" }}
                                title={`${r.downlineGiven} task(s) assigned directly into ${r.employeeName}'s team, bypassing them`}
                              >
                                <span className="tabular-nums">{r.downlineGiven}</span>
                                to downline
                              </span>
                            )}
                          </div>
                        )}
                        <div
                          className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                          style={{
                            background:
                              "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)",
                          }}
                        >
                          <motion.span
                            className="block h-full rounded-full"
                            style={{ background: barColor }}
                            initial={{ width: 0 }}
                            animate={{ width: open ? `${pct}%` : 0 }}
                            transition={{
                              delay: open ? i * 0.04 + 0.1 : 0,
                              duration: 0.5,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                          />
                        </div>
                      </div>
                      <span
                        className="shrink-0"
                        title={r.hit ? "On goal" : "Below goal"}
                        style={{
                          color: r.hit ? GREEN : "var(--color-ink-subtle)",
                        }}
                      >
                        {r.hit ? (
                          <CheckCircle2
                            size={17}
                            strokeWidth={2.6}
                            className="wg-pip-pop"
                          />
                        ) : (
                          <MinusCircle size={17} strokeWidth={2.4} />
                        )}
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            </motion.div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
