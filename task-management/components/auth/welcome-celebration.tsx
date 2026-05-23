"use client";

import Link from "next/link";
import type { Route } from "next";
import { motion } from "motion/react";
import {
  ListTodo,
  LayoutDashboard,
  Inbox,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";

type Card = {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  href: string;
};

export function WelcomeCelebration({
  firstName,
  isAdmin,
  nextDestination = "/",
}: {
  firstName: string;
  isAdmin: boolean;
  /** Where "Take me in" should land — defaults to `/`. The login flow
   *  forwards the user's originally requested page through here so deep
   *  links survive the always-on welcome detour. */
  nextDestination?: string;
}) {
  // 24 confetti pieces — random offset + rotation cached for the component
  const confetti = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: `${(i * 4.3 + 6) % 100}%`,
        delay: (i * 73) % 900,
        duration: 2400 + ((i * 137) % 1400),
        cx: ((i * 47) % 240) - 120,
        cr: ((i * 109) % 720) - 360,
        color: [
          "var(--color-altus-red)",
          "var(--color-rose)",
          "var(--color-amber)",
          "var(--color-green)",
          "var(--color-blue)",
          "var(--color-purple)",
        ][i % 6]!,
        size: 6 + ((i * 11) % 6),
      })),
    [],
  );

  const cards: Array<Card> = [
    {
      icon: ListTodo,
      title: "Your tasks",
      description:
        "What's on your plate today, ordered by due date and priority.",
      accent: "var(--color-blue)",
      href: "/tasks",
    },
    {
      icon: LayoutDashboard,
      title: "The dashboard",
      description: "Team-wide KPIs, velocity, and aging at a glance.",
      accent: "var(--color-green)",
      href: "/",
    },
    {
      icon: Inbox,
      title: "Your inbox",
      description:
        "Every event on tasks you're part of — status moves, comments, approvals.",
      accent: "var(--color-purple)",
      href: "/inbox",
    },
  ];

  if (isAdmin) {
    cards.push({
      icon: ShieldCheck,
      title: "Admin panel",
      description:
        "Invite teammates, manage roles, and shape the operation.",
      accent: "var(--color-altus-red)",
      href: "/admin/employees",
    });
  }

  return (
    <div className="relative">
      {/* Cinematic gradient sweep across the brand area, fires once on mount */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-16 h-40 overflow-hidden"
      >
        <div
          className="absolute inset-y-0 w-1/3"
          style={{
            background:
              "linear-gradient(110deg, transparent, rgba(225, 6, 0, 0.18), rgba(168, 85, 247, 0.18), rgba(59, 130, 246, 0.18), transparent)",
            animation:
              "welcomeSweep 1600ms cubic-bezier(0.2, 0.7, 0.3, 1) 200ms both",
          }}
        />
      </div>

      {/* Confetti burst */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-20 h-[520px] overflow-hidden"
      >
        {confetti.map((p, i) => (
          <span
            key={i}
            className="absolute top-0 rounded-sm"
            style={{
              left: p.left,
              width: p.size,
              height: p.size * 0.4,
              background: p.color,
              opacity: 0.85,
              ["--cx" as string]: `${p.cx}px`,
              ["--cr" as string]: `${p.cr}deg`,
              animation: `confettiFall ${p.duration}ms cubic-bezier(0.2, 0.7, 0.3, 1) ${p.delay}ms both`,
            }}
          />
        ))}
      </div>

      {/* Eyebrow */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.2, 0.7, 0.3, 1] }}
        className="flex items-center justify-center gap-2"
      >
        <Sparkles
          className="h-4 w-4"
          style={{ color: "var(--color-altus-red)" }}
          aria-hidden
        />
        <span
          className="text-table-head"
          style={{
            color: "var(--color-altus-red)",
            letterSpacing: "0.14em",
          }}
        >
          You're in
        </span>
        <Sparkles
          className="h-4 w-4"
          style={{ color: "var(--color-altus-red)" }}
          aria-hidden
        />
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.2, 0.7, 0.3, 1] }}
        className="mt-4 text-center font-serif text-[#0F172A]"
        style={{
          fontStyle: "italic",
          fontSize: 64,
          lineHeight: 0.95,
          letterSpacing: "-0.03em",
          fontWeight: 400,
        }}
      >
        Welcome,{" "}
        <span
          style={{
            // inline-block + paddingRight extends the gradient span's
            // bounding box so italic letterforms (whose right edge slants
            // past the glyph box) don't get clipped by background-clip: text.
            display: "inline-block",
            paddingRight: "0.18em",
            background:
              "linear-gradient(135deg, #ff5560, var(--color-altus-red), var(--color-purple))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {firstName}
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.45 }}
        className="mx-auto mt-4 max-w-[480px] text-center text-[15px] leading-[1.6]"
        style={{ color: "var(--color-ink-soft)" }}
      >
        Your account is live. Here's the shape of your new operations cockpit —
        explore at your own pace.
      </motion.p>

      {/* Cards grid */}
      <div
        className="mt-10 grid gap-4"
        style={{
          gridTemplateColumns: cards.length === 4
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {cards.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 0.55 + i * 0.08,
              ease: [0.2, 0.7, 0.3, 1],
            }}
          >
            <Link
              href={c.href as Route}
              className="group block rounded-2xl p-5 transition-all duration-300"
              style={{
                background: "rgba(255, 255, 255, 0.7)",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                boxShadow:
                  "0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 1px 3px rgba(15, 23, 42, 0.04)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = `0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 24px 48px -16px color-mix(in srgb, ${c.accent} 35%, transparent), 0 4px 12px rgba(15, 23, 42, 0.06)`;
                e.currentTarget.style.borderColor = `color-mix(in srgb, ${c.accent} 40%, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow =
                  "0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 1px 3px rgba(15, 23, 42, 0.04)";
                e.currentTarget.style.borderColor = "rgba(15, 23, 42, 0.08)";
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, ${c.accent} 20%, white), color-mix(in srgb, ${c.accent} 8%, white))`,
                    color: c.accent,
                    border: `1px solid color-mix(in srgb, ${c.accent} 25%, transparent)`,
                    boxShadow: `0 4px 12px -2px color-mix(in srgb, ${c.accent} 25%, transparent)`,
                  }}
                >
                  <c.icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3
                    className="font-serif"
                    style={{
                      fontStyle: "italic",
                      fontSize: 19,
                      letterSpacing: "-0.015em",
                      color: "#0F172A",
                      lineHeight: 1.15,
                    }}
                  >
                    {c.title}
                  </h3>
                  <p
                    className="mt-1.5 text-[13px] leading-[1.5]"
                    style={{ color: "var(--color-ink-subtle)" }}
                  >
                    {c.description}
                  </p>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.55,
          delay: 0.55 + cards.length * 0.08 + 0.1,
          ease: [0.2, 0.7, 0.3, 1],
        }}
        className="mt-10 flex justify-center"
      >
        <Link
          href={nextDestination as Route}
          className="auth-cta group"
          style={{ maxWidth: 320 }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.22) 50%, transparent 70%)",
              backgroundSize: "200% 100%",
              animation: "accentStripFlow 2.6s linear infinite",
            }}
          />
          <span>Take me in</span>
          <ArrowRight
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5"
            aria-hidden
          />
        </Link>
      </motion.div>

      {/* Quick-tour note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.4,
          delay: 0.55 + cards.length * 0.08 + 0.25,
        }}
        className="mt-5 text-center text-[13px]"
        style={{ color: "var(--color-ink-subtle)" }}
      >
        Tip: every page has a help-shaped tour. Press{" "}
        <kbd
          className="rounded px-1.5 py-0.5 font-mono text-[11px]"
          style={{
            background: "rgba(15, 23, 42, 0.06)",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            color: "var(--color-ink-soft)",
          }}
        >
          ?
        </kbd>{" "}
        anywhere to open it.
      </motion.p>
    </div>
  );
}
