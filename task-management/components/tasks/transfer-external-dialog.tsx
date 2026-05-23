"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, X } from "lucide-react";
import { transferTaskExternal } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";

interface Props {
  taskId: string;
  expectedUpdatedAt: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When false the visible trigger button is omitted; open-state is
   *  driven entirely by the controlled `open` prop. */
  renderTrigger?: boolean;
}

export function TransferExternalDialog({
  taskId,
  expectedUpdatedAt,
  open: openProp,
  onOpenChange,
  renderTrigger = true,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!note.trim()) {
      setError("A reason is required for external transfers.");
      return;
    }
    startTransition(async () => {
      const result = await transferTaskExternal(
        taskId,
        { note: note.trim() },
        expectedUpdatedAt,
      );
      if (!result.ok) {
        if (result.error === "stale") {
          setError("Task changed by someone else. Reload first.");
        } else if (result.error === "forbidden") {
          setError("You don't have permission to transfer this task.");
        } else {
          setError(result.message ?? "Action failed.");
        }
        return;
      }
      fireToast({ message: "Task transferred externally." });
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {renderTrigger && (
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[14px] font-medium border border-hairline bg-surface-card text-ink-strong hover:bg-surface-soft"
          >
            <ArrowUpRight size={15} strokeWidth={2.2} />
            Transfer externally
          </button>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-section border border-hairline bg-surface-card p-6 shadow-xl"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="text-display-md text-ink-strong">
                Transfer externally
              </Dialog.Title>
              <Dialog.Description className="text-[15px] text-ink-subtle mt-1.5" style={{ lineHeight: 1.5 }}>
                Use this when the work leaves the system (handed off to an external party).
                The task moves to &quot;Transferred&quot; permanently.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-full p-1 hover:bg-surface-soft text-ink-subtle hover:text-ink-strong"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="te-note" className="block text-[14px] font-semibold text-ink-strong mb-1.5">
                Reason <span className="text-rose">*</span>
              </label>
              <textarea
                id="te-note"
                rows={3}
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-md border border-hairline px-3.5 py-3 text-[15px] bg-white resize-y"
                placeholder="Where is this going and why?"
              />
            </div>

            {error && (
              <p className="text-[14px]" style={{ color: "var(--color-red-deep)" }}>{error}</p>
            )}

            <div className="flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="px-5 py-2.5 rounded-md text-[14px] font-medium border border-hairline bg-surface-soft text-ink-strong disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="px-5 py-2.5 rounded-md text-[14px] font-medium text-white disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-purple), var(--color-purple-deep))",
                }}
              >
                {pending ? "Transferring…" : "Transfer"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
