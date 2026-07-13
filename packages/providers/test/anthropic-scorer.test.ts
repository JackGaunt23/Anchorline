import { describe, expect, it } from "vitest";
import {
  AnthropicApiError,
  AnthropicCallScorer,
  CALL_SCORING_PROMPT_VERSION,
  parseScoreJson,
  type AnthropicConfig,
} from "../src/live/anthropic-scorer";

type Handler = (url: string, init?: RequestInit) => Response;

function fakeFetch(handler: Handler) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return handler(String(url), init);
  }) as typeof fetch;
  return { impl, calls };
}

const cfg: AnthropicConfig = { apiKey: "sk-ant-test", model: "claude-sonnet-5", baseUrl: "https://anthropic.test" };

const validCard = {
  score: 88,
  rapport: true,
  discovery_questions: true,
  quote_presented: true,
  objection_handling: false,
  close_attempted: true,
  summary: "Priya quoted an auto bundle and set a binding call for Thursday.",
};

const messagesResponse = (text: string) =>
  new Response(JSON.stringify({ content: [{ type: "text", text }], model: cfg.model }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const input = { transcript: "Agent: Hello.\nCustomer: Hi.", rcSessionId: "rc-1" };

describe("AnthropicCallScorer", () => {
  it("sends the versioned rubric prompt and returns the validated scorecard", async () => {
    const { impl, calls } = fakeFetch(() => messagesResponse(JSON.stringify(validCard)));
    const scorer = new AnthropicCallScorer(cfg, impl);
    const scored = await scorer.scoreCall(input);

    expect(scored.result).toEqual(validCard);
    expect(scored.model).toBe("claude-sonnet-5");
    expect(scored.promptVersion).toBe(CALL_SCORING_PROMPT_VERSION);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://anthropic.test/v1/messages");
    const body = calls[0]!.body;
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.temperature).toBe(0);
    expect(String(body.system)).toContain("close_attempted");
    expect(body.messages).toEqual([{ role: "user", content: input.transcript }]);
  });

  it("tolerates prose and code fences around the JSON", async () => {
    const { impl } = fakeFetch(() =>
      messagesResponse("Here is the scorecard:\n```json\n" + JSON.stringify(validCard) + "\n```"),
    );
    const scored = await new AnthropicCallScorer(cfg, impl).scoreCall(input);
    expect(scored.result).toEqual(validCard);
  });

  it("retries once with a correction turn on invalid output, then succeeds", async () => {
    let n = 0;
    const { impl, calls } = fakeFetch(() =>
      messagesResponse(n++ === 0 ? "I'd rate this call quite highly overall." : JSON.stringify(validCard)),
    );
    const scored = await new AnthropicCallScorer(cfg, impl).scoreCall(input);
    expect(scored.result).toEqual(validCard);
    expect(calls).toHaveLength(2);
    const retryMessages = calls[1]!.body.messages as { role: string; content: string }[];
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1]!.role).toBe("assistant");
    expect(retryMessages[2]!.content).toContain("ONLY the JSON object");
  });

  it("fails after a second invalid response", async () => {
    const { impl, calls } = fakeFetch(() => messagesResponse("still not json"));
    await expect(new AnthropicCallScorer(cfg, impl).scoreCall(input)).rejects.toThrow(/invalid JSON twice/);
    expect(calls).toHaveLength(2);
  });

  it("treats an out-of-range score as invalid output (retry then fail)", async () => {
    const { impl, calls } = fakeFetch(() => messagesResponse(JSON.stringify({ ...validCard, score: 140 })));
    await expect(new AnthropicCallScorer(cfg, impl).scoreCall(input)).rejects.toThrow(/invalid JSON twice/);
    expect(calls).toHaveLength(2);
  });

  it("surfaces API errors with their status", async () => {
    const { impl } = fakeFetch(() => new Response("overloaded", { status: 529 }));
    await expect(new AnthropicCallScorer(cfg, impl).scoreCall(input)).rejects.toMatchObject({
      name: "AnthropicApiError",
      status: 529,
    });
    await expect(new AnthropicCallScorer(cfg, impl).scoreCall(input)).rejects.toBeInstanceOf(AnthropicApiError);
  });

  it("explains missing configuration", async () => {
    await expect(new AnthropicCallScorer(null).scoreCall(input)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("parseScoreJson", () => {
  it("rounds fractional scores to integers", () => {
    expect(parseScoreJson(JSON.stringify({ ...validCard, score: 87.6 }))?.score).toBe(88);
  });

  it("rejects missing fields, wrong types, and empty summaries", () => {
    const { summary: _summary, ...missingSummary } = validCard;
    expect(parseScoreJson(JSON.stringify(missingSummary))).toBeNull();
    expect(parseScoreJson(JSON.stringify({ ...validCard, rapport: "yes" }))).toBeNull();
    expect(parseScoreJson(JSON.stringify({ ...validCard, summary: "" }))).toBeNull();
    expect(parseScoreJson("no json here")).toBeNull();
  });
});
