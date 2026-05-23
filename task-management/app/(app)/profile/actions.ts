"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";

/**
 * M4 — self-serve per-channel opt-in flags.  Only the two channels the
 * employee can fully control today (email + Slack) are mutable here.
 * WhatsApp opt-in is admin-gated because it requires capturing the
 * employee's phone number, which we ask admins to do on their behalf
 * (DPDP / Meta-policy reasons).  Web Push opt-in lives on the
 * subscription itself (one row per device) — not on this scalar.
 */
const PatchSchema = z
  .object({
    emailOptIn: z.boolean().optional(),
    slackOptIn: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes." });

export type UpdateMyChannelsInput = z.infer<typeof PatchSchema>;

export async function updateMyChannels(
  input: UpdateMyChannelsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const parsed = PatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid",
    };
  }
  try {
    await db.update(employees).set(parsed.data).where(eq(employees.id, me.id));
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Self-serve profile edits — display name + avatar URL. Email is locked
 * (it's the identity key — admins manage it). Department + admin flag are
 * also locked. Avatar URL is just a string; no file upload — paste a public
 * image link from Gravatar, ImgBB, or any CDN. Empty string clears it.
 */
const ProfilePatchSchema = z
  .object({
    name: z.string().trim().min(1, "Name can't be empty").max(120),
    avatarUrl: z
      .string()
      .trim()
      .max(2000)
      .refine(
        (v) => v === "" || /^https?:\/\//i.test(v),
        "Avatar must be an http(s) URL or empty",
      ),
  })
  .strict();

export type UpdateMyProfileInput = z.infer<typeof ProfilePatchSchema>;

export async function updateMyProfile(
  input: UpdateMyProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const parsed = ProfilePatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid",
    };
  }
  try {
    await db
      .update(employees)
      .set({
        name: parsed.data.name,
        avatarUrl: parsed.data.avatarUrl === "" ? null : parsed.data.avatarUrl,
      })
      .where(eq(employees.id, me.id));
  } catch (err) {
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }
  revalidatePath("/profile");
  revalidatePath("/"); // header avatar reads from the same row
  return { ok: true };
}
