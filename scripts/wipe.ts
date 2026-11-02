import { clearAll, countSubmissions } from "../lib/db";

/** Deletes every submission, response and stewardship action. Run with --yes. */
async function main() {
  const count = await countSubmissions();
  if (!process.argv.includes("--yes")) {
    console.log(`This deletes all ${count} submissions and their responses. Re-run with --yes to confirm.`);
    return;
  }
  await clearAll();
  console.log(`Wiped ${count} submissions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
