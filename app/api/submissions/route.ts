import { NextResponse } from "next/server";
import { createSubmission, listSubmissions, searchSubmissions } from "@/lib/db";
import { publishSubmission } from "@/lib/events";
import {
  CATEGORIES,
  FISH_FORMS,
  PROMPT_TO_FISH,
  PROMPT_TYPES,
  type Category,
  type CreateSubmissionInput,
  type FishForm,
  type FrictionItem,
  type PromptType,
} from "@/lib/types";

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
      : CATEGORIES.includes(categoryParam as Category)
        ? (categoryParam as Category)
        : null;

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
    const worry_text = String(body.worry_text ?? body.thought_text ?? "").trim();
    const offering_text = String(body.offering_text ?? "").trim();
    const category = body.category as Category;
    const prompt_type = body.prompt_type as PromptType;
    const why_text =
      body.why_text === undefined || body.why_text === null
        ? null
        : String(body.why_text).trim();

    let fish_form = body.fish_form as FishForm | undefined;
    if (!fish_form && PROMPT_TYPES.includes(prompt_type)) {
      fish_form = PROMPT_TO_FISH[prompt_type];
    }

    let frictions: FrictionItem[] = [];
    if (Array.isArray(body.frictions)) {
      frictions = body.frictions
        .map((f: { id?: string; label?: string }) => ({
          id: String(f.id ?? "").trim(),
          label: String(f.label ?? "").trim(),
        }))
        .filter((f: FrictionItem) => f.id && f.label);
    }

    if (!worry_text || worry_text.length > 280) {
      return NextResponse.json(
        { error: "thought must be 1–280 characters" },
        { status: 400 },
      );
    }
    if (offering_text.length > 280) {
      return NextResponse.json(
        { error: "offering_text must be at most 280 characters" },
        { status: 400 },
      );
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    if (!PROMPT_TYPES.includes(prompt_type)) {
      return NextResponse.json(
        { error: "invalid prompt_type" },
        { status: 400 },
      );
    }
    if (!fish_form || !FISH_FORMS.includes(fish_form)) {
      return NextResponse.json({ error: "invalid fish_form" }, { status: 400 });
    }
    if (why_text && why_text.length > 400) {
      return NextResponse.json(
        { error: "why_text must be at most 400 characters" },
        { status: 400 },
      );
    }

    const payload: CreateSubmissionInput = {
      worry_text,
      offering_text,
      category,
      prompt_type,
      fish_form,
      why_text,
      frictions,
    };

    const submission = createSubmission(payload);
    publishSubmission(submission);

    return NextResponse.json(submission, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
