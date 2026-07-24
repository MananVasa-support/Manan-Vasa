import { NextResponse } from "next/server";
import { composeDocument } from "@/lib/hr-docs/actions-core";

/** Compose a draft letter. Auth-gated by the proxy (session cookie) + the core's
 *  own requireUser/isAdmin guard. Called via fetch by ComposeDialog so the CLIENT
 *  never imports the heavy hr-docs action graph (which hangs webpack compile). */
export async function POST(req: Request) {
  const input = await req.json().catch(() => ({}));
  const res = await composeDocument(input);
  return NextResponse.json(res);
}
