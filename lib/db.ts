import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import type {
  ActionType,
  Category,
  CreateStewardshipInput,
  CreateSubmissionInput,
  StewardshipAction,
  Submission,
  ThoughtResponse,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "shared-burdens.db");

const SELECT_COLS = `id, worry_text, offering_text, category, created_at, is_claimed,
  anonymous_code, uncover_count, theme, feeling_tag, connection_group`;

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

export function searchSubmissions(options: {
  query?: string;
  category?: Category | "all";
}): Submission[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const category =
    options.category && options.category !== "all" ? options.category : null;

  let sql = `SELECT ${SELECT_COLS} FROM submissions WHERE 1 = 1`;
  const params: string[] = [];

  if (category) {
    sql += ` AND (category = ? OR theme = ?)`;
    params.push(category, category);
  }

  if (query) {
    sql += ` AND (
      LOWER(worry_text) LIKE ?
      OR LOWER(COALESCE(theme, '')) LIKE ?
      OR LOWER(COALESCE(anonymous_code, '')) LIKE ?
    )`;
    const like = `%${query}%`;
    params.push(like, like, like);
  }

  sql += ` ORDER BY created_at DESC`;
  return (getDb().prepare(sql).all(...params) as SubmissionRow[]).map(
    mapSubmission,
  );
}

export function getSubmission(id: string): Submission | null {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLS} FROM submissions WHERE id = ?`)
    .get(id) as SubmissionRow | undefined;
  return row ? mapSubmission(row) : null;
}

export function getSubmissionByCode(code: string): Submission | null {
  const row = getDb()
    .prepare(
      `SELECT ${SELECT_COLS} FROM submissions WHERE UPPER(anonymous_code) = UPPER(?)`,
    )
    .get(code.trim()) as SubmissionRow | undefined;
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

export function listPendingSince(sinceIso: string | null): Submission[] {
  if (!sinceIso) {
    return listSubmissions();
  }
  return (
    getDb()
      .prepare(
        `SELECT ${SELECT_COLS} FROM submissions
         WHERE created_at > ?
         ORDER BY created_at ASC`,
      )
      .all(sinceIso) as SubmissionRow[]
  ).map(mapSubmission);
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
  db.exec(
    `DELETE FROM thought_responses; DELETE FROM stewardship_actions; DELETE FROM submissions;`,
  );
}

export function seedSubmission(
  data: CreateSubmissionInput & { created_at?: string },
): Submission {
  const created = createSubmission(data);
  if (data.created_at) {
    getDb()
      .prepare(`UPDATE submissions SET created_at = ? WHERE id = ?`)
      .run(data.created_at, created.id);
    return { ...created, created_at: data.created_at };
  }
  return created;
}

export function seedStewardship(data: {
  submission_id: string;
  response_text: string;
  action_type: ActionType;
}): StewardshipAction {
  return createStewardshipAction(data);
}
