"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { releaseRecognition, dismissRecognition } from "@/app/(app)/pms/signals/actions";
import { MODULE_THEME } from "@/lib/module-theme";

const ACCENT = MODULE_THEME.employees.accent;
const ACCENT_DEEP = MODULE_THEME.employees.accentDeep;

/**
 * Release / Dismiss buttons for one suggested recognition. Both are real wired
 * server-action calls; the row is human-released only (Law 8). Keyboard-first:
 * each is a focusable button, Enter/Space activates.
 */
export function RecognitionActions({ id, employeeName }: { id: string; employeeName: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [busy, setBusy] = React.useState<"release" | "dismiss" | null>(null);

  function run(kind: "release" | "dismiss") {
    setBusy(kind);
    start(async () => {
      const res =
        kind === "release"
          ? await releaseRecognition({ id })
          : await dismissRecognition({ id });
      setBusy(null);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message:
          kind === "release"
            ? `Recognition released for ${employeeName}.`
            : `Recognition dismissed.`,
        type: "success",
      });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run("release")}
        className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
      >
        {busy === "release" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
        Release
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run("dismiss")}
        className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-white px-3.5 py-2 text-[13.5px] font-bold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-60"
      >
        {busy === "dismiss" ? <Loader2 size={15} className="animate-spin" /> : <X size={15} strokeWidth={2.6} />}
        Dismiss
      </button>
    </div>
  );
}
