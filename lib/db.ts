import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import type {
  ActionType,
  Category,
  CreateStewardshipInput,
  CreateSubmissionInput,
  FishForm,
  FrictionItem,
  PromptType,
  StewardshipAction,
  Submission,
  ThoughtResponse,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "shared-burdens.db");

const SELECT_COLS = `id, worry_text, offering_text, category, created_at, is_claimed,
  prompt_type, fish_form, why_text, frictions`;

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

  ensureColumn(db, "submissions", "prompt_type", "TEXT");
  ensureColumn(db, "submissions", "fish_form", "TEXT");
  ensureColumn(db, "submissions", "why_text", "TEXT");
  ensureColumn(db, "submissions", "frictions", "TEXT DEFAULT '[]'");

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
  prompt_type: string | null;
  fish_form: string | null;
  why_text: string | null;
  frictions: string | null;
};

function mapSubmission(row: SubmissionRow): Submission {
  let frictions: FrictionItem[] = [];
  if (row.frictions) {
    try {
      const parsed = JSON.parse(row.frictions) as FrictionItem[];
      if (Array.isArray(parsed)) frictions = parsed;
    } catch {
      frictions = [];
    }
  }

  return {
    id: row.id,
    worry_text: row.worry_text,
    offering_text: row.offering_text,
    category: row.category,
    created_at: row.created_at,
    is_claimed: row.is_claimed,
    prompt_type: (row.prompt_type as PromptType) || null,
    fish_form: (row.fish_form as FishForm) || null,
    why_text: row.why_text,
    frictions,
  };
}

export function listSubmissions(): Submission[] {
  return (
    getDb().prepare(`SELECT ${SELECT_COLS} FROM submissions ORDER BY created_at ASC`).all() as SubmissionRow[]
  ).map(mapSubmission);
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
      OR LOWER(offering_text) LIKE ?
      OR LOWER(COALESCE(why_text, '')) LIKE ?
      OR LOWER(COALESCE(frictions, '')) LIKE ?
    )`;
    const like = `%${query}%`;
    params.push(like, like, like, like);
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

export function createSubmission(input: CreateSubmissionInput): Submission {
  const id = randomUUID();
  const created_at = new Date().toISOString();
  const offering_text = (input.offering_text ?? "").trim();
  const why_text = input.why_text?.trim() || null;
  const frictions = input.frictions ?? [];

  getDb()
    .prepare(
      `INSERT INTO submissions (
        id, worry_text, offering_text, category, created_at, is_claimed,
        prompt_type, fish_form, why_text, frictions
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.worry_text.trim(),
      offering_text,
      input.category,
      created_at,
      input.prompt_type,
      input.fish_form,
      why_text,
      JSON.stringify(frictions),
    );

  return {
    id,
    worry_text: input.worry_text.trim(),
    offering_text,
    category: input.category,
    created_at,
    is_claimed: 0,
    prompt_type: input.prompt_type,
    fish_form: input.fish_form,
    why_text,
    frictions,
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

export function getExchangeSubmission(
  excludeId?: string | null,
  frictionId?: string | null,
): Submission | null {
  const db = getDb();

  if (frictionId) {
    const matched = (
      db
        .prepare(
          `SELECT ${SELECT_COLS} FROM submissions
           WHERE (? IS NULL OR id != ?)
             AND frictions LIKE ?
           ORDER BY RANDOM()
           LIMIT 1`,
        )
        .all(
          excludeId ?? null,
          excludeId ?? null,
          `%"id":"${frictionId}"%`,
        ) as SubmissionRow[]
    ).map(mapSubmission);
    if (matched[0]) return matched[0];
  }

  const rows = (
    db
      .prepare(
        `SELECT ${SELECT_COLS} FROM submissions
         WHERE (? IS NULL OR id != ?)
         ORDER BY RANDOM()
         LIMIT 1`,
      )
      .all(excludeId ?? null, excludeId ?? null) as SubmissionRow[]
  ).map(mapSubmission);

  return rows[0] ?? null;
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
  const id = randomUUID();
  const created_at = data.created_at ?? new Date().toISOString();
  const offering_text = (data.offering_text ?? "").trim();
  const why_text = data.why_text?.trim() || null;
  const frictions = data.frictions ?? [];

  getDb()
    .prepare(
      `INSERT INTO submissions (
        id, worry_text, offering_text, category, created_at, is_claimed,
        prompt_type, fish_form, why_text, frictions
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    )
    .run(
      id,
      data.worry_text,
      offering_text,
      data.category,
      created_at,
      data.prompt_type,
      data.fish_form,
      why_text,
      JSON.stringify(frictions),
    );

  return {
    id,
    worry_text: data.worry_text,
    offering_text,
    category: data.category,
    created_at,
    is_claimed: 0,
    prompt_type: data.prompt_type,
    fish_form: data.fish_form,
    why_text,
    frictions,
  };
}

export function seedStewardship(data: {
  submission_id: string;
  response_text: string;
  action_type: ActionType;
}): StewardshipAction {
  return createStewardshipAction(data);
}
