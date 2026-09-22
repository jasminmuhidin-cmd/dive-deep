#!/usr/bin/env npx tsx
/**
 * Manually send a receipt PNG via Messages.
 * Usage: npx tsx scripts/send-imessage.ts [path-to.png] [phone]
 */
import fs from "fs";
import path from "path";
import { sendFileViaIMessage } from "../lib/imessage";

async function main() {
  const fileArg = process.argv[2];
  const phoneArg = process.argv[3];
  const prints = path.join(process.cwd(), "data", "prints");
  let file = fileArg;
  if (!file) {
    const pngs = fs
      .readdirSync(prints)
      .filter((f) => f.startsWith("receipt-") && f.endsWith(".png"))
      .map((f) => ({
        f,
        m: fs.statSync(path.join(prints, f)).mtimeMs,
      }))
      .sort((a, b) => b.m - a.m);
    if (!pngs.length) {
      console.error("No receipt-*.png in data/prints — send a kiosk ripple first.");
      process.exit(1);
    }
    file = path.join(prints, pngs[0].f);
  }
  console.log("Sending", file, "→", phoneArg || "(IMESSAGE_TO default)");
  const result = await sendFileViaIMessage(file, phoneArg);
  console.log(result);
  process.exit(result.ok ? 0 : 1);
}

main();
