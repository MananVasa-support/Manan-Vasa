import { requireUser } from "@/lib/auth/current";
import { getLetter } from "@/lib/hr/letters/registry";
import type { ContentKind } from "@/lib/hr/letters/rich";
import { normalizeGender, type Gender } from "@/lib/hr/pronouns";

export const dynamic = "force-dynamic";

interface LetterPdfBody {
  key?: string;
  entity?: string;
  values?: Record<string, string>;
  date?: string;
  /** Candidate gender — resolves pronoun/salutation tokens for structured PDFs. */
  gender?: Gender;
  /** When "rich", render `bodyHtml` via headless Chromium instead of pdfkit. */
  contentKind?: ContentKind;
  /** The free-form TipTap HTML for a rich letter (required when rich). */
  bodyHtml?: string;
  /** Optional uploaded scanned-signature image (data URL) for the sign-off. */
  signatureImage?: string;
}

/**
 * POST /api/hr/letters/pdf — render a filled HR letter to a downloadable PDF on
 * the selected paying-entity letterhead. Auth-gated; no DB writes (pure export).
 * The heavy pdfkit renderer is imported LAZILY so it stays server-runtime only.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: LetterPdfBody;
  try {
    body = (await req.json()) as LetterPdfBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  /* ---- Rich ("Edit freely") letters → headless-Chromium renderer ---- */
  if (body.contentKind === "rich" && body.bodyHtml) {
    try {
      const { renderRichLetterPdf } = await import("@/lib/hr/letters/render-rich");
      const pdf = await renderRichLetterPdf({
        entity: body.entity ?? "",
        bodyHtml: body.bodyHtml,
      });
      const filename = `${body.key || "letter"}.pdf`;
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch {
      return new Response("Failed to render PDF", { status: 500 });
    }
  }

  /* ---- Structured letters → existing pdfkit renderer (unchanged) ---- */
  const template = body.key ? getLetter(body.key) : undefined;
  if (!template) return new Response("Unknown letter", { status: 404 });

  try {
    const { renderLetterPdf } = await import("@/lib/hr/letters/pdf");
    const pdf = await renderLetterPdf({
      template,
      entity: body.entity ?? null,
      values: body.values ?? {},
      date: body.date,
      gender: normalizeGender(body.gender),
      signatureImage: body.signatureImage,
    });
    const filename = `${template.key}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("Failed to render PDF", { status: 500 });
  }
}
