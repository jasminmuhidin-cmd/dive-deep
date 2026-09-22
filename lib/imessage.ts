import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

/** Default: AU mobile as provided for the installation. Override with IMESSAGE_TO. */
const DEFAULT_TO = "0422322522";

/**
 * Normalize AU / international numbers for Messages.
 * 0422322522 → +61422322522
 */
export function normalizeIMessagePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0") && digits.length === 10) {
    return `+61${digits.slice(1)}`;
  }
  if (digits.startsWith("61") && digits.length >= 11) {
    return `+${digits}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function getIMessageRecipient(): string | null {
  if (process.env.IMESSAGE_SEND === "0") return null;
  if (process.platform !== "darwin") return null;
  if (process.env.VERCEL) return null;
  const raw = process.env.IMESSAGE_TO?.trim() || DEFAULT_TO;
  return normalizeIMessagePhone(raw);
}

function phoneVariants(e164: string): string[] {
  const out = [e164];
  // Also try local AU form — Messages sometimes matches the chat that way
  if (e164.startsWith("+61") && e164.length === 12) {
    out.push(`0${e164.slice(3)}`);
  }
  return out;
}

/**
 * Send a file via the Mac Messages app (iMessage).
 * Sends a short text first (opens/creates the chat), then the PNG attachment.
 */
export async function sendFileViaIMessage(
  filePath: string,
  phone?: string,
  caption?: string,
): Promise<{ ok: boolean; to?: string; error?: string; detail?: string }> {
  const to = phone || getIMessageRecipient();
  if (!to) {
    return { ok: false, error: "iMessage send disabled or not on macOS" };
  }

  if (!fs.existsSync(filePath)) {
    return { ok: false, to, error: `file missing: ${filePath}` };
  }

  const text =
    caption ||
    "Your deep dive receipt — keep this, or scan the QR to return to the thought.";

  // Prefer argv so paths with spaces are safe
  const script = `
on run argv
  set targetPhone to item 1 of argv
  set imgPath to item 2 of argv
  set msgText to item 3 of argv
  set theAlias to (POSIX file imgPath) as alias

  tell application "Messages"
    -- Strategy A: account / participant (newer macOS)
    try
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant targetPhone of targetService
      send msgText to targetBuddy
      delay 0.8
      send theAlias to targetBuddy
      return "ok:account"
    end try

    -- Strategy B: service / buddy (older scripting dictionary)
    try
      set iMessageService to 1st service whose service type = iMessage
      set theBuddy to buddy targetPhone of iMessageService
      send msgText to theBuddy
      delay 0.8
      send theAlias to theBuddy
      return "ok:service"
    end try

    -- Strategy C: SMS / Apple dual-delivery if iMessage account lookup fails
    try
      set smsService to 1st service whose service type = SMS
      set theBuddy to buddy targetPhone of smsService
      send msgText to theBuddy
      delay 0.8
      send theAlias to theBuddy
      return "ok:sms"
    end try

    error "Messages could not find an iMessage/SMS chat for " & targetPhone
  end tell
end run
`;

  const variants = phoneVariants(to);
  const errors: string[] = [];

  for (const candidate of variants) {
    try {
      const { stdout, stderr } = await execFileAsync(
        "osascript",
        ["-e", script, candidate, filePath, text],
        {
          timeout: 45000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      const detail = `${stdout || ""}${stderr || ""}`.trim();
      console.info("[imessage] sent", filePath, "→", candidate, detail || "");
      return { ok: true, to: candidate, detail };
    } catch (err) {
      const message =
        err && typeof err === "object" && "stderr" in err
          ? String((err as { stderr?: Buffer | string }).stderr || "")
          : err instanceof Error
            ? err.message
            : String(err);
      const cleaned = message.trim() || String(err);
      errors.push(`${candidate}: ${cleaned}`);
      console.error("[imessage] attempt failed for", candidate, cleaned);
    }
  }

  return {
    ok: false,
    to,
    error: errors.join(" | ") || "All iMessage send strategies failed",
  };
}
