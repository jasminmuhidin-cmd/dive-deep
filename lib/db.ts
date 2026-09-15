import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  ActionType,
  Category,
  CreateStewardshipInput,
  CreateSubmissionInput,
  StewardshipAction,
  Submission,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "shared-burdens.db");

const globalForDb = globalThis as unknown as {
  __sharedBurdensDb?: Database.Database;
};

function getDb(): Database.Database {
  if (globalForDb.__sharedBurdensDb) {
    return globalForDb.__sharedBurdensDb;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      worry_text TEXT NOT NULL,
      offering_text TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_claimed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stewardship_actions (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      response_text TEXT NOT NULL,
      action_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );
  `);

  globalForDb.__sharedBurdensDb = db;
  return db;
}

export function listSubmissions(): Submission[] {
  return getDb()
    .prepare(
      `SELECT id, worry_text, offering_text, category, created_at, is_claimed
       FROM submissions
       ORDER BY created_at ASC`,
    )
    .all() as Submission[];
}

export function searchSubmissions(options: {
  query?: string;
  category?: Category | "all";
}): Submission[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const category =
    options.category && options.category !== "all" ? options.category : null;

  let sql = `SELECT id, worry_text, offering_text, category, created_at, is_claimed
             FROM submissions
             WHERE 1 = 1`;
  const params: string[] = [];

  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  if (query) {
    sql += ` AND (LOWER(worry_text) LIKE ? OR LOWER(offering_text) LIKE ?)`;
    const like = `%${query}%`;
    params.push(like, like);
  }

  sql += ` ORDER BY created_at DESC`;

  return getDb().prepare(sql).all(...params) as Submission[];
}

export function getSubmission(id: string): Submission | null {
  const row = getDb()
    .prepare(
      `SELECT id, worry_text, offering_text, category, created_at, is_claimed
       FROM submissions
       WHERE id = ?`,
    )
    .get(id) as Submission | undefined;
  return row ?? null;
}

export function createSubmission(input: CreateSubmissionInput): Submission {
  const id = randomUUID();
  const created_at = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO submissions (id, worry_text, offering_text, category, created_at, is_claimed)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .run(
      id,
      input.worry_text.trim(),
      input.offering_text.trim(),
      input.category,
      created_at,
    );

  return {
    id,
    worry_text: input.worry_text.trim(),
    offering_text: input.offering_text.trim(),
    category: input.category,
    created_at,
    is_claimed: 0,
  };
}

export function listStewardshipBySubmission(
  submissionId: string,
): StewardshipAction[] {
  return getDb()
    .prepare(
      `SELECT id, submission_id, response_text, action_type, created_at
       FROM stewardship_actions
       WHERE submission_id = ?
       ORDER BY created_at ASC`,
    )
    .all(submissionId) as StewardshipAction[];
}

export function createStewardshipAction(
  input: CreateStewardshipInput,
): StewardshipAction {
  const id = randomUUID();
  const created_at = new Date().toISOString();
  const db = getDb();

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO stewardship_actions (id, submission_id, response_text, action_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.submission_id,
      input.response_text.trim(),
      input.action_type,
      created_at,
    );

    db.prepare(`UPDATE submissions SET is_claimed = 1 WHERE id = ?`).run(
      input.submission_id,
    );
  });

  insert();

  return {
    id,
    submission_id: input.submission_id,
    response_text: input.response_text.trim(),
    action_type: input.action_type,
    created_at,
  };
}

export function clearAll(): void {
  const db = getDb();
  db.exec(`DELETE FROM stewardship_actions; DELETE FROM submissions;`);
}

export function seedSubmission(data: {
  worry_text: string;
  offering_text: string;
  category: Category;
  created_at?: string;
}): Submission {
  const id = randomUUID();
  const created_at = data.created_at ?? new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO submissions (id, worry_text, offering_text, category, created_at, is_claimed)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .run(
      id,
      data.worry_text,
      data.offering_text,
      data.category,
      created_at,
    );

  return {
    id,
    worry_text: data.worry_text,
    offering_text: data.offering_text,
    category: data.category,
    created_at,
    is_claimed: 0,
  };
}

export function seedStewardship(data: {
  submission_id: string;
  response_text: string;
  action_type: ActionType;
}): StewardshipAction {
  return createStewardshipAction(data);
}
