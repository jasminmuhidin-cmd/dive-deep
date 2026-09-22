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
<<<<<<< HEAD
    worry_text: "Money talk makes me shut down even when I want to stay present.",
    category: "economy" as const,
    theme: "economy",
    feeling_tag: "overwhelmed",
  },
  {
    worry_text: "I wonder if small actions still matter in a system this large.",
    category: "environment" as const,
    theme: "environment",
    feeling_tag: "doubtful",
  },
  {
    worry_text: "Care work is endless and rarely named as real work.",
    category: "community" as const,
    theme: "community",
    feeling_tag: "tired",
  },
  {
    worry_text: "I am afraid my kids will inherit only our unfinished worries.",
    category: "future" as const,
    theme: "future",
    feeling_tag: "anxious",
=======
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
>>>>>>> ac8b2fe33212a9dcf34d66326304e062e78fcbfa
  },
];

async function main() {
  await clearAll();

  const created = [];
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const created_at = new Date(
      Date.now() - (samples.length - index) * 60_000,
    ).toISOString();
    created.push(await seedSubmission({ ...sample, created_at }));
  }

  console.log(
    `Seeded ${created.length} thoughts into ${path.join(process.cwd(), "data", "shared-burdens.db")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
