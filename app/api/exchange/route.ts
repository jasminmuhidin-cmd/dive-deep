import { NextResponse } from "next/server";
import { getExchangeSubmission } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const excludeId = searchParams.get("exclude")?.trim() || null;
  const frictionId = searchParams.get("friction")?.trim() || null;

  const exchange = await getExchangeSubmission(excludeId, frictionId);
  if (!exchange) {
    return NextResponse.json(
      { error: "No other submissions available yet" },
      { status: 404 },
    );
  }

  return NextResponse.json(exchange);
}
