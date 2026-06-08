"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import {
  TOAST_EVENT_NAME,
  consumeHandler,
  type ToastDetail,
} from "@/lib/toast";

interface ActiveToast extends ToastDetail {
  timer: ReturnType<typeof setTimeout>;
}

export function ToastHost() {
  const [toasts, setToasts] = React.useState<ActiveToast[]>([]);

  React.useEffect(() => {
    function onEvent(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail) return;
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, 4000);
      setToasts((prev) => [...prev, { ...detail, timer }]);
    }
    window.addEventListener(TOAST_EVENT_NAME, onEvent);
    return () => window.removeEventListener(TOAST_EVENT_NAME, onEvent);
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => {
      const t = prev.find((x) => x.id === id);
      if (t) clearTimeout(t.timer);
      return prev.filter((x) => x.id !== id);
    });
  }

  async function runAction(id: string) {
    const fn = consumeHandler(id);
    dismiss(id);
    if (fn) await fn();
  }

  return (
    <div
      aria-live="polite"
      className="fixed top-5 right-5 z-[200] flex flex-col gap-2 max-w-[360px]"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="bg-surface-card border border-hairline-strong rounded-chip px-4 py-3 flex items-center gap-3"
            style={{ boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)" }}
          >
            <p className="text-body-lg text-ink-strong flex-1">{t.message}</p>
            {t.actionLabel && (
              <button
                type="button"
                onClick={() => runAction(t.id)}
                className="text-cta text-altus-red hover:underline"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="size-7 inline-flex items-center justify-center rounded-full hover:bg-surface-soft text-ink-subtle hover:text-ink-strong transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
