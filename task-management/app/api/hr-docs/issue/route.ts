import { NextResponse } from "next/server";
import { issueDocument } from "@/lib/hr-docs/actions-core";

export async function POST(req: Request) {
  const input = await req.json().catch(() => ({}));
  const res = await issueDocument(input);
  return NextResponse.json(res);
}
