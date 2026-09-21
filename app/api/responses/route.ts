import { NextResponse } from "next/server";
import {
  createThoughtResponse,
  getSubmission,
  getSubmissionByCode,
  listResponses,
} from "@/lib/db";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get("submission_id")?.trim();
  const code = searchParams.get("code")?.trim();

  let id = submissionId;
  if (!id && code) {
    const found = getSubmissionByCode(code);
    if (!found) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    id = found.id;
  }
  if (!id) {
    return NextResponse.json(
      { error: "submission_id or code required" },
      { status: 400 },
    );
  }
  if (!getSubmission(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(listResponses(id));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const submission_id = String(body.submission_id ?? "").trim();
    const response_text = String(body.response_text ?? "").trim();

    if (!submission_id || !getSubmission(submission_id)) {
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

    const response = createThoughtResponse(submission_id, response_text);
    return NextResponse.json(response, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
