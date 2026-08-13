"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { setDeviceStatus } from "@/lib/attendance/mobile-devices";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
