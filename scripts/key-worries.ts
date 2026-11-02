import { listSubmissions, setKeyWorry } from "../lib/db";
import { generateKeyWorry } from "../lib/key-worry";

/** Titles any submissions that don't have a key worry yet. Pass --all to redo every one. */
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set (add it to .env.local)");
  }
  const redo = process.argv.includes("--all");
  const pending = (await listSubmissions()).filter((s) => redo || !s.key_worry);

  for (const sub of pending) {
    const keyWorry = await generateKeyWorry(sub.worry_text);
    await setKeyWorry(sub.id, keyWorry);
    console.log(`${keyWorry ?? "(none)"}  ←  ${sub.worry_text}`);
  }
  console.log(`Titled ${pending.length} submission${pending.length === 1 ? "" : "s"}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
