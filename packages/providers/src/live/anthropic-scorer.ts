// Anthropic call scorer.
//
// Scores a sales-call transcript against the five-step process rubric via one
// Messages API call (shared thin client in ./anthropic.ts). The response must
// be a single JSON object; it is zod-validated, and one retry with a
// correction turn is attempted before the job is failed. The prompt is
// versioned so scores are comparable within a prompt generation (persisted as
// call_scores.prompt_version).

import { z } from "zod";
import type { CallScorer, CallScoreResult, ScoredCall } from "../types";
import {
  anthropicConfigFromEnv,
  completeMessages,
  type AnthropicConfig,
  type AnthropicMessage,
  type FetchLike,
} from "./anthropic";

export { AnthropicApiError, DEFAULT_ANTHROPIC_MODEL, anthropicConfigFromEnv, type AnthropicConfig } from "./anthropic";

export const CALL_SCORING_PROMPT_VERSION = "v1";

/** Ample for an hour-long call; guards the prompt against pathological input. */
const MAX_TRANSCRIPT_CHARS = 120_000;
const MAX_OUTPUT_TOKENS = 512;

export const SCORING_SYSTEM_PROMPT = `You are a sales coach scoring a recorded phone call from a property & casualty insurance agency. The transcript may label speakers by role (Agent/Customer) or generically (Speaker 1/Speaker 2); infer who the agent is.

Evaluate the AGENT against this five-step sales process:
1. rapport — built personal rapport before diving into business
2. discovery_questions — asked open-ended questions to understand the customer's situation and coverage needs
3. quote_presented — presented a concrete quote (price and coverage)
4. objection_handling — acknowledged and addressed customer concerns or objections rather than deflecting them
5. close_attempted — asked for the sale or set a concrete next step toward binding

Respond with ONLY a JSON object, no other text:
{"score": <integer 0-100, overall process quality>, "rapport": <bool>, "discovery_questions": <bool>, "quote_presented": <bool>, "objection_handling": <bool>, "close_attempted": <bool>, "summary": "<one specific, plain-language sentence about what happened on this call>"}`;

const scoreSchema = z.object({
  score: z.number().min(0).max(100),
  rapport: z.boolean(),
  discovery_questions: z.boolean(),
  quote_presented: z.boolean(),
  objection_handling: z.boolean(),
  close_attempted: z.boolean(),
  summary: z.string().min(1),
});

/**
 * Extract and validate the scorecard JSON from model output (exported for
 * tests). Tolerates code fences or stray prose around the object.
 */
export function parseScoreJson(text: string): CallScoreResult | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = scoreSchema.safeParse(json);
  if (!parsed.success) return null;
  return { ...parsed.data, score: Math.round(parsed.data.score) };
}

export class AnthropicCallScorer implements CallScorer {
  constructor(
    private readonly config: AnthropicConfig | null = anthropicConfigFromEnv(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async scoreCall(input: { transcript: string; rcSessionId: string }): Promise<ScoredCall> {
    if (!this.config) {
      throw new Error("Anthropic scoring is not configured — set ANTHROPIC_API_KEY (or run with DATA_MODE=demo).");
    }
    const transcript = input.transcript.slice(0, MAX_TRANSCRIPT_CHARS);
    const messages: AnthropicMessage[] = [{ role: "user", content: transcript }];

    // One correction retry: feed the invalid output back and ask again.
    for (let attempt = 0; ; attempt++) {
      const { text, raw } = await completeMessages(this.config, this.fetchImpl, {
        system: SCORING_SYSTEM_PROMPT,
        messages,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
      const result = parseScoreJson(text);
      if (result) return { result, model: this.config.model, promptVersion: CALL_SCORING_PROMPT_VERSION, raw };
      if (attempt >= 1) {
        throw new Error(`Anthropic scorer returned invalid JSON twice: ${text.slice(0, 200)}`);
      }
      messages.push(
        { role: "assistant", content: text },
        { role: "user", content: "That was not the required JSON object. Respond with ONLY the JSON object described in your instructions." },
      );
    }
  }
}
