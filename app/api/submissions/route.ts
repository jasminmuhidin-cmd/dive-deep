import { NextResponse } from "next/server";
import {
  countSubmissions,
  createSubmission,
  listSubmissions,
  searchSubmissions,
} from "@/lib/db";
import { publishSubmission } from "@/lib/events";
import { storeReceiptForSubmission } from "@/lib/receipt-store";
import { CATEGORIES, toDiveDeepThought, type Category } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const categoryParam = searchParams.get("category")?.trim() ?? "all";
  const format = searchParams.get("format");

  if (searchParams.get("count") === "1") {
    return NextResponse.json({ count: await countSubmissions() });
  }

  let list;
  if (!q && categoryParam === "all") {
    list = await listSubmissions();
  } else {
    const category =
      categoryParam === "all"
        ? "all"
        : CATEGORIES.includes(categoryParam as Category)
          ? (categoryParam as Category)
          : null;
    if (category === null) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    list = await searchSubmissions({ query: q || undefined, category });
  }

  if (format === "dive-deep") {
    return NextResponse.json(list.map(toDiveDeepThought));
  }

  return NextResponse.json(list);
}

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

    publishSubmission(submission);

    let receipt_url = `/api/receipts/${submission.id}`;
    let imessage: { ok: boolean; to?: string; error?: string } | undefined;
    try {
      const stored = await storeReceiptForSubmission(submission);
      receipt_url = stored.receipt_url.startsWith("http")
        ? stored.receipt_url
        : `/api/receipts/${submission.id}`;
      imessage = stored.imessage;
    } catch (err) {
      console.error("[submissions] receipt generation failed:", err);
    }

    return NextResponse.json(
      {
        ...submission,
        diveDeep: toDiveDeepThought(submission),
        receipt_url,
        imessage,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
