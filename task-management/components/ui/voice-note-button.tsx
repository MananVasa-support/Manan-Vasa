"use client";

import * as React from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { blobToWavBase64 } from "@/lib/audio/to-wav";
import { fireToast } from "@/lib/toast";

/**
 * Reusable voice-note recorder → AI transcript. Records from the mic, converts
 * to 16kHz mono WAV, posts to /api/ai/transcribe (Gemini), and hands the
 * transcript back via `onText`. English stays English; Hindi → Hinglish.
 *
 * Three states: idle (Mic), recording (timer + Stop), transcribing (spinner).
 * Degrades gracefully if the mic is blocked or Gemini isn't configured.
 */
export function VoiceNoteButton({
  onText,
  prefer = "transcript",
  className,
  label = "Voice note",
}: {
  onText: (text: string) => void;
  /** Insert the verbatim transcript (default) or the short summary. */
  prefer?: "transcript" | "summary";
  className?: string;
  label?: string;
}) {
  const [recording, setRecording] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recRef.current?.stream?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function transcribe(blob: Blob) {
    setBusy(true);
    try {
      const { base64, mimeType } = await blobToWavBase64(blob);
      const res = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      });
      const json = await res.json();
      if (!json.ok) {
        fireToast({ message: json.error || "Couldn't transcribe the recording.", type: "error" });
        return;
      }
      const text =
        prefer === "summary"
          ? (json.summary?.trim() || json.transcript?.trim() || "")
          : (json.transcript?.trim() || json.summary?.trim() || "");
      if (!text) {
        fireToast({ message: "Nothing clear could be transcribed — try again.", type: "error" });
        return;
      }
      onText(text);
      fireToast({ message: "Voice note transcribed.", type: "success" });
    } catch (err) {
      fireToast({ message: err instanceof Error ? err.message : "Couldn't process the audio.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribe(blob);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      fireToast({ message: "Couldn't access the microphone. Check browser permissions.", type: "error" });
    }
  }
  function stop() {
    recRef.current?.stop();
    setRecording(false);
  }

  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-bold transition-colors disabled:opacity-60 " +
    (className ?? "");

  if (busy) {
    return (
      <span className={base} style={{ borderColor: "color-mix(in srgb, var(--color-purple, #7c3aed) 40%, transparent)", color: "var(--color-purple-deep, #6d28d9)", background: "color-mix(in srgb, var(--color-purple, #7c3aed) 8%, transparent)" }}>
        <Loader2 size={14} className="animate-spin" /> Transcribing…
      </span>
    );
  }
  if (recording) {
    return (
      <button type="button" onClick={stop} className={base + " text-white"} style={{ background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" }}>
        <span className="size-2 rounded-full bg-white animate-pulse" />
        <span className="tabular-nums">{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}</span>
        <Square size={13} strokeWidth={2.6} /> Stop
      </button>
    );
  }
  return (
    <button type="button" onClick={start} className={base + " border-hairline-strong bg-white text-ink-soft hover:border-[color:var(--color-altus-red)] hover:text-altus-red"}>
      <Mic size={14} strokeWidth={2.4} /> {label}
    </button>
  );
}
