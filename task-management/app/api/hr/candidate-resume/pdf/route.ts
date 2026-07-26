import { requireUser } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { renderCandidateResumePdf } from "@/lib/hr/candidate/resume-pdf";

export const dynamic = "force-dynamic";

interface ResumePdfBody {
  data?: Record<string, string>;
  instances?: Record<string, string[]>;
  photoPath?: string;
}

/**
 * POST /api/hr/candidate-resume/pdf — render a filled Candidate Interview Form
 * to a downloadable resume PDF. Auth-gated; the optional passport photo is
 * fetched from the Supabase `documents` bucket by path.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: ResumePdfBody;
  try {
    body = (await req.json()) as ResumePdfBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const data = body.data ?? {};
  const instances = body.instances ?? {};

  // Optional passport photo from Supabase storage — guarded so a missing/bad
  // image never blocks the PDF.
  let photo: Buffer | null = null;
  if (body.photoPath) {
    try {
      const { data: blob } = await getSupabaseAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .download(body.photoPath);
      photo = blob ? Buffer.from(await blob.arrayBuffer()) : null;
    } catch {
      photo = null;
    }
  }

  try {
    const pdf = await renderCandidateResumePdf({ data, instances, photo });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="candidate-resume.pdf"',
      },
    });
  } catch {
    return new Response("Failed to render PDF", { status: 500 });
  }
}
