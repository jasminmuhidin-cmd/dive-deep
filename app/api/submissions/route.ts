import { after, NextResponse } from "next/server";
import { createSubmission, listSubmissions, setKeyWorry } from "@/lib/db";
import { generateKeyWorry } from "@/lib/key-worry";
import { CATEGORIES, type Category } from "@/lib/types";

export const runtime = "nodejs";

/** Every thought in the water, for the dive */
export async function GET() {
  return NextResponse.json(await listSubmissions());
}

/** A new thought from the kiosk */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const worry_text = String(
      body.worry_text ?? body.text ?? body.thought_text ?? "",
    ).trim();
    const offering_text = String(body.offering_text ?? "").trim();
    const categoryRaw = String(body.category ?? body.theme ?? "unspecified");
    const category = (
      CATEGORIES.includes(categoryRaw as Category)
        ? categoryRaw
        : "unspecified"
    ) as Category;

    const wordCount = worry_text
      ? worry_text.split(/\s+/).filter(Boolean).length
      : 0;
    if (!worry_text || wordCount > 50) {
      return NextResponse.json(
        { error: "thought must be 1–50 words" },
        { status: 400 },
      );
    }

    const submission = await createSubmission({
      worry_text,
      offering_text,
      category,
      theme: String(body.theme ?? category),
      feeling_tag: String(body.feeling_tag ?? body.feelingTag ?? "quiet"),
      connection_group: String(
        body.connection_group ?? body.connectionGroup ?? category,
      ),
    });

    // Title the concern (searchable in the dive) without holding up the kiosk.
    after(async () => {
      const keyWorry = await generateKeyWorry(submission.worry_text);
      if (keyWorry) await setKeyWorry(submission.id, keyWorry);
    });

    return NextResponse.json(submission, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
