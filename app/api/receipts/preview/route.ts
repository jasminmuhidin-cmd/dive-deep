import { NextResponse } from "next/server";
import { renderReceiptPng } from "@/lib/receipt-image";

export const runtime = "nodejs";

const MAX_WORDS = 50;
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * A visitor's receipt drawn from their words before anything is saved, so the
 * kiosk can show it for them to check. Drawn at a fifth of print size, which
 * is plenty for a screen and quick to send.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const care = String(body.care ?? "").trim();
  const because = String(body.because ?? "").trim();
  if (!care || words(care) > MAX_WORDS || words(because) > MAX_WORDS) {
    return NextResponse.json({ error: "answers must be 1–50 words" }, { status: 400 });
  }
  const png = await renderReceiptPng({ id: "preview", care, because }, { scale: 0.2 });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
