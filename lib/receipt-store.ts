import { list, put } from "@vercel/blob";
import fs from "fs";
import path from "path";
import { APP_URL } from "./config";
import { sendFileViaIMessage } from "./imessage";
import {
  renderReceiptPng,
  submissionToReceiptInput,
  type ReceiptInput,
} from "./receipt-image";
import type { Submission } from "./types";

const BLOB_PREFIX = "receipts/";
const LOCAL_DIR = path.join(process.cwd(), "data", "prints");

function localPath(id: string) {
  return path.join(LOCAL_DIR, `receipt-${id}.png`);
}

function blobPath(id: string) {
  return `${BLOB_PREFIX}${id}.png`;
}

export function receiptDownloadPath(id: string) {
  return `${APP_URL}/api/receipts/${id}`;
}

export async function generateReceiptPng(
  input: ReceiptInput,
): Promise<Buffer> {
  return renderReceiptPng(input);
}

/** Build receipt PNG on kiosk submit; save locally and/or Vercel Blob. */
export async function storeReceiptForSubmission(
  submission: Submission,
): Promise<{
  id: string;
  receipt_url: string;
  localPath?: string;
  imessage?: { ok: boolean; to?: string; error?: string };
}> {
  const input = submissionToReceiptInput(submission);
  const png = await renderReceiptPng(input);
  const receipt_url = receiptDownloadPath(submission.id);

  if (process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN) {
    await put(blobPath(submission.id), png, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/png",
    });
  }

  if (!process.env.VERCEL) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    const file = localPath(submission.id);
    fs.writeFileSync(file, png);
    // Local Mac only: push receipt to Messages (iMessage) — await so errors appear in logs
    const sent = await sendFileViaIMessage(
      file,
      undefined,
      `deep dive receipt ${submission.anonymous_code || ""}`.trim(),
    );
    if (!sent.ok) {
      console.error("[receipt] iMessage did not send:", sent.error);
    }
    return {
      id: submission.id,
      receipt_url,
      localPath: file,
      imessage: sent,
    };
  }

  return { id: submission.id, receipt_url };
}

export async function getStoredReceiptPng(id: string): Promise<Buffer | null> {
  if (!process.env.VERCEL) {
    const file = localPath(id);
    if (fs.existsSync(file)) return fs.readFileSync(file);
  }

  try {
    const pathname = blobPath(id);
    const page = await list({ prefix: pathname, limit: 5 });
    const hit = page.blobs.find((b) => b.pathname === pathname);
    if (hit?.url) {
      const res = await fetch(hit.url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    }
  } catch {
    // fall through
  }

  return null;
}

export async function getOrCreateReceiptPng(
  submission: Submission,
): Promise<Buffer> {
  const existing = await getStoredReceiptPng(submission.id);
  if (existing) return existing;
  await storeReceiptForSubmission(submission);
  const again = await getStoredReceiptPng(submission.id);
  if (again) return again;
  return renderReceiptPng(submissionToReceiptInput(submission));
}
