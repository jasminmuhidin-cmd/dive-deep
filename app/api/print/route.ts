import { NextResponse } from "next/server";
import { APP_URL } from "@/lib/config";
import { getSubmission } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const submissionId = String(body.submission_id ?? body.id ?? "").trim();

    if (!submissionId) {
      return NextResponse.json(
        { error: "submission_id is required" },
        { status: 400 },
      );
    }

    const submission = getSubmission(submissionId);
    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const receipt = {
      title: "Collective Efficacy & Shared Burdens",
      submission_id: submission.id,
      timestamp: submission.created_at,
      worry_text: submission.worry_text,
      offering_text: submission.offering_text,
      category: submission.category,
      steward_url: `${APP_URL}/steward/${submission.id}`,
      footer:
        "Keep, trade, or gift this artifact. Someone else may carry it forward.",
      printed: false,
      note: "Thermal printer stub — on-screen receipt used for testing.",
    };

    console.log("[print stub]", receipt.submission_id, receipt.steward_url);

    return NextResponse.json(receipt);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
