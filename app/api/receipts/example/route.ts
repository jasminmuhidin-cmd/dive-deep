import { NextResponse } from "next/server";
import { renderReceiptPng } from "@/lib/receipt-image";

export const runtime = "nodejs";

/** A receipt with fixed sample words, for testing the printer without a real thought */
export async function GET() {
  const png = await renderReceiptPng({
    id: "example",
    care: "using too much ai",
    because: "we are forgetting how to use our big beautiful brains",
  });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
