import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSubmission } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const submissionId = String(body.submission_id ?? body.id ?? "").trim();
    const exchangeId = String(body.exchange_id ?? "").trim() || null;
    const compositeDataUrl = String(body.composite_data_url ?? "").trim();

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

    const exchange = exchangeId ? getSubmission(exchangeId) : null;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";

    let printPath: string | null = null;
    if (compositeDataUrl.startsWith("data:image/")) {
      const printsDir = path.join(process.cwd(), "data", "prints");
      if (!fs.existsSync(printsDir)) {
        fs.mkdirSync(printsDir, { recursive: true });
      }
      const base64 = compositeDataUrl.replace(/^data:image\/\w+;base64,/, "");
      const filename = `exchange-${submissionId.slice(0, 8)}-${Date.now()}.png`;
      printPath = path.join(printsDir, filename);
      fs.writeFileSync(printPath, Buffer.from(base64, "base64"));
    }

    const receipt = {
      title: "deep dive · exchange print",
      submission_id: submission.id,
      exchange_id: exchange?.id ?? null,
      exchange_text: exchange?.worry_text ?? null,
      timestamp: new Date().toISOString(),
      steward_url: `${baseUrl}/steward/${submission.id}`,
      exchange_steward_url: exchange
        ? `${baseUrl}/steward/${exchange.id}`
        : null,
      print_file: printPath,
      printed: Boolean(printPath),
      note: printPath
        ? "Composite saved locally — connect thermal/photo printer bridge here."
        : "No composite image provided.",
      footer:
        "You gave your words to the sea. You leave with someone else's — decorated by your hand.",
    };

    console.log(
      "[print]",
      receipt.submission_id,
      "exchange:",
      receipt.exchange_id,
      "file:",
      receipt.print_file,
    );

    return NextResponse.json(receipt);
  } catch (err) {
    console.error("[print]", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
