import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import path from "path";
import type { Submission } from "./types";

const BRANDING = path.join(process.cwd(), "public", "branding");
const TOP_PATH = path.join(BRANDING, "receipt-top.png");
const BOTTOM_PATH = path.join(BRANDING, "receipt-bottom.png");
const FONT_PATH = path.join(process.cwd(), "public", "fonts", "FrescoStamp.ttf");
const FONT = "Fresco Stamp";

/** Each block of words fits in this many lines, shrinking the type until it does */
const MAX_LINES = 4;
/** Type size (px, at the artwork's full 3889px width) when the words fit easily, and the smallest it may shrink to */
const MAX_SIZE = 440;
const MIN_SIZE = 90;
const LINE_HEIGHT = 1.02;
/** The words run exactly as wide as the ASCII art's ink (49px in on the left, 61px on the right), and sit 49px down from the top */
const SIDE = 49;
const SIDE_RIGHT = 61;
/** Space between the words and the ASCII art, and before the footer */
const ART_GAP = 140;
const FOOT_GAP = 240;

let assets: Promise<{ top: Image; bottom: Image }> | null = null;

/** The artwork and font, loaded once and kept for every receipt after */
function loadAssets() {
  assets ??= (async () => {
    if (!GlobalFonts.has(FONT)) GlobalFonts.registerFromPath(FONT_PATH, FONT);
    const [top, bottom] = await Promise.all([loadImage(TOP_PATH), loadImage(BOTTOM_PATH)]);
    return { top, bottom };
  })();
  return assets;
}

/**
 * Words broken into lines no wider than `maxW` at the current font. Each
 * `forced` entry starts a line of its own; a word too wide for any line is
 * returned as null, so the caller knows to shrink.
 */
function wrap(ctx: SKRSContext2D, paragraphs: string[], maxW: number): string[][] | null {
  const lines: string[][] = [];
  for (const paragraph of paragraphs) {
    let line: string[] = [];
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(word).width > maxW) return null;
      const test = [...line, word].join(" ");
      if (line.length && ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = [word];
      } else {
        line.push(word);
      }
    }
    if (line.length) lines.push(line);
  }
  return lines;
}

/** The largest size, up to MAX_SIZE, at which every block fits in MAX_LINES */
function fitSize(ctx: SKRSContext2D, blocks: string[][], maxW: number): number {
  for (let size = MAX_SIZE; size > MIN_SIZE; size -= 4) {
    ctx.font = `${size}px "${FONT}"`;
    if (blocks.every((b) => (wrap(ctx, b, maxW)?.length ?? Infinity) <= MAX_LINES)) return size;
  }
  return MIN_SIZE;
}

/** How far the tallest letters rise above the line, and the longest tails fall below it */
function inkExtent(ctx: SKRSContext2D) {
  const m = ctx.measureText("I#bdfhklgjpqy");
  return { rise: m.actualBoundingBoxAscent, fall: m.actualBoundingBoxDescent };
}

/** Height of a block of lines from the top of its tallest letter to the bottom of its lowest tail */
function blockHeight(ctx: SKRSContext2D, lines: string[][], size: number) {
  const { rise, fall } = inkExtent(ctx);
  return rise + (lines.length - 1) * size * LINE_HEIGHT + fall;
}

/**
 * Every line justified edge to edge, last line included, `y` at the top of
 * the ink: the first letter's ink starts exactly at `x`, the last word's ink
 * ends exactly at `x + width`, and the gaps between words widen to fill it.
 * A line of a single word can't spread, so it sits at the left edge.
 */
function drawBlock(ctx: SKRSContext2D, lines: string[][], x: number, y: number, width: number, size: number) {
  const { rise } = inkExtent(ctx);
  lines.forEach((words, i) => {
    const baseline = y + rise + i * size * LINE_HEIGHT;
    const ink = words.map((w) => {
      const m = ctx.measureText(w);
      return { word: w, before: m.actualBoundingBoxLeft, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight };
    });
    const gap =
      words.length > 1 ? (width - ink.reduce((sum, w) => sum + w.width, 0)) / (words.length - 1) : 0;
    let left = x;
    for (const w of ink) {
      ctx.fillText(w.word, left + w.before, baseline);
      left += w.width + gap;
    }
  });
}

export type ReceiptInput = {
  id: string;
  /** Their answer to "I care about…" */
  care: string;
  /** Their answer to "I care because…", if they gave one */
  because?: string | null;
};

/** An answer without the prompt's own words, in case they typed those too */
const answer = (text: string, prompt: RegExp) => text.trim().replace(prompt, "").trim();

/**
 * The receipt sticker: "I #divedeep about …" with their first answer, the
 * ASCII art, "because …" with their second (if they gave one), then the
 * Dive Deep footer. Everything runs edge to edge — no white border round it.
 */
export async function renderReceiptPng(input: ReceiptInput, { scale = 1 }: { scale?: number } = {}): Promise<Buffer> {
  const { top, bottom } = await loadAssets();
  const width = top.width;
  const textW = width - SIDE - SIDE_RIGHT;

  const care = answer(input.care, /^i\s+care\s+about\b[\s.…]*/i);
  const because = answer(input.because ?? "", /^(i\s+care\s+)?because\b[\s.…]*/i);
  // "I #divedeep about" takes the first line to itself; their words follow
  const blocks = [["I #divedeep about", care], ...(because ? [[`because ${because}`]] : [])];

  const measure = createCanvas(1, 1).getContext("2d");
  const size = fitSize(measure, blocks, textW);
  measure.font = `${size}px "${FONT}"`;
  const wrapped = blocks.map((b) => wrap(measure, b, textW) ?? b.map((p) => [p]));
  const blockH = (lines: string[][]) => blockHeight(measure, lines, size);

  const height =
    SIDE +
    blockH(wrapped[0]) +
    ART_GAP +
    top.height +
    (wrapped[1] ? ART_GAP + blockH(wrapped[1]) : 0) +
    FOOT_GAP +
    bottom.height;
  // laid out at full size, drawn at `scale` (smaller for an on-screen preview)
  const canvas = createCanvas(Math.round(width * scale), Math.ceil(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  // the footer art is transparent; the sticker itself is white
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#000000";
  ctx.font = `${size}px "${FONT}"`;
  ctx.textBaseline = "alphabetic";

  let y = SIDE;
  drawBlock(ctx, wrapped[0], SIDE, y, textW, size);
  y += blockH(wrapped[0]) + ART_GAP;
  ctx.drawImage(top, 0, y);
  y += top.height;
  if (wrapped[1]) {
    y += ART_GAP;
    drawBlock(ctx, wrapped[1], SIDE, y, textW, size);
    y += blockH(wrapped[1]);
  }
  y += FOOT_GAP;
  ctx.drawImage(bottom, 0, y);

  return canvas.toBuffer("image/png");
}

export function submissionToReceiptInput(s: Submission): ReceiptInput {
  return { id: s.id, care: s.worry_text, because: s.offering_text };
}
