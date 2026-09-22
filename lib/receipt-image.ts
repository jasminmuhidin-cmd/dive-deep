import { createCanvas, loadImage, type CanvasRenderingContext2D } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { APP_URL } from "./config";
import type { Submission } from "./types";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "branding",
  "receipt.png",
);

function wrapAtSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  fontSize: number,
) {
  ctx.font = `italic ${fontSize}px Georgia, serif`;
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxW) {
      out.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);

  const fixed: string[] = [];
  for (const ln of out) {
    if (ctx.measureText(ln).width <= maxW) {
      fixed.push(ln);
      continue;
    }
    let chunk = "";
    for (const ch of ln) {
      const t = chunk + ch;
      if (chunk && ctx.measureText(t).width > maxW) {
        fixed.push(chunk);
        chunk = ch;
      } else chunk = t;
    }
    if (chunk) fixed.push(chunk);
  }
  return fixed;
}

export type ReceiptInput = {
  id: string;
  text: string;
  anonymousCode?: string | null;
};

/** Composite receipt.png + thought + QR (matches Electron layout). */
export async function renderReceiptPng(input: ReceiptInput): Promise<Buffer> {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Receipt template missing: ${TEMPLATE_PATH}`);
  }

  const tpl = await loadImage(TEMPLATE_PATH);
  const canvas = createCanvas(tpl.width, tpl.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(tpl, 0, 0);

  const left = 40;
  const top = 40;
  const rightPad = 80;
  const maxW = canvas.width - left - rightPad;
  const maxBottom = canvas.height * 0.58;
  const maxH = maxBottom - top;
  const padX = 10;
  const padY = 4;
  const thoughtText = String(input.text || "");
  ctx.textBaseline = "top";

  let fontSize = 80;
  const minSize = 28;
  let lines = wrapAtSize(ctx, thoughtText, maxW, fontSize);
  let lineH = fontSize * 1.25;
  while (fontSize > minSize && lines.length * lineH > maxH) {
    fontSize -= 2;
    lines = wrapAtSize(ctx, thoughtText, maxW, fontSize);
    lineH = fontSize * 1.25;
  }

  let y = top;
  for (const line of lines) {
    if (y + fontSize > maxBottom) break;
    ctx.font = `italic ${fontSize}px Georgia, serif`;
    const tw = Math.min(maxW, ctx.measureText(line).width);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left - padX, y - padY, tw + padX * 2, fontSize + padY * 2);
    ctx.fillStyle = "#111111";
    ctx.fillText(line, left, y);
    y += lineH;
  }

  const code = input.anonymousCode || "";
  if (code) {
    ctx.font = "500 22px monospace";
    const codeY = canvas.height - 120;
    const tw = ctx.measureText(code).width;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left - 8, codeY - 4, tw + 16, 22 + 8);
    ctx.fillStyle = "#222222";
    ctx.fillText(code, left, codeY);
  }

  const archiveUrl = `${APP_URL}/gallery?id=${encodeURIComponent(input.id)}`;
  const qrDataUrl = await QRCode.toDataURL(archiveUrl, {
    width: 140,
    margin: 1,
  });
  const qr = await loadImage(qrDataUrl);
  const qrSize = 120;
  const qrX = 40;
  const qrY = canvas.height - qrSize - 40;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);

  return canvas.toBuffer("image/png");
}

export function submissionToReceiptInput(s: Submission): ReceiptInput {
  return {
    id: s.id,
    text: s.worry_text,
    anonymousCode: s.anonymous_code,
  };
}
