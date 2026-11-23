import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import type {
  Category,
  CreateSubmissionInput,
  Submission,
  ThoughtResponse,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "shared-burdens.db");

const SELECT_COLS = `id, worry_text, offering_text, category, created_at, is_claimed,
  anonymous_code, uncover_count, theme, feeling_tag, connection_group, key_worry`;

const globalForDb = globalThis as unknown as {
  __sharedBurdensDb?: Database.Database;
};

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function makeAnonymousCode(): string {
  return `QW-${randomBytes(2).toString("hex").toUpperCase()}`;
}

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
      offering_text TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'unspecified',
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

    CREATE TABLE IF NOT EXISTS thought_responses (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      response_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );
  `);

  ensureColumn(db, "submissions", "anonymous_code", "TEXT");
  ensureColumn(db, "submissions", "uncover_count", "INTEGER DEFAULT 0");
  ensureColumn(db, "submissions", "theme", "TEXT DEFAULT 'unspecified'");
  ensureColumn(db, "submissions", "feeling_tag", "TEXT DEFAULT 'quiet'");
  ensureColumn(db, "submissions", "connection_group", "TEXT DEFAULT 'shared'");
  ensureColumn(db, "submissions", "key_worry", "TEXT");

  // Backfill anonymous codes for older rows
  const missing = db
    .prepare(
      `SELECT id FROM submissions WHERE anonymous_code IS NULL OR anonymous_code = ''`,
    )
    .all() as { id: string }[];
  const setCode = db.prepare(
    `UPDATE submissions SET anonymous_code = ? WHERE id = ?`,
  );
  for (const row of missing) {
    setCode.run(makeAnonymousCode(), row.id);
  }

  globalForDb.__sharedBurdensDb = db;
  return db;
}

type SubmissionRow = {
  id: string;
  worry_text: string;
  offering_text: string;
  category: Category;
  created_at: string;
  is_claimed: number;
  anonymous_code: string | null;
  uncover_count: number | null;
  theme: string | null;
  feeling_tag: string | null;
  connection_group: string | null;
  key_worry: string | null;
};

function mapSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    worry_text: row.worry_text,
    offering_text: row.offering_text ?? "",
    category: row.category,
    created_at: row.created_at,
    is_claimed: row.is_claimed,
    anonymous_code: row.anonymous_code || makeAnonymousCode(),
    uncover_count: row.uncover_count ?? 0,
    theme: row.theme || row.category || "unspecified",
    feeling_tag: row.feeling_tag || "quiet",
    connection_group: row.connection_group || "shared",
    key_worry: row.key_worry,
  };
}

export function listSubmissions(): Submission[] {
  return (
    getDb()
      .prepare(`SELECT ${SELECT_COLS} FROM submissions ORDER BY created_at ASC`)
      .all() as SubmissionRow[]
  ).map(mapSubmission);
}

export function countSubmissions(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as n FROM submissions`)
    .get() as { n: number };
  return row.n;
}

export function getSubmission(id: string): Submission | null {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM submissions WHERE id = ?`)
    .get(id) as SubmissionRow | undefined;
  return row ? mapSubmission(row) : null;
}

export function createSubmission(input: CreateSubmissionInput): Submission {
  const id = randomUUID();
  const created_at = new Date().toISOString();
  const anonymous_code = makeAnonymousCode();
  const offering_text = (input.offering_text ?? "").trim();
  const category = (input.category ?? "unspecified") as Category;
  const theme = input.theme?.trim() || category;
  const feeling_tag = input.feeling_tag?.trim() || "quiet";
  const connection_group = input.connection_group?.trim() || theme;

  getDb()
    .prepare(
      `INSERT INTO submissions (
        id, worry_text, offering_text, category, created_at, is_claimed,
        anonymous_code, uncover_count, theme, feeling_tag, connection_group
      ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)`,
    )
    .run(
      id,
      input.worry_text.trim(),
      offering_text,
      category,
      created_at,
      anonymous_code,
      theme,
      feeling_tag,
      connection_group,
    );

  return {
    id,
    worry_text: input.worry_text.trim(),
    offering_text,
    category,
    created_at,
    is_claimed: 0,
    anonymous_code,
    uncover_count: 0,
    theme,
    feeling_tag,
    connection_group,
  };
}

export function setKeyWorry(id: string, keyWorry: string | null): void {
  getDb()
    .prepare(`UPDATE submissions SET key_worry = ? WHERE id = ?`)
    .run(keyWorry, id);
}

export function incrementUncover(id: string): Submission | null {
  getDb()
    .prepare(
      `UPDATE submissions SET uncover_count = COALESCE(uncover_count, 0) + 1 WHERE id = ?`,
    )
    .run(id);
  return getSubmission(id);
}

export function listResponses(submissionId: string): ThoughtResponse[] {
  return getDb()
    .prepare(
      `SELECT id, submission_id, response_text, created_at
       FROM thought_responses
       WHERE submission_id = ?
       ORDER BY created_at ASC`,
    )
    .all(submissionId) as ThoughtResponse[];
}

export function createThoughtResponse(
  submissionId: string,
  responseText: string,
): ThoughtResponse {
  const id = randomUUID();
  const created_at = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO thought_responses (id, submission_id, response_text, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, submissionId, responseText.trim(), created_at);
  return {
    id,
    submission_id: submissionId,
    response_text: responseText.trim(),
    created_at,
  };
}

export function clearAll(): void {
  const db = getDb();
  db.exec(
    `DELETE FROM thought_responses; DELETE FROM stewardship_actions; DELETE FROM submissions;`,
  );
}

