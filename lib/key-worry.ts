import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `People at a public installation anonymously write down something they care about or worry about. Name the key worry in each one as a short title for a gallery card.

- 2 to 5 words, sentence case, no full stop, no quotation marks.
- Name the underlying concern, not the person's feeling about it (e.g. "Housing out of reach", "AI replacing jobs", "Climate news fatigue").
- Keep the person's meaning; don't soften, judge or add to it.
- If the text is too vague, a name, or a test message, reply with exactly: NONE

Reply with the title only.`;

let client: Anthropic | null = null;

/**
 * A short Claude-written title naming the concern in a submission, or null when
 * there's no API key, the text has no clear concern, or the request fails.
 */
export async function generateKeyWorry(worryText: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: worryText }],
    });
    if (response.stop_reason === "refusal") return null;

    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim()
      .replace(/^["'“‘]+|["'”’.]+$/g, "");
    if (!text || text === "NONE" || text.split(/\s+/).length > 8) return null;
    return text;
  } catch (err) {
    console.error("[key-worry] generation failed:", err);
    return null;
  }
}
