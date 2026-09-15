import path from "path";
import { clearAll, seedStewardship, seedSubmission } from "../lib/db";

const samples = [
  {
    worry_text:
      "I keep scrolling past climate headlines until they feel like white noise.",
    offering_text:
      "I can name one local green space I care about and visit it this week.",
    category: "environment" as const,
  },
  {
    worry_text: "My neighbourhood feels quieter and more fragmented than before.",
    offering_text: "I will greet one neighbour I usually walk past.",
    category: "community" as const,
  },
  {
    worry_text: "I worry the future is already decided without people like me.",
    offering_text: "I can share one hopeful story with a friend this week.",
    category: "future" as const,
  },
  {
    worry_text: "I feel invisible in rooms where everyone seems to belong.",
    offering_text: "I will check in on someone who might feel the same.",
    category: "belonging" as const,
  },
  {
    worry_text: "Rent and bills leave little room to care about anything else.",
    offering_text: "I can swap one resource tip with someone under pressure.",
    category: "economy" as const,
  },
  {
    worry_text: "Caring about everything online leaves me numb by afternoon.",
    offering_text: "I will choose one issue and give it twenty quiet minutes.",
    category: "community" as const,
  },
  {
    worry_text: "I fear rivers and reefs are becoming background decoration.",
    offering_text: "I can pick up litter on one familiar stretch of path.",
    category: "environment" as const,
  },
  {
    worry_text: "Younger cousins ask about the future and I freeze.",
    offering_text: "I will answer honestly and ask what they hope for too.",
    category: "future" as const,
  },
  {
    worry_text: "Group chats go silent when hard news appears.",
    offering_text: "I can start one gentle conversation instead of leaving.",
    category: "belonging" as const,
  },
  {
    worry_text: "Work asks for more while community needs more too.",
    offering_text: "I will protect one evening for someone else's need.",
    category: "economy" as const,
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
