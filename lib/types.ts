export const CATEGORIES = [
  "environment",
  "community",
  "future",
  "belonging",
  "economy",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const ACTION_TYPES = [
  "conversation",
  "direct_action",
  "reflection",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export interface Submission {
  id: string;
  worry_text: string;
  offering_text: string;
  category: Category;
  created_at: string;
  is_claimed: number;
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
  offering_text: string;
  category: Category;
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
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  conversation: "Conversation",
  direct_action: "Direct action",
  reflection: "Reflection",
};
