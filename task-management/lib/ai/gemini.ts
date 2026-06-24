/**
 * Gemini multimodal helper — transcribe + summarize a voice note in ONE call.
 *
 * English stays English. Hindi is rendered as **Hinglish** (romanized Hindi in
 * the Latin alphabet, e.g. "mujhe yeh service achhi lagi") — NOT translated to
 * English and NOT in Devanagari. Mixed/code-switched speech is kept as spoken.
 *
 * Uses Google AI Studio (generativelanguage API) with a forced JSON response
 * schema so the output never needs brittle string-parsing. Requires the env var
 * GEMINI_API_KEY (free key from https://aistudio.google.com/apikey). The model
 * is overridable via GEMINI_MODEL (default: gemini-2.5-flash).
 */

export interface AudioSummary {
  language: "english" | "hindi" | "mixed";
  transcript: string;
  summary: string;
}

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("Auto-summary isn't set up yet. Ask an admin to add a GEMINI_API_KEY.");
    this.name = "GeminiNotConfiguredError";
  }
}

const PROMPT = `You are a precise multilingual transcription + summarization assistant for a corporate feedback desk.
The audio is a spoken voice note in English, Hindi, or a mix of both.

Do EXACTLY this:
1. Transcribe the speech faithfully.
   - If the speaker uses HINDI, write it as HINGLISH: romanized Hindi using the English (Latin) alphabet, the way Indians text each other (e.g. "consultant ne meri problem achhe se solve ki"). DO NOT translate Hindi into English. DO NOT use the Devanagari script.
   - If the speaker uses ENGLISH, keep it in English.
   - Keep code-switching (Hindi+English mixed) exactly as spoken.
   - Clean up filler sounds but never invent content. If a part is inaudible, write [inaudible].
2. Write a concise summary (2-4 sentences) capturing the key feedback / points / action items, in the same Hinglish-or-English style as the transcript.

Return ONLY the JSON object — no extra commentary.`;

/**
 * Transcribe + summarize a base64-encoded audio clip.
 * @param base64  base64 (no data: prefix) of the audio bytes
 * @param mimeType  a Gemini-supported audio mime (audio/wav, audio/mp3, audio/ogg, audio/aac, audio/flac)
 */
export async function transcribeAndSummarize(base64: string, mimeType: string): Promise<AudioSummary> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiNotConfiguredError();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPT }, { inlineData: { mimeType, data: base64 } }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          language: { type: "string", enum: ["english", "hindi", "mixed"] },
          transcript: { type: "string" },
          summary: { type: "string" },
        },
        required: ["language", "transcript", "summary"],
      },
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") throw new Error("The summary timed out — try a shorter clip.");
    throw new Error("Couldn't reach the summary service.");
  }
  clearTimeout(timer);

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 400 && /API key not valid/i.test(detail)) throw new Error("The GEMINI_API_KEY is invalid.");
    if (res.status === 429) throw new Error("Summary rate limit hit — try again in a moment.");
    throw new Error(`Summary service error (${res.status}).`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (json.promptFeedback?.blockReason) throw new Error("The audio couldn't be processed (content filter).");
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("The summary came back empty — try re-recording.");

  let parsed: AudioSummary;
  try {
    parsed = JSON.parse(text) as AudioSummary;
  } catch {
    throw new Error("Couldn't read the summary result.");
  }
  return {
    language: parsed.language ?? "english",
    transcript: (parsed.transcript ?? "").trim(),
    summary: (parsed.summary ?? "").trim(),
  };
}
