import { NextResponse } from "next/server";
import {
  createStewardshipAction,
  getSubmission,
  listStewardshipBySubmission,
} from "@/lib/db";
import { ACTION_TYPES, type ActionType } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get("submission_id");

  if (!submissionId) {
    return NextResponse.json(
      { error: "submission_id is required" },
      { status: 400 },
    );
  }

  if (!(await getSubmission(submissionId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await listStewardshipBySubmission(submissionId));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const submission_id = String(body.submission_id ?? "").trim();
    const response_text = String(body.response_text ?? "").trim();
    const action_type = body.action_type as ActionType;

    if (!submission_id || !(await getSubmission(submission_id))) {
      return NextResponse.json(
        { error: "submission not found" },
        { status: 404 },
      );
    }
    if (!response_text || response_text.length > 500) {
      return NextResponse.json(
        { error: "response_text must be 1–500 characters" },
        { status: 400 },
      );
    }
    if (!ACTION_TYPES.includes(action_type)) {
      return NextResponse.json(
        { error: "invalid action_type" },
        { status: 400 },
      );
    }

    const action = await createStewardshipAction({
      submission_id,
      response_text,
      action_type,
    });

    return NextResponse.json(action, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
