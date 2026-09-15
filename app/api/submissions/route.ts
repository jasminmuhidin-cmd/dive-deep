import { NextResponse } from "next/server";
import { createSubmission, listSubmissions, searchSubmissions } from "@/lib/db";
import { publishSubmission } from "@/lib/events";
import { CATEGORIES, type Category } from "@/lib/types";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const categoryParam = searchParams.get("category")?.trim() ?? "all";

  if (!q && categoryParam === "all") {
    return NextResponse.json(listSubmissions());
  }

  const category =
    categoryParam === "all"
      ? "all"
      : (CATEGORIES.includes(categoryParam as Category)
          ? (categoryParam as Category)
          : null);

  if (category === null) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }

  return NextResponse.json(
    searchSubmissions({
      query: q || undefined,
      category,
    }),
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const worry_text = String(body.worry_text ?? "").trim();
    const offering_text = String(body.offering_text ?? "").trim();
    const category = body.category as Category;

    if (!worry_text || worry_text.length > 280) {
      return NextResponse.json(
        { error: "worry_text must be 1–280 characters" },
        { status: 400 },
      );
    }
    if (!offering_text || offering_text.length > 280) {
      return NextResponse.json(
        { error: "offering_text must be 1–280 characters" },
        { status: 400 },
      );
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }

    const submission = createSubmission({
      worry_text,
      offering_text,
      category,
    });
    publishSubmission(submission);

    return NextResponse.json(submission, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
