import path from "path";
import { clearAll, seedSubmission } from "../lib/db";

const samples = [
  {
    worry_text:
      "I keep scrolling past climate headlines until they feel like white noise.",
    category: "environment" as const,
    theme: "environment",
    feeling_tag: "numb",
  },
  {
    worry_text: "My neighbourhood feels quieter and more fragmented than before.",
    category: "community" as const,
    theme: "community",
    feeling_tag: "lonely",
  },
  {
    worry_text: "I worry the future is already decided without people like me.",
    category: "future" as const,
    theme: "future",
    feeling_tag: "anxious",
  },
  {
    worry_text: "I feel invisible in rooms where everyone seems to belong.",
    category: "belonging" as const,
    theme: "belonging",
    feeling_tag: "lonely",
  },
  {
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
