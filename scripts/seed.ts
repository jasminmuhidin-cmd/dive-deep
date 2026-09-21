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
    worry_text: "Rent and bills leave little room to care about anything else.",
    category: "economy" as const,
    theme: "economy",
    feeling_tag: "overwhelmed",
  },
  {
    worry_text: "Caring about everything online leaves me numb by afternoon.",
    category: "community" as const,
    theme: "community",
    feeling_tag: "numb",
  },
  {
    worry_text: "I fear rivers and reefs are becoming background decoration.",
    category: "environment" as const,
    theme: "environment",
    feeling_tag: "grief",
  },
  {
    worry_text: "Younger cousins ask about the future and I freeze.",
    category: "future" as const,
    theme: "future",
    feeling_tag: "anxious",
  },
];

clearAll();

const created = samples.map((sample, index) => {
  const created_at = new Date(
    Date.now() - (samples.length - index) * 60_000,
  ).toISOString();
  return seedSubmission({ ...sample, created_at });
});

console.log(
  `Seeded ${created.length} thoughts into ${path.join(process.cwd(), "data", "shared-burdens.db")}`,
);
