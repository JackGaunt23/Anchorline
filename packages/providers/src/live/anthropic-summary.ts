// Anthropic daily-summary generator.
//
// Turns the last-30-day aggregates (built by @anchorline/metrics) into the
// dashboard's AI panel: one plain-language paragraph plus exactly three
// insight cards. Same conventions as the call scorer: shared thin client,
// zod-validated JSON output, one correction retry before failing (the job
// queue's retry/backoff applies after that).

import { z } from "zod";
import type { GeneratedSummary, SummaryGenerator, SummaryStats } from "../types";
import {
  anthropicConfigFromEnv,
  completeMessages,
  type AnthropicConfig,
  type AnthropicMessage,
  type FetchLike,
} from "./anthropic";

const MAX_OUTPUT_TOKENS = 1024;

export const SUMMARY_SYSTEM_PROMPT = `You are writing the daily AI summary for a P&C insurance agency owner's performance dashboard. You are given a JSON object of the team's last-30-day stats: totals (calls, talk minutes, quotes, policies, premium dollars, close rate and its period-over-period delta in points) and per-producer numbers (process score = average AI call-score 0-100, previous period's process score, close rate %, premium dollars, and a manual "ramping" flag for recently hired producers).

Respond with ONLY a JSON object, no other text:
{"summary": "<one paragraph, 3-5 sentences, plain language, written to the owner>", "insights": [exactly 3 of {"producer": "<exact full producer name from the stats>", "text": "<one sentence with at least one concrete number>", "tone": "good" | "warning" | "info"}]}

Rules:
- Use only numbers present in the stats; never invent or extrapolate figures.
- The summary should open with the team totals, then call out the most decision-relevant pattern (e.g. process score tracking close rate, activity not converting, a ramping producer trending up).
- Insights: one "good" (standout performance), one "warning" (clearest coaching case), one "info" (a trend worth watching). Three different producers when possible.
- Plain business language; no headers, no markdown, no exclamation marks.`;

const insightSchema = z.object({
  producer: z.string().min(1),
  text: z.string().min(1),
  tone: z.enum(["good", "warning", "info"]),
});

const summarySchema = z.object({
  summary: z.string().min(1),
  insights: z.array(insightSchema).length(3),
});

/** Extract and validate the summary JSON from model output (exported for tests). */
export function parseSummaryJson(text: string): { summaryText: string; insights: z.infer<typeof insightSchema>[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = summarySchema.safeParse(json);
  if (!parsed.success) return null;
  return { summaryText: parsed.data.summary, insights: parsed.data.insights };
}

export class AnthropicSummaryGenerator implements SummaryGenerator {
  constructor(
    private readonly config: AnthropicConfig | null = anthropicConfigFromEnv(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async generateSummary(
    stats: SummaryStats,
    opts?: { previousSummaryText?: string | null },
  ): Promise<GeneratedSummary> {
    if (!this.config) {
      throw new Error(
        "Anthropic summary generation is not configured — set ANTHROPIC_API_KEY (or run with DATA_MODE=demo).",
      );
    }
    let content = `Team stats for the last 30 days:\n${JSON.stringify(stats, null, 2)}`;
    if (opts?.previousSummaryText) {
      content += `\n\nThe previous summary read: "${opts.previousSummaryText}"\nTake a fresh angle rather than repeating it.`;
    }
    const messages: AnthropicMessage[] = [{ role: "user", content }];

    // One correction retry: feed the invalid output back and ask again.
    for (let attempt = 0; ; attempt++) {
      const { text } = await completeMessages(this.config, this.fetchImpl, {
        system: SUMMARY_SYSTEM_PROMPT,
        messages,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
      const parsed = parseSummaryJson(text);
      if (parsed) return { summaryText: parsed.summaryText, insights: parsed.insights, model: this.config.model };
      if (attempt >= 1) {
        throw new Error(`Anthropic summary generator returned invalid JSON twice: ${text.slice(0, 200)}`);
      }
      messages.push(
        { role: "assistant", content: text },
        { role: "user", content: "That was not the required JSON object. Respond with ONLY the JSON object described in your instructions." },
      );
    }
  }
}
