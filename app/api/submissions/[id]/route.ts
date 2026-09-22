import { NextResponse } from "next/server";
import { getSubmission, getSubmissionByCode, listResponses } from "@/lib/db";
import { toDiveDeepThought } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);

  let submission =
    (await getSubmission(id)) ||
    (id.toUpperCase().startsWith("QW-")
      ? await getSubmissionByCode(id)
      : null);

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (searchParams.get("include") === "responses") {
    return NextResponse.json({
      ...submission,
      responses: await listResponses(submission.id),
      diveDeep: toDiveDeepThought(submission),
    });
  }

  return NextResponse.json(submission);
}
