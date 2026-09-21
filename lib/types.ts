export const CATEGORIES = [
  "environment",
  "community",
  "future",
  "belonging",
  "economy",
  "unspecified",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const ACTION_TYPES = [
  "conversation",
  "direct_action",
  "reflection",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

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
}

export interface StewardshipAction {
  id: string;
  submission_id: string;
  response_text: string;
  action_type: ActionType;
  created_at: string;
}

export interface CreateSubmissionInput {
  worry_text: string;
  offering_text?: string;
  category?: Category;
  theme?: string;
  feeling_tag?: string;
  connection_group?: string;
}

export interface CreateStewardshipInput {
  submission_id: string;
  response_text: string;
  action_type: ActionType;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  environment: "Environment",
  community: "Community",
  future: "Future",
  belonging: "Belonging",
  economy: "Economy",
  unspecified: "Open current",
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  conversation: "Conversation",
  direct_action: "Direct action",
  reflection: "Reflection",
};

/** Shape expected by dive-deep-7 thought pool */
export function toDiveDeepThought(s: Submission) {
  return {
    id: s.id,
    text: s.worry_text,
    theme: s.theme || s.category || "unspecified",
    feelingTag: s.feeling_tag || "quiet",
    connectionGroup: s.connection_group || s.theme || s.category || "shared",
    source: "kiosk",
    anonymousCode: s.anonymous_code,
  };
}
