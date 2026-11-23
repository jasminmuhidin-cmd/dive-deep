import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const FILE = path.join(process.cwd(), "components/installation-3d/savedLayout.json");

/**
 * Dev-only: the leva panel's "Save as default" writes its values here, so every page
 * that shows the installation model (/installation, /about) starts from them.
 * Commit savedLayout.json to ship the tweaks.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "saving the layout only works in dev" }, { status: 403 });
  }
  const values = await request.json();
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return NextResponse.json({ error: "expected an object of leva values" }, { status: 400 });
  }
  await writeFile(FILE, JSON.stringify(values, null, 2) + "\n");
  return NextResponse.json({ ok: true, count: Object.keys(values).length });
}
