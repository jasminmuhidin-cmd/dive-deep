/**
 * Data access: SQLite locally, Vercel Blob on production (shared across instances).
 */
import * as sqlite from "./db-sqlite";
import * as blob from "./db-blob";
import type {
  ActionType,
  Category,
  CreateStewardshipInput,
  CreateSubmissionInput,
  StewardshipAction,
  Submission,
  ThoughtResponse,
} from "./types";

function useBlob() {
  return Boolean(process.env.VERCEL || process.env.USE_BLOB_DB === "1");
}

export async function listSubmissions(): Promise<Submission[]> {
  return useBlob() ? blob.listSubmissions() : sqlite.listSubmissions();
}

export async function countSubmissions(): Promise<number> {
  return useBlob() ? blob.countSubmissions() : sqlite.countSubmissions();
}

export async function searchSubmissions(options: {
  query?: string;
  category?: Category | "all";
}): Promise<Submission[]> {
  return useBlob()
    ? blob.searchSubmissions(options)
    : sqlite.searchSubmissions(options);
}

export async function getSubmission(id: string): Promise<Submission | null> {
  return useBlob() ? blob.getSubmission(id) : sqlite.getSubmission(id);
}

export async function getSubmissionByCode(
  code: string,
): Promise<Submission | null> {
  return useBlob()
    ? blob.getSubmissionByCode(code)
    : sqlite.getSubmissionByCode(code);
}

export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<Submission> {
  return useBlob()
    ? blob.createSubmission(input)
    : sqlite.createSubmission(input);
}

export async function incrementUncover(
  id: string,
): Promise<Submission | null> {
  return useBlob()
    ? blob.incrementUncover(id)
    : sqlite.incrementUncover(id);
}

export async function listResponses(
  submissionId: string,
): Promise<ThoughtResponse[]> {
  return useBlob()
    ? blob.listResponses(submissionId)
    : sqlite.listResponses(submissionId);
}

export async function createThoughtResponse(
  submissionId: string,
  responseText: string,
): Promise<ThoughtResponse> {
  return useBlob()
    ? blob.createThoughtResponse(submissionId, responseText)
    : sqlite.createThoughtResponse(submissionId, responseText);
}

export async function listPendingSince(
  sinceIso: string | null,
): Promise<Submission[]> {
  return useBlob()
    ? blob.listPendingSince(sinceIso)
    : sqlite.listPendingSince(sinceIso);
}

export async function listStewardshipBySubmission(
  submissionId: string,
): Promise<StewardshipAction[]> {
  return useBlob()
    ? blob.listStewardshipBySubmission(submissionId)
    : sqlite.listStewardshipBySubmission(submissionId);
}

export async function createStewardshipAction(
  input: CreateStewardshipInput,
): Promise<StewardshipAction> {
  return useBlob()
    ? blob.createStewardshipAction(input)
    : sqlite.createStewardshipAction(input);
}

export async function clearAll(): Promise<void> {
  return useBlob() ? blob.clearAll() : sqlite.clearAll();
}

export async function seedSubmission(
  data: CreateSubmissionInput & { created_at?: string },
): Promise<Submission> {
  return useBlob() ? blob.seedSubmission(data) : sqlite.seedSubmission(data);
}

export async function seedStewardship(data: {
  submission_id: string;
  response_text: string;
  action_type: ActionType;
}): Promise<StewardshipAction> {
  return useBlob()
    ? blob.seedStewardship(data)
    : sqlite.seedStewardship(data);
}

/** Random other submission for exchange / print pairing (ignores friction filter for now). */
export async function getExchangeSubmission(
  excludeId: string | null = null,
  _frictionId: string | null = null,
): Promise<Submission | null> {
  const all = await listSubmissions();
  const pool = excludeId ? all.filter((s) => s.id !== excludeId) : all;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
