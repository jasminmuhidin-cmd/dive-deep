// Downloads the MediaPipe pose models into public/mediapipe so the projection
// runs fully offline at the venue. Usage: npm run fetch-model
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://storage.googleapis.com/mediapipe-models/pose_landmarker";
const MODELS = ["full", "heavy", "lite"]; // full = default; heavy = most accurate; lite = fastest
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const m of MODELS) {
  const url = `${BASE}/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`;
  const out = join(root, "public", "mediapipe", `pose_landmarker_${m}.task`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${m}): ${res.status}`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log("Saved", out);
}
