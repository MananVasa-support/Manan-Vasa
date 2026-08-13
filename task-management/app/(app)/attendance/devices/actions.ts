"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { orgSettings } from "@/db/schema";
import { setDeviceStatus } from "@/lib/attendance/mobile-devices";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_OR_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

/** Approve a pending device so its owner can punch from it (admin only). */
export async function approveDevice(deviceRowId: string): Promise<Result> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(deviceRowId)) return { ok: false, error: "Invalid device." };
  const res = await setDeviceStatus(deviceRowId, "approved", me.id);
  if (res.ok) revalidatePath("/attendance/devices");
  return res;
}

/** Revoke a device (lost / replaced / suspicious) — it can no longer punch. */
export async function revokeDevice(deviceRowId: string): Promise<Result> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.test(deviceRowId)) return { ok: false, error: "Invalid device." };
  const res = await setDeviceStatus(deviceRowId, "revoked", me.id);
  if (res.ok) revalidatePath("/attendance/devices");
  return res;
}

/**
 * Set the office-network allowlist (public IPs / CIDRs) that WEB attendance must
 * come from — closes the browser "punch from home" bypass. Empty = gate OFF
 * (nobody locked out). Super-admin only: it governs attendance for everyone.
 */
export async function setOfficeIpAllowlist(ips: string[]): Promise<Result> {
  const me = await requireAdmin();
  if (!isSuperAdmin(me.email)) {
    return { ok: false, error: "Only a super-admin can set the office network." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const clean = Array.from(new Set((ips ?? []).map((s) => s.trim()).filter(Boolean))).slice(0, 20);
  const bad = clean.find((s) => !IPV4_OR_CIDR.test(s));
  if (bad) return { ok: false, error: `"${bad}" isn't a valid IPv4 address or CIDR.` };

  try {
    await db
      .update(orgSettings)
      .set({ officeIpAllowlist: clean.length ? clean : null, updatedAt: new Date(), updatedById: me.id })
      .where(eq(orgSettings.id, 1));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/attendance/devices");
  return { ok: true };
}
