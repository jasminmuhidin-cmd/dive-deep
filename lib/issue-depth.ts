import { WORRY_WEIGHTS, type PerceivedDistance, type Submission, type WorryWeight } from "./types";

/**
 * Words that point past a personal moment to something structural — an issue
 * no one person can fix. Matched as word stems. Oppression, violence and
 * planet-scale harm weigh double: they're the most entangled issues of all.
 */
const STRUCTURAL = [
  "genocide", "war", "violence", "femicide", "femcide", "palestin", "refugee",
  "racis", "hate", "homophob", "transphob", "xenophob", "islamophob", "antisemit", "discriminat", "misogyn", "patriarch", "injustice", "colonial", "indigenous",
  "climate", "extinction", "warming", "poverty", "inequal", "capitalis", "corrupt", "democracy",
];
const SOCIAL = [
  "environment", "pollution", "ocean", "planet", "forest", "reef", "river", "hotter", "heat", "drought", "flood", "bushfire", "plastic", "water",
  "wealth", "economy", "economic", "cost of living", "inflation", "wage", "afford", "bills", "job",
  "housing", "house", "rent", "homeless",
  "government", "politic", "law", "policy",
  "gender", "women", "queer", "trans", "rights", "justice", "men in tech", "sexis", "safe", "language",
  "health", "mental", "disab", "lonel", "belong", "invisible", "dementia", "psycholog", "anxiety", "care system",
  "education", "universit", "student", "literacy", "critical thinking",
  "ai", "technology", "automation", "social media", "algorithm", "cancel culture", "online", "phone", "scrolling",
  "society", "system", "generation", "future", "global", "world", "corporat", "media", "communit", "neighbourhood",
];

/** An issue felt at a national or global scale reaches further than one close to home */
const DISTANCE_REACH: Record<PerceivedDistance, number> = { personal: 0, local: 0.35, national: 0.7, global: 1 };

/** Joining words — a worry that weighs one thing against another is rarely simple */
const CONNECTIVES = ["because", "but", "while", "although", "and", "so", "which", "when", "if", "without"];

const words = (text: string) => text.toLowerCase().match(/[a-z']+/g) ?? [];

/** Phrases match anywhere; short stems ("ai", "war") only as whole words, so "aim" and "warm" don't count */
function mentions(lower: string, stem: string) {
  if (stem.includes(" ")) return lower.includes(stem);
  return new RegExp(stem.length <= 3 ? `\\b${stem}\\b` : `\\b${stem}`).test(lower);
}

/** How structural the subject is: structural stems count double, capped at 1 */
function systemic(text: string): number {
  const lower = ` ${text.toLowerCase()} `;
  const points =
    STRUCTURAL.filter((stem) => mentions(lower, stem)).length * 2 +
    SOCIAL.filter((stem) => mentions(lower, stem)).length;
  return Math.min(1, points / 4);
}

/**
 * How complex an issue a thought names, 0 (everyday, personal) to 1
 * (systemic, tangled up with other issues). A transparent heuristic: how
 * structural the subject is, how many ideas it ties together, and how much
 * the person needed to say — plus their reasons and frictions, and how far
 * the issue reaches (personal → global), where known.
 */
function issueComplexity(s: Submission): number {
  const text = [s.worry_text, s.offering_text ?? "", s.why_text ?? ""].join(" ");
  const w = words(text);
  if (w.length === 0) return 0;

  // what it's about matters most — "genocide" is one word but no small thing
  const subject = systemic(text);
  const connected = Math.min(1, w.filter((x) => CONNECTIVES.includes(x)).length / 4);
  const length = Math.min(1, w.length / 40);
  const context = (s.why_text?.trim() ? 0.5 : 0) + Math.min(0.5, (s.frictions?.length ?? 0) * 0.25);
  const base = subject * 0.6 + connected * 0.15 + length * 0.15 + context * 0.1;

  // when we know how far the issue reaches, let that carry a share of the weight
  if (!s.perceived_distance) return base;
  return base * 0.7 + DISTANCE_REACH[s.perceived_distance] * 0.3;
}

/**
 * How closely a thought is held: on someone's mind lately, a worry many
 * share, or one that's stayed with them. The samples carry a hand-coded
 * weight; live thoughts are placed by how complex the issue is, with cut-offs
 * tuned so most of the samples would land where they were coded.
 */
export function worryWeight(s: Submission): WorryWeight {
  if (s.worry_weight) return s.worry_weight;
  // the zone the person placed it in at the kiosk, which the kiosk saves as its feeling tag
  if ((WORRY_WEIGHTS as readonly string[]).includes(s.feeling_tag)) return s.feeling_tag as WorryWeight;
  const c = issueComplexity(s);
  return c < 0.2 ? "recent" : c < 0.3 ? "common" : "deep";
}

/** Thoughts split into the dive's three sections, keeping the order they came in */
export function sortByWeight(subs: Submission[]): Record<WorryWeight, Submission[]> {
  const sections = Object.fromEntries(WORRY_WEIGHTS.map((w) => [w, [] as Submission[]])) as Record<
    WorryWeight,
    Submission[]
  >;
  for (const s of subs) sections[worryWeight(s)].push(s);
  return sections;
}
