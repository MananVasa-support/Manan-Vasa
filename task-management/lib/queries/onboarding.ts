import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { onboardingSubmissions, employees, designations } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { withRetry } from "@/lib/db/with-timeout";
import type { OnboardingFileRef } from "@/lib/dossier/onboarding-schema";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

export interface OnboardingFileView {
  fileName: string;
  mime: string | null;
  size: number | null;
  signedUrl: string | null;
}

export interface OnboardingView {
  employee: { id: string; name: string; avatarUrl: string | null; designation: string | null };
  exists: boolean;
  status: "draft" | "submitted" | null;
  submittedAt: string | null;
  fields: Record<string, string>;
  files: Record<string, OnboardingFileView>;
}

export async function getOnboarding(employeeId: string): Promise<OnboardingView | null> {
  const rows = await withRetry(
    () =>
      db
        .select({
          empId: employees.id,
          name: employees.name,
          avatarUrl: employees.avatarUrl,
          designation: designations.name,
          sub: onboardingSubmissions,
        })
        .from(employees)
        .leftJoin(designations, eq(employees.designationId, designations.id))
        .leftJoin(onboardingSubmissions, eq(onboardingSubmissions.employeeId, employees.id))
        .where(eq(employees.id, employeeId))
        .limit(1),
    { ...RETRY, label: "onboarding-get" },
  );
  const row = rows[0];
  if (!row) return null;

  const sub = row.sub;
  const rawFiles = (sub?.files as Record<string, OnboardingFileRef> | null) ?? {};
  const paths = Object.values(rawFiles).map((f) => f.path).filter(Boolean);

  const signed = new Map<string, string>();
  if (paths.length) {
    try {
      const { data } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, 3600);
      for (const r of data ?? []) if (r.path && r.signedUrl) signed.set(r.path, r.signedUrl);
    } catch {
      /* leave unsigned — the view shows "unavailable" */
    }
  }

  const files: Record<string, OnboardingFileView> = {};
  for (const [key, f] of Object.entries(rawFiles)) {
    files[key] = { fileName: f.fileName, mime: f.mime, size: f.size, signedUrl: signed.get(f.path) ?? null };
  }

  return {
    employee: {
      id: row.empId,
      name: row.name,
      avatarUrl: row.avatarUrl ?? null,
      designation: row.designation ?? null,
    },
    exists: !!sub,
    status: (sub?.status as "draft" | "submitted" | undefined) ?? null,
    submittedAt: sub?.submittedAt ? String(sub.submittedAt) : null,
    fields: (sub?.fields as Record<string, string> | null) ?? {},
    files,
  };
}
