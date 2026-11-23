/**
 * Data access: SQLite locally, Vercel Blob on production (shared across instances).
 */
import * as sqlite from "./db-sqlite";
import * as blob from "./db-blob";
import type {
  CreateSubmissionInput,
  Submission,
  ThoughtResponse,
} from "./types";

function onBlob() {
  return Boolean(process.env.VERCEL || process.env.USE_BLOB_DB === "1");
}

export async function listSubmissions(): Promise<Submission[]> {
  return onBlob() ? blob.listSubmissions() : sqlite.listSubmissions();
}

export async function countSubmissions(): Promise<number> {
  return onBlob() ? blob.countSubmissions() : sqlite.countSubmissions();
}

export async function getSubmission(id: string): Promise<Submission | null> {
  return onBlob() ? blob.getSubmission(id) : sqlite.getSubmission(id);
}

export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<Submission> {
  return onBlob()
    ? blob.createSubmission(input)
    : sqlite.createSubmission(input);
}

export async function setKeyWorry(
  id: string,
  keyWorry: string | null,
): Promise<void> {
  return onBlob()
    ? blob.setKeyWorry(id, keyWorry)
    : sqlite.setKeyWorry(id, keyWorry);
}

export async function incrementUncover(
  id: string,
): Promise<Submission | null> {
  return onBlob()
    ? blob.incrementUncover(id)
    : sqlite.incrementUncover(id);
}

export async function listResponses(
  submissionId: string,
): Promise<ThoughtResponse[]> {
  return onBlob()
    ? blob.listResponses(submissionId)
    : sqlite.listResponses(submissionId);
}

export async function createThoughtResponse(
  submissionId: string,
  responseText: string,
): Promise<ThoughtResponse> {
  return onBlob()
    ? blob.createThoughtResponse(submissionId, responseText)
    : sqlite.createThoughtResponse(submissionId, responseText);
}

export async function clearAll(): Promise<void> {
  return onBlob() ? blob.clearAll() : sqlite.clearAll();
}

