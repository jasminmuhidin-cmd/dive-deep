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

export const PROMPT_TYPES = ["care", "worry", "curiosity", "voice"] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

export const FISH_FORMS = ["turtle", "seahorse", "angelfish", "betta"] as const;
export type FishForm = (typeof FISH_FORMS)[number];

export const PROMPT_TO_FISH: Record<PromptType, FishForm> = {
  care: "turtle",
  worry: "seahorse",
  curiosity: "angelfish",
  voice: "betta",
};

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
  /** Short title naming the concern, where one's been written; searchable in the archive */
  key_worry?: string | null;
  /** How close to home the issue sits, as coded in the sample spreadsheet */
  perceived_distance?: PerceivedDistance | null;
  /** How closely it's held, hand-coded on the samples — sets which zone of the dive it sinks to */
  worry_weight?: WorryWeight | null;
  /** A stand-in thought from the sample spreadsheet — not in the database, so it can't take replies */
  is_sample?: boolean;
}

export type PerceivedDistance = "personal" | "local" | "national" | "global";

/** On someone's mind lately · it keeps coming back · carried for so long (the kiosk's three zones) */
export const WORRY_WEIGHTS = ["recent", "common", "deep"] as const;
export type WorryWeight = (typeof WORRY_WEIGHTS)[number];

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
  prompt_type?: PromptType;
  fish_form?: FishForm;
  why_text?: string | null;
  frictions?: FrictionItem[];
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

export const PROMPT_LABELS: Record<PromptType, string> = {
  care: "Care",
  worry: "Worry",
  curiosity: "Curiosity",
  voice: "Voice",
};

export const FISH_FORM_LABELS: Record<FishForm, string> = {
  turtle: "Turtle",
  seahorse: "Seahorse",
  angelfish: "Angelfish",
  betta: "Betta",
};

export const PROMPT_CARDS: {
  type: PromptType;
  fish: FishForm;
  question: string;
  hint: string;
}[] = [
  {
    type: "care",
    fish: "turtle",
    question: "What's an issue that matters to you?",
    hint: "Something you keep coming back to.",
  },
  {
    type: "worry",
    fish: "seahorse",
    question: "What has been weighing on your mind lately?",
    hint: "A weight that won't leave you alone.",
  },
  {
    type: "curiosity",
    fish: "angelfish",
    question: "Something I wish I understood better is…",
    hint: "A question you want to sit with.",
  },
  {
    type: "voice",
    fish: "betta",
    question:
      "What is something you wish more people would hear or understand?",
    hint: "Words you wish had more room in the world.",
  },
];

export const FRICTION_OPTIONS: {
  id: string;
  label: string;
  personalize?: boolean;
}[] = [
  { id: "overwhelming", label: "It gets overwhelming" },
  { id: "too_big", label: "It feels too big" },
  { id: "dont_know_enough", label: "I don't know enough" },
  { id: "dont_know_what_to_do", label: "I don't know what I could do" },
  { id: "distant", label: "It feels distant from my life" },
  { id: "unsafe", label: "It can feel unsafe to talk about" },
  { id: "no_capacity", label: "I don't have the capacity right now" },
  {
    id: "something_else",
    label: "Something else",
    personalize: true,
  },
];

/** Insight shown on the printed fish / QR artefact from the chosen friction */
export const FRICTION_INSIGHTS: Record<string, string> = {
  overwhelming:
    "Someone else also feels this stacking up until it's hard to breathe around. You're not carrying that alone.",
  too_big:
    "Someone else also feels this is larger than one person can hold. The size of it doesn't mean your care is small.",
  dont_know_enough:
    "Someone else is sitting with the same not-knowing. Curiosity is already a way of staying with what matters.",
  dont_know_what_to_do:
    "Someone else wants to move and can't see the first step either. Naming that stuckness is a beginning.",
  distant:
    "Someone else feels far from this too — and still can't look away. Distance doesn't cancel care.",
  unsafe:
    "Someone else also finds this hard to say out loud. Your words make a little more room for theirs.",
  no_capacity:
    "Someone else is also at the edge of what they can hold right now. Resting doesn't mean you've stopped caring.",
  something_else:
    "Someone else left a personal note about what keeps this close. Your words now sit beside theirs.",
};

export function insightForFriction(friction: FrictionItem | null | undefined): string {
  if (!friction) {
    return "Someone else is holding something similar in the water with you.";
  }
  return (
    FRICTION_INSIGHTS[friction.id] ??
    FRICTION_INSIGHTS.something_else
  );
}

/** Shape expected by dive-deep-7 / kiosk bridge */
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
