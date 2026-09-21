import { NextResponse } from "next/server";
import QRCode from "qrcode";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get("data")?.trim();
  const size = Math.min(400, Math.max(64, Number(searchParams.get("size") || 160)));

  if (!data) {
    return NextResponse.json({ error: "data required" }, { status: 400 });
  }

  const dataUrl = await QRCode.toDataURL(data, {
    width: size,
    margin: 1,
    color: { dark: "#071820", light: "#ffffff" },
  });

  return NextResponse.json({ dataUrl });
}
