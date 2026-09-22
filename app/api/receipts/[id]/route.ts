import { NextResponse } from "next/server";
import { getSubmission, getSubmissionByCode } from "@/lib/db";
import { getOrCreateReceiptPng } from "@/lib/receipt-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const submission =
    (await getSubmission(id)) ||
    (id.toUpperCase().startsWith("QW-") ? await getSubmissionByCode(id) : null);

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const png = await getOrCreateReceiptPng(submission);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="receipt-${submission.anonymous_code || submission.id.slice(0, 8)}.png"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[receipt]", err);
    return NextResponse.json(
      { error: "Could not generate receipt" },
      { status: 500 },
    );
  }
}
