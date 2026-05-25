"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Left-half visual showcase for the login page.
 *
 * Composition (bottom → top of the stack):
 *   1. Deep gradient base (navy → charcoal-purple).
 *   2. Three slowly rotating gradient orbs (red / purple / blue) with
 *      `mix-blend-mode: screen`.
 *   3. Fine dotted texture (1px, 24px spacing, ~5% opacity).
 *   4. Mouse-following warm-red spotlight driven via CSS custom properties
 *      `--spot-x` / `--spot-y` (rAF-lerped for buttery smoothness).
 *   5. Foreground: centered wordmark, tagline, three floating product-stat
 *      cards with parallax + bob, eyebrow trust line at bottom-left.
 *
 * Reduced-motion: orbs/bob freeze, spotlight + parallax stay off (we never
 * attach the mousemove listener).
 */
export function LoginShowcase() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  // Mouse-tracked spotlight + card parallax. The actual cursor position is
  // captured on a passive mousemove handler; we update a target and then lerp
  // toward it on every frame via rAF. This keeps the spotlight smooth even
  // when the cursor moves fast.
  useEffect(() => {
    if (prefersReducedMotion) return;
    const stage = stageRef.current;
    if (!stage) return;

    // Only on hover-capable devices (skip touch — the listener would never
    // fire meaningfully and we save a frame loop).
    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches) {
      return;
    }

    const rect = { x: 0, y: 0, w: 0, h: 0 };
    function measure() {
      const r = stage!.getBoundingClientRect();
      rect.x = r.left;
      rect.y = r.top;
      rect.w = r.width;
      rect.h = r.height;
    }
    measure();
    window.addEventListener("resize", measure);

    // Start centered so the first paint isn't off in the corner.
    let targetX = rect.w * 0.5;
    let targetY = rect.h * 0.45;
    let currentX = targetX;
    let currentY = targetY;
    let raf = 0;

    function onMove(e: MouseEvent) {
      targetX = e.clientX - rect.x;
      targetY = e.clientY - rect.y;
    }

    function frame() {
      // 0.12 = comfortable ~200ms lerp toward the target.
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;

      stage!.style.setProperty("--spot-x", `${currentX}px`);
      stage!.style.setProperty("--spot-y", `${currentY}px`);

      // Cards drift gently opposite to the cursor for cheap parallax.
      const cards = cardsRef.current;
      if (cards) {
        const ox = (currentX / rect.w - 0.5) * -16;
        const oy = (currentY / rect.h - 0.5) * -10;
        cards.style.setProperty("--parX", `${ox}px`);
        cards.style.setProperty("--parY", `${oy}px`);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(raf);
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full overflow-hidden text-white"
      style={{
        // Deep navy → charcoal-purple base
        background:
          "radial-gradient(ellipse 120% 80% at 50% 0%, #1a1230 0%, transparent 60%), linear-gradient(180deg, #0B0F1E 0%, #090C18 100%)",
        // Initial spotlight position (gets updated by rAF after mount)
        ["--spot-x" as string]: "50%",
        ["--spot-y" as string]: "45%",
      }}
    >
      {/* Vertical cyan brand stripe on the left edge */}
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px] z-30"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgb(168, 4, 0) 18%, rgb(244, 85, 77) 50%, rgb(168, 4, 0) 82%, transparent 100%)",
          boxShadow: "0 0 12px rgba(225, 6, 0, 0.6)",
          backgroundSize: "100% 200%",
          animation: "accentStripFlowV 18s linear infinite",
        }}
      />

      {/* ───────────── Rotating gradient orbs ───────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[10%] -left-[15%] h-[60vw] w-[60vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(225, 6, 0, 0.50), rgba(225, 6, 0, 0) 70%)",
          mixBlendMode: "screen",
          filter: "blur(10px)",
          animation: "orbDriftA 48s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[25%] -right-[10%] h-[65vw] w-[65vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(168, 85, 247, 0.50), rgba(168, 85, 247, 0) 70%)",
          mixBlendMode: "screen",
          filter: "blur(12px)",
          animation: "orbDriftB 56s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[30%] -right-[20%] h-[55vw] w-[55vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(59, 130, 246, 0.40), rgba(59, 130, 246, 0) 70%)",
          mixBlendMode: "screen",
          filter: "blur(14px)",
          animation: "orbDriftC 62s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[5%] left-[20%] h-[35vw] w-[35vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(244, 63, 94, 0.30), rgba(244, 63, 94, 0) 70%)",
          mixBlendMode: "screen",
          filter: "blur(16px)",
          animation: "orbDriftA 70s ease-in-out infinite reverse",
        }}
      />

      {/* Fine dotted texture (5% opacity, 24px spacing) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255, 255, 255, 0.18) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: 0.5,
          maskImage:
            "radial-gradient(ellipse 100% 80% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 100% 80% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      {/* Mouse-tracked cyan spotlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle 600px at var(--spot-x) var(--spot-y), rgba(225, 6, 0, 0.22), transparent 70%)",
        }}
      />

      {/* Subtle vignette around the edges so the centerpiece reads */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 50%, transparent 50%, rgba(0, 0, 0, 0.35) 100%)",
        }}
      />

      {/* ───────────── Foreground content ───────────── */}
      <div className="relative z-10 flex h-full w-full flex-col">
        {/* Top spacer */}
        <div className="flex-1" />

        {/* Centerpiece — logo lockup + cinematic wordmark + tagline */}
        <div className="px-[8%] flex flex-col items-start">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
            className="mb-6 inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3"
            style={{ boxShadow: "0 6px 20px rgba(0, 0, 0, 0.3)" }}
          >
            <img
              src="/logo.png"
              alt="Altus Corp"
              style={{ height: 104, width: "auto", display: "block" }}
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
            className="relative"
          >
            <h1
              className="font-serif"
              style={{
                fontStyle: "italic",
                fontSize: "clamp(44px, 5.6vw, 86px)",
                lineHeight: 1.0,
                letterSpacing: "-0.035em",
                fontWeight: 500,
                color: "#FFFFFF",
                whiteSpace: "nowrap",
              }}
            >
              Altus{" "}
              <span
                style={{
                  background:
                    "linear-gradient(110deg, #A5F3FC 0%, #F4554D 30%, #E10600 55%, #A80400 80%, #A5F3FC 100%)",
                  backgroundSize: "200% 100%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  animation: "wordmarkShimmer 8s ease-in-out infinite",
                  display: "inline-block",
                }}
              >
                Corp.
              </span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.2, 0.7, 0.3, 1] }}
            className="mt-7 max-w-[440px]"
          >
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.5,
                color: "rgba(255, 255, 255, 0.92)",
                fontWeight: 500,
              }}
            >
              Operations clarity for Altus Corp.
            </p>
            <p
              className="mt-1"
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                color: "rgba(255, 255, 255, 0.55)",
                fontWeight: 400,
              }}
            >
              Tasks, performance, accountability &mdash; at a glance.
            </p>
          </motion.div>
        </div>

        {/* Spacer between centerpiece and stat cards */}
        <div className="h-12" />

        {/* Floating product-stat cards (loose diagonal stack) */}
        <div
          ref={cardsRef}
          className="px-[8%] pb-20 relative"
          style={{
            ["--parX" as string]: "0px",
            ["--parY" as string]: "0px",
          }}
        >
          <div className="relative h-[180px]">
            <FloatingStat
              delay={0.45}
              bobDelay="0s"
              parallaxStrength={1}
              className="absolute left-0 top-0 w-[260px]"
              icon={<TaskIcon />}
              kicker="LIVE"
              kickerTone="green"
              value="1,247"
              label="tasks tracked this quarter"
              trend={<MiniSpark trend="up" tint="#22c55e" />}
            />
            <FloatingStat
              delay={0.55}
              bobDelay="-2.5s"
              parallaxStrength={1.4}
              className="absolute left-[200px] top-[58px] w-[240px]"
              icon={<TeamIcon />}
              kicker="ONBOARDED"
              kickerTone="blue"
              value="12 teams"
              label="across three departments"
              trend={<ArrowChip tone="up" label="+3 this month" />}
            />
            <FloatingStat
              delay={0.65}
              bobDelay="-5s"
              parallaxStrength={0.7}
              className="absolute left-[60px] top-[120px] w-[260px]"
              icon={<CheckIcon />}
              kicker="APPROVALS"
              kickerTone="rose"
              value="98%"
              label="on-time approval rate"
              trend={<MiniSpark trend="up" tint="#f43f5e" />}
            />
          </div>
        </div>

        {/* Bottom trust eyebrow */}
        <div className="px-[8%] pb-7 pt-2">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="flex items-center gap-3"
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: "rgb(225, 6, 0)",
                boxShadow: "0 0 12px rgba(225, 6, 0, 0.7)",
                animation: "livePulse 1.8s ease-in-out infinite",
              }}
            />
            <span
              className="text-brand-pill"
              style={{
                color: "rgba(255, 255, 255, 0.55)",
                letterSpacing: "0.18em",
                fontSize: 11,
              }}
            >
              Built for the{" "}
              <span style={{ color: "#F4554D", fontWeight: 800 }}>
                Altus Corp
              </span>{" "}
              &middot; team
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Floating stat card

function FloatingStat({
  delay,
  bobDelay,
  parallaxStrength,
  icon,
  kicker,
  kickerTone,
  value,
  label,
  trend,
  className,
}: {
  delay: number;
  bobDelay: string;
  parallaxStrength: number;
  icon: React.ReactNode;
  kicker: string;
  kickerTone: "green" | "blue" | "rose";
  value: string;
  label: string;
  trend: React.ReactNode;
  className?: string;
}) {
  const kickerColor =
    kickerTone === "green"
      ? "#86efac"
      : kickerTone === "blue"
        ? "#93c5fd"
        : "#fda4af";
  const kickerGlow =
    kickerTone === "green"
      ? "rgba(34, 197, 94, 0.45)"
      : kickerTone === "blue"
        ? "rgba(59, 130, 246, 0.45)"
        : "rgba(244, 63, 94, 0.45)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0.7, 0.3, 1] }}
      className={className}
      style={{
        // Drift opposite to the cursor for parallax. parallaxStrength scales
        // the multiplier per-card so the stack reads as 3D, not a slab.
        transform: `translate3d(calc(var(--parX, 0px) * ${parallaxStrength}), calc(var(--parY, 0px) * ${parallaxStrength}), 0)`,
        transition: "transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1)",
        willChange: "transform",
      }}
    >
      <div
        style={{
          animation: `cardBob 7.5s ease-in-out infinite`,
          animationDelay: bobDelay,
        }}
      >
        <div
          className="relative rounded-2xl p-4"
          style={{
            background:
              "linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.04) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            backdropFilter: "blur(14px) saturate(140%)",
            WebkitBackdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "0 1px 0 rgba(255, 255, 255, 0.10) inset, 0 16px 36px -16px rgba(0, 0, 0, 0.55), 0 4px 14px -6px rgba(0, 0, 0, 0.35)",
          }}
        >
          {/* Inner highlight */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255, 255, 255, 0.10), transparent 70%)",
            }}
          />
          <div className="relative flex items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.06))",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "rgba(255, 255, 255, 0.88)",
              }}
            >
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-brand-pill"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: kickerColor,
                  textShadow: `0 0 12px ${kickerGlow}`,
                }}
              >
                {kicker}
              </div>
              <div
                className="mt-1 font-serif text-white tabular-nums"
                style={{
                  fontStyle: "italic",
                  fontSize: 26,
                  lineHeight: 1,
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                }}
              >
                {value}
              </div>
              <div
                className="mt-1.5"
                style={{
                  fontSize: 12,
                  lineHeight: 1.35,
                  color: "rgba(255, 255, 255, 0.62)",
                }}
              >
                {label}
              </div>
            </div>
            <div className="shrink-0 self-end">{trend}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mini SVG decorations

function MiniSpark({ trend, tint }: { trend: "up" | "down"; tint: string }) {
  // Hand-tuned y-values; trend "down" simply mirrors vertically.
  const upPath = "M2 18 L8 14 L14 16 L20 10 L26 12 L32 4";
  const downPath = "M2 4 L8 8 L14 6 L20 12 L26 10 L32 18";
  return (
    <svg
      width="40"
      height="22"
      viewBox="0 0 34 22"
      aria-hidden
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`sparkFill-${tint}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tint} stopOpacity="0.35" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${trend === "up" ? upPath : downPath} L32 22 L2 22 Z`}
        fill={`url(#sparkFill-${tint})`}
      />
      <path
        d={trend === "up" ? upPath : downPath}
        fill="none"
        stroke={tint}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="32"
        cy={trend === "up" ? 4 : 18}
        r="2"
        fill={tint}
        style={{ filter: `drop-shadow(0 0 4px ${tint})` }}
      />
    </svg>
  );
}

function ArrowChip({
  tone,
  label,
}: {
  tone: "up" | "down";
  label: string;
}) {
  const color = tone === "up" ? "#86efac" : "#fca5a5";
  const bg = tone === "up" ? "rgba(34, 197, 94, 0.15)" : "rgba(225, 6, 0, 0.15)";
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
      style={{
        background: bg,
        border: `1px solid ${color}33`,
        color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
        <path
          d={tone === "up" ? "M5 1 L9 6 L6 6 L6 9 L4 9 L4 6 L1 6 Z" : "M5 9 L1 4 L4 4 L4 1 L6 1 L6 4 L9 4 Z"}
          fill={color}
        />
      </svg>
      {label}
    </div>
  );
}

function TaskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
      <rect
        x="2"
        y="3"
        width="12"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5 7h6M5 10h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function TeamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
      <circle cx="6" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2 13c0-2 1.8-3.4 4-3.4S10 11 10 13M9.5 13c0-1.4 1.2-2.4 2.6-2.4S14.7 11.6 14.7 13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.2 8.2 L7.2 10.2 L10.8 5.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
