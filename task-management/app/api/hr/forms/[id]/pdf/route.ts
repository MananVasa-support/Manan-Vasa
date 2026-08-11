import { loadAuthorisedSubmission, submissionFilename } from "@/lib/hr/forms/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/hr/forms/<id>/pdf — download a filled form as a PDF.
 *
 * Authorisation is NOT inherited from the page that linked here: this route is
 * directly addressable, so it re-runs the same `canViewHrSubmission` rule via
 * `loadAuthorisedSubmission`. Without that, a non-HR employee who guessed an id
 * could pull someone else's exit interview without ever loading a list.
 *
 * The pdfkit renderer is imported LAZILY, matching the letters routes, so the
 * heavy dependency stays out of any bundle that merely references this module.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const loaded = await loadAuthorisedSubmission(id);
  if (!loaded.ok) return new Response("Not found", { status: loaded.status });

  try {
    const { renderHrFormPdf } = await import("@/lib/hr/forms/pdf");
    const pdf = await renderHrFormPdf(loaded.data);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${submissionFilename(
          loaded.data.formName,
          loaded.data.employeeName,
        )}"`,
        // A filled form is personal data — never let a shared cache hold it.
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new Response("Failed to render PDF", { status: 500 });
  }
}
