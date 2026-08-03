"use client";

/**
 * Task Attachments card. Renders a task's files as clickable cards (open the
 * short-TTL signed URL in a new tab), with hover-to-delete and, when editable,
 * a dashed add tile backed by a hidden file input. Uploads go through the
 * attachment Server Actions and refresh the server-rendered list.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileImage, File as FileIcon, Loader2, Plus, Trash2 } from "lucide-react";
import type { AttachmentView } from "@/lib/queries/task-detail-extras";
import { uploadTaskAttachment, deleteTaskAttachment } from "@/app/(app)/tasks/attachment-actions";
import { fireToast } from "@/lib/toast";

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  const rounded = u === 0 ? n : Math.round(n * 10) / 10;
  return `${rounded} ${units[u]}`;
}

function FileTypeIcon({ mime }: { mime: string | null }) {
  if (mime?.startsWith("image/")) {
    return <FileImage className="h-5 w-5 text-violet-600" aria-hidden />;
  }
  if (mime === "application/pdf") {
    return <FileText className="h-5 w-5 text-altus-red" aria-hidden />;
  }
  return <FileIcon className="h-5 w-5 text-ink-subtle" aria-hidden />;
}

export function TaskAttachments({
  taskId,
  items,
  canEdit,
}: {
  taskId: string;
  items: AttachmentView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("file", file);
    setUploading(true);
    startTransition(async () => {
      const res = await uploadTaskAttachment(fd);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteTaskAttachment(id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      router.refresh();
    });
  }

  const isEmpty = items.length === 0;

  return (
    <section className="rounded-2xl border border-hairline bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
          <FileIcon className="h-4 w-4 text-ink-subtle" aria-hidden />
          Attachments
        </h3>
        {items.length > 0 && (
          <span className="text-xs font-medium tabular-nums text-ink-muted">{items.length}</span>
        )}
      </div>

      {isEmpty && !canEdit ? (
        <p className="mt-4 rounded-xl border border-dashed border-hairline bg-surface-soft/50 px-3 py-6 text-center text-sm text-ink-subtle">
          No attachments.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {items.map((att) => (
            <div
              key={att.id}
              className="group relative flex items-center gap-3 rounded-xl border border-hairline bg-surface-soft/40 p-3 transition-colors hover:bg-surface-soft"
            >
              <a
                href={att.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!att.url}
                className="flex min-w-0 flex-1 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 rounded-lg"
                onClick={(e) => {
                  if (!att.url) e.preventDefault();
                }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-hairline bg-white">
                  <FileTypeIcon mime={att.mime} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-strong" title={att.fileName}>
                    {att.fileName}
                  </span>
                  <span className="block text-xs tabular-nums text-ink-subtle">
                    {formatBytes(att.sizeBytes)}
                    {att.uploadedByName ? ` · ${att.uploadedByName}` : ""}
                  </span>
                </span>
              </a>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(att.id)}
                  disabled={isPending}
                  className="shrink-0 rounded-md p-1 text-ink-subtle opacity-0 transition-opacity hover:bg-altus-red/10 hover:text-altus-red focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40 group-hover:opacity-100 disabled:opacity-60"
                  aria-label={`Delete ${att.fileName}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ))}

          {canEdit && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || isPending}
              className="flex min-h-[68px] items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-white px-3 py-3 text-sm font-medium text-ink-muted transition-colors hover:border-altus-red/40 hover:bg-surface-soft/60 hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Add attachment"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Uploading…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add file
                </>
              )}
            </button>
          )}
        </div>
      )}

      {canEdit && (
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      )}
    </section>
  );
}
