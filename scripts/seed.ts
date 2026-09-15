import path from "path";
import { clearAll, seedStewardship, seedSubmission } from "../lib/db";
import type { CreateSubmissionInput } from "../lib/types";

const samples: CreateSubmissionInput[] = [
  {
    worry_text:
      "I keep scrolling past climate headlines until they feel like white noise.",
    category: "environment",
    prompt_type: "worry",
    fish_form: "seahorse",
    why_text: "Because the silence after the headlines feels heavier than the news.",
    frictions: [
      { id: "overwhelming", label: "It gets overwhelming" },
      { id: "dont_know_what_to_do", label: "I don't know what I could do" },
    ],
  },
  {
    worry_text: "My neighbourhood feels quieter and more fragmented than before.",
    category: "community",
    prompt_type: "care",
    fish_form: "turtle",
    why_text: null,
    frictions: [{ id: "distant", label: "It feels distant from my life" }],
  },
  {
    worry_text: "I wish I understood how young people still find hope about the future.",
    category: "future",
    prompt_type: "curiosity",
    fish_form: "angelfish",
    frictions: [
      { id: "dont_know_enough", label: "I don't know enough" },
      { id: "too_big", label: "It feels too big" },
    ],
  },
  {
    worry_text: "I wish more people understood how lonely belonging can feel in a crowded room.",
    category: "belonging",
    prompt_type: "voice",
    fish_form: "betta",
    frictions: [
      { id: "unsafe", label: "It can feel unsafe to talk about" },
    ],
  },
  {
    worry_text: "Rent and bills leave little room to care about anything else.",
    category: "economy",
    prompt_type: "worry",
    fish_form: "seahorse",
    frictions: [
      { id: "no_capacity", label: "I don't have the capacity right now" },
      { id: "too_big", label: "It feels too big" },
    ],
  },
  {
    worry_text: "Caring about everything online leaves me numb by afternoon.",
    category: "community",
    prompt_type: "care",
    fish_form: "turtle",
    frictions: [{ id: "overwhelming", label: "It gets overwhelming" }],
  },
  {
    worry_text: "I fear rivers and reefs are becoming background decoration.",
    category: "environment",
    prompt_type: "voice",
    fish_form: "betta",
    frictions: [{ id: "distant", label: "It feels distant from my life" }],
  },
  {
    worry_text: "Something I wish I understood better is how change actually starts locally.",
    category: "future",
    prompt_type: "curiosity",
    fish_form: "angelfish",
    frictions: [
      { id: "dont_know_what_to_do", label: "I don't know what I could do" },
    ],
  },
  {
    worry_text: "Group chats go silent when hard news appears.",
    category: "belonging",
    prompt_type: "worry",
    fish_form: "seahorse",
    frictions: [{ id: "unsafe", label: "It can feel unsafe to talk about" }],
  },
  {
    worry_text: "Work asks for more while community needs more too.",
    category: "economy",
    prompt_type: "care",
    fish_form: "turtle",
    frictions: [
      { id: "no_capacity", label: "I don't have the capacity right now" },
    ],
  },
];

clearAll();

const created = samples.map((sample, index) => {
  const created_at = new Date(
    Date.now() - (samples.length - index) * 60_000,
  ).toISOString();
  return seedSubmission({ ...sample, created_at });
});

seedStewardship({
  submission_id: created[0].id,
  response_text:
    "I walked to the creek near campus and sat with the news for ten minutes.",
  action_type: "reflection",
});

seedStewardship({
  submission_id: created[1].id,
  response_text: "Said hello to the person who waters plants on my street.",
  action_type: "conversation",
});

console.log(
  `Seeded ${created.length} submissions into ${path.join(process.cwd(), "data", "shared-burdens.db")}`,
);
