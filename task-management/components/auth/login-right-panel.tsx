"use client";

import { Suspense, type ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Right-side surface — Altus Corp brand pill in the top-right + a vertically
 * centered well that fades in from a small translate-x. Wraps its children in
 * a Suspense boundary because `LoginForm` reads search params (Next 16
 * requires Suspense around `useSearchParams` consumers).
 */
export function LoginRightPanel({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Brand pill in the top-right corner */}
      <div className="relative z-10 flex items-center justify-end px-8 pt-8 max-md:px-6 max-md:pt-6">
        <motion.span
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="inline-flex items-center text-brand-pill text-white rounded-brand"
          style={{
            background:
              "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
            boxShadow: "0 4px 14px rgba(225, 6, 0, 0.38)",
            fontSize: 10,
            letterSpacing: "0.12em",
            padding: "5px 12px",
          }}
        >
          Altus Corp
        </motion.span>
      </div>

      {/* Form well — vertically centered, slides in from the right */}
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.2, 0.7, 0.3, 1] }}
        className="relative z-10 flex flex-1 items-center justify-center px-8 pb-12 max-md:px-6"
      >
        <div className="w-full max-w-[420px]">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </motion.div>
    </>
  );
}
