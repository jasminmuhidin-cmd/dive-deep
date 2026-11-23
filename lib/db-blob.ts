import { del, get, list, put } from "@vercel/blob";
import { randomBytes, randomUUID } from "crypto";
import type {
  Category,
  CreateSubmissionInput,
  Submission,
  ThoughtResponse,
} from "./types";

const SUB_PREFIX = "deep-dive/submissions/";
const RESP_PREFIX = "deep-dive/responses/";
const STEW_PREFIX = "deep-dive/stewardship/";

function makeAnonymousCode(): string {
  return `QW-${randomBytes(2).toString("hex").toUpperCase()}`;
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: "private" });
    if (!result?.stream) return null;
    const text = await new Response(result.stream).text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function listJson<T>(prefix: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      const row = await readJson<T>(blob.pathname);
      if (row) out.push(row);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function putJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listSubmissions(): Promise<Submission[]> {
  const rows = await listJson<Submission>(SUB_PREFIX);
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function countSubmissions(): Promise<number> {
  const page = await list({ prefix: SUB_PREFIX, limit: 1000 });
  return page.blobs.length;
}

export async function getSubmission(id: string): Promise<Submission | null> {
  return readJson<Submission>(`${SUB_PREFIX}${id}.json`);
}

export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<Submission> {
  const category = (input.category ?? "unspecified") as Category;
  const theme = input.theme?.trim() || category;
  const submission: Submission = {
    id: randomUUID(),
    worry_text: input.worry_text.trim(),
    offering_text: (input.offering_text ?? "").trim(),
    category,
    created_at: new Date().toISOString(),
    is_claimed: 0,
    anonymous_code: makeAnonymousCode(),
    uncover_count: 0,
    theme,
    feeling_tag: input.feeling_tag?.trim() || "quiet",
    connection_group: input.connection_group?.trim() || theme,
  };
  await putJson(`${SUB_PREFIX}${submission.id}.json`, submission);
  return submission;
}

export async function setKeyWorry(
  id: string,
  keyWorry: string | null,
): Promise<void> {
  const s = await getSubmission(id);
  if (!s) return;
  await putJson(`${SUB_PREFIX}${id}.json`, { ...s, key_worry: keyWorry });
}

export async function incrementUncover(
  id: string,
): Promise<Submission | null> {
  const s = await getSubmission(id);
  if (!s) return null;
  s.uncover_count = (s.uncover_count ?? 0) + 1;
  await putJson(`${SUB_PREFIX}${id}.json`, s);
  return s;
}

export async function listResponses(
  submissionId: string,
): Promise<ThoughtResponse[]> {
  const all = await listJson<ThoughtResponse>(RESP_PREFIX);
  return all
    .filter((r) => r.submission_id === submissionId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function createThoughtResponse(
  submissionId: string,
  responseText: string,
): Promise<ThoughtResponse> {
  const row: ThoughtResponse = {
    id: randomUUID(),
    submission_id: submissionId,
    response_text: responseText.trim(),
    created_at: new Date().toISOString(),
  };
  await putJson(`${RESP_PREFIX}${row.id}.json`, row);
  return row;
}

export async function clearAll(): Promise<void> {
  for (const prefix of [SUB_PREFIX, RESP_PREFIX, STEW_PREFIX]) {
    const page = await list({ prefix, limit: 1000 });
    if (page.blobs.length) {
      await del(page.blobs.map((b) => b.url));
    }
  }
}

