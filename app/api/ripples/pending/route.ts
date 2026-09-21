import { NextResponse } from "next/server";
import { listPendingSince } from "@/lib/db";
import { toDiveDeepThought } from "@/lib/types";

export const runtime = "nodejs";

/** Poll endpoint for dive-deep-7 Electron bridge */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since")?.trim() || null;
  const pending = listPendingSince(since);
  return NextResponse.json({
    thoughts: pending.map(toDiveDeepThought),
    submissions: pending,
    serverTime: new Date().toISOString(),
  });
}
