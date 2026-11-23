export const CATEGORIES = [
  "environment",
  "community",
  "future",
  "belonging",
  "economy",
  "unspecified",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PROMPT_TYPES = ["care", "worry", "curiosity", "voice"] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

export const FISH_FORMS = ["turtle", "seahorse", "angelfish", "betta"] as const;
export type FishForm = (typeof FISH_FORMS)[number];

export interface FrictionItem {
  id: string;
  label: string;
}

export interface ThoughtResponse {
  id: string;
  submission_id: string;
  response_text: string;
  created_at: string;
}

export interface Submission {
  id: string;
  worry_text: string;
  offering_text: string;
  category: Category;
  created_at: string;
  is_claimed: number;
  anonymous_code: string;
  uncover_count: number;
  theme: string;
  feeling_tag: string;
  connection_group: string;
  prompt_type?: PromptType | null;
  fish_form?: FishForm | null;
  why_text?: string | null;
  frictions?: FrictionItem[];
  /** Short Claude-written title naming the concern; null until generated */
  key_worry?: string | null;
  /** How close to home the issue sits, as coded in the sample spreadsheet */
  perceived_distance?: PerceivedDistance | null;
  /** How closely it's held, hand-coded on the samples — sets which part of the dive it sinks to */
  worry_weight?: WorryWeight | null;
  /** A stand-in thought from the sample spreadsheet — not in the database, so it can't take replies */
  is_sample?: boolean;
}

export type PerceivedDistance = "personal" | "local" | "national" | "global";

/** On someone's mind lately · a worry many share · one that's stayed with them */
export const WORRY_WEIGHTS = ["recent", "common", "deep"] as const;
export type WorryWeight = (typeof WORRY_WEIGHTS)[number];

export interface CreateSubmissionInput {
  worry_text: string;
  offering_text?: string;
  category?: Category;
  theme?: string;
  feeling_tag?: string;
  connection_group?: string;
  prompt_type?: PromptType;
  fish_form?: FishForm;
  why_text?: string | null;
  frictions?: FrictionItem[];
}
