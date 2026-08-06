"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { onboardingSubmissions, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrStaff } from "@/lib/hr/access";
import { listOnboardingInviteTargets, getMyOnboardingStatus } from "@/lib/queries/onboarding";
import { sendOnboardingInviteEmail } from "@/lib/email/onboarding-email";
import { siteUrl } from "@/lib/site-url";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import {
  ONB_TEXT_FIELDS,
  ONB_FILE_KEYS,
  ONB_ALL_FIELDS,
  normaliseRepeaterValue,
  countCompleteRepeaterRows,
  type OnboardingFileRef,
} from "@/lib/dossier/onboarding-schema";
import type { Employee } from "@/db/schema";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024;
const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;
const DISALLOWED_MIME = new Set(["text/html", "application/xhtml+xml", "image/svg+xml", "application/x-msdownload", "application/x-sh", "application/x-shellscript"]);

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
function isAdmin(me: Employee) {
  return me.isAdmin || isSuperAdmin(me.email);
}

/**
 * Save (or submit) an employee's onboarding form. Self fills their own; admins
 * fill/view anyone's. Text answers land in `fields`; each attached file uploads
 * to the documents bucket and its ref is stored in `files`. Re-submitting keeps
 * previously-uploaded files that weren't replaced. One row per employee (upsert).
 */
export async function submitOnboarding(form: FormData): Promise<Result<{ status: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const employeeId = String(form.get("employeeId") ?? "");
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: "Missing employee." };
  if (!isAdmin(me) && employeeId !== me.id) return { ok: false, error: "Forbidden" };

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };

  const status = String(form.get("status") ?? "submitted") === "draft" ? "draft" : "submitted";

  // 1) text/select/repeater answers (repeaters stored as normalised JSON strings)
  const fields: Record<string, string> = {};
  for (const f of ONB_TEXT_FIELDS) {
    if (f.type === "repeater") {
      fields[f.key] = normaliseRepeaterValue(f, String(form.get(f.key) ?? ""));
      continue;
    }
    fields[f.key] = String(form.get(f.key) ?? "").trim().slice(0, 2000);
  }

  // 2) required-field guard (only when actually submitting)
  if (status === "submitted") {
    for (const f of ONB_ALL_FIELDS) {
      if (!f.required) continue;
      if (f.type === "file") continue; // files checked below
      if (f.type === "repeater") {
        // min-N complete rows — enforced server-side so the UI gate can't be bypassed
        const need = f.min ?? 1;
        const have = countCompleteRepeaterRows(f, fields[f.key]);
        if (have < need) {
          const cols = (f.sub ?? []).map((s) => s.label).join(", ");
          return { ok: false, error: `Add at least ${need} complete ${f.itemLabel ?? f.label} (each needs ${cols}).` };
        }
        continue;
      }
      if (!fields[f.key]) return { ok: false, error: `“${f.label}” is required.` };
    }
  }

  // 3) files — merge onto whatever already exists so a re-submit keeps prior uploads
  const existing = await db.query.onboardingSubmissions.findFirst({ where: eq(onboardingSubmissions.employeeId, employeeId) });
  const files: Record<string, OnboardingFileRef> = { ...((existing?.files as Record<string, OnboardingFileRef>) ?? {}) };
  const admin = getSupabaseAdmin();
  const uploadedPaths: string[] = [];

  for (const key of ONB_FILE_KEYS) {
    const file = form.get(key);
    // (a) an uploaded file wins
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return { ok: false, error: `“${key}” exceeds 25 MB.` };
      if (DISALLOWED_EXTENSIONS.test(file.name) || (file.type && DISALLOWED_MIME.has(file.type))) {
        return { ok: false, error: "That file type is not allowed." };
      }
      const path = `dossier/onboarding/${employeeId}/${key}-${crypto.randomUUID()}/${safeName(file.name)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) {
        if (uploadedPaths.length) await admin.storage.from(DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {});
        return { ok: false, error: `Upload failed (${key}): ${upErr.message}` };
      }
      uploadedPaths.push(path);
      files[key] = { path, fileName: file.name.slice(0, 200), mime: file.type || null, size: file.size };
      continue;
    }
    // (b) else a pasted Drive / URL link
    const link = String(form.get(`${key}__link`) ?? "").trim();
    if (link) {
      if (!/^https?:\/\//i.test(link)) return { ok: false, error: `“${key}” link must start with http(s)://` };
      files[key] = { link: link.slice(0, 1000), fileName: link.slice(0, 200) };
    }
  }

  // 4) required-attachment guard (submit only) — a file OR a link satisfies it
  if (status === "submitted") {
    for (const f of ONB_ALL_FIELDS) {
      if (f.type === "file" && f.required) {
        const ref = files[f.key];
        if (!ref || (!ref.path && !ref.link)) {
          if (uploadedPaths.length) await admin.storage.from(DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {});
          return { ok: false, error: `“${f.label}” is required (attach a file or paste a link).` };
        }
      }
    }
  }

  try {
    await db
      .insert(onboardingSubmissions)
      .values({
        employeeId,
        fields,
        files,
        status,
        submittedAt: status === "submitted" ? new Date() : existing?.submittedAt ?? null,
        createdById: existing?.createdById ?? me.id,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: onboardingSubmissions.employeeId,
        set: {
          fields,
          files,
          status,
          submittedAt: status === "submitted" ? new Date() : onboardingSubmissions.submittedAt,
          updatedById: me.id,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    if (uploadedPaths.length) await admin.storage.from(DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath("/dossier");
  return { ok: true, status };
}

/**
 * Email EVERY active employee whose onboarding is NOT yet submitted a warm
 * branded "Complete your Onboarding Form" invite (button → the hardcoded public
 * prod URL + the document checklist). HR-staff / admin gated. Per-recipient
 * try/catch so one bad address never aborts the run; employees with no email are
 * skipped upstream. Safe to re-run (idempotent nudge).
 */
export async function sendOnboardingInvites(): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  error?: string;
}> {
  const me = await requireUser();
  if (!(await isHrStaff(me)) && !isAdmin(me)) {
    return { ok: false, sent: 0, skipped: 0, error: "Forbidden" };
  }

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, sent: 0, skipped: 0, error: limited.error };

  let targets: Array<{ id: string; name: string; email: string }>;
  try {
    targets = await listOnboardingInviteTargets();
  } catch (err) {
    return { ok: false, sent: 0, skipped: 0, error: err instanceof Error ? err.message : "Could not load recipients." };
  }

  const base = siteUrl();
  let sent = 0;
  let skipped = 0;
  for (const t of targets) {
    try {
      const res = await sendOnboardingInviteEmail({ recipient: { email: t.email, name: t.name }, siteUrl: base });
      if (res.error) skipped += 1;
      else sent += 1;
    } catch {
      skipped += 1;
    }
  }

  return { ok: true, sent, skipped };
}

/**
 * Client-callable status for the app-wide onboarding nudge banner. Kept OFF the
 * SSR/dashboard load path — the banner calls this after mount (and only when the
 * session isn't dismissed), so it never adds a blocking query to page render.
 */
export async function getMyOnboardingStatusAction(): Promise<{ submitted: boolean }> {
  return getMyOnboardingStatus();
}
