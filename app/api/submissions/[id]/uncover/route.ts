import { NextResponse } from "next/server";
import { getSubmission, incrementUncover } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!getSubmission(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = incrementUncover(id);
  return NextResponse.json(updated);
}
