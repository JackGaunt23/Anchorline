import { describe, expect, it } from "vitest";
import {
  CALL_SCORING_PROMPT_VERSION,
  OpenAIApiError,
  OpenAICallScorer,
  parseScoreJson,
  type OpenAIConfig,
} from "../src/live/openai-scorer";

type Handler = (url: string, init?: RequestInit) => Response;

function fakeFetch(handler: Handler) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return handler(String(url), init);
  }) as typeof fetch;
  return { impl, calls };
}

const cfg: OpenAIConfig = { apiKey: "sk-test", model: "gpt-5.1", baseUrl: "https://openai.test" };

const validCard = {
  score: 88,
  rapport: true,
  discovery_questions: true,
  quote_presented: true,
  objection_handling: false,
  close_attempted: true,
  summary: "Priya quoted an auto bundle and set a binding call for Thursday.",
};

const chatResponse = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], model: "gpt-5.1" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const input = { transcript: "Agent: Hello.\nCustomer: Hi.", rcSessionId: "rc-1" };

describe("OpenAICallScorer", () => {
  it("sends the versioned rubric prompt and returns the validated scorecard", async () => {
    const { impl, calls } = fakeFetch(() => chatResponse(JSON.stringify(validCard)));
    const scorer = new OpenAICallScorer(cfg, impl);
    const scored = await scorer.scoreCall(input);

    expect(scored.result).toEqual(validCard);
    expect(scored.model).toBe("gpt-5.1");
    expect(scored.promptVersion).toBe(CALL_SCORING_PROMPT_VERSION);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openai.test/v1/chat/completions");
    const body = calls[0]!.body;
    expect(body.model).toBe("gpt-5.1");
    expect(body).not.toHaveProperty("temperature");
    expect(body.max_completion_tokens).toBe(1024);
    expect(body.response_format).toEqual({ type: "json_object" });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toContain("close_attempted");
    expect(messages[1]).toEqual({ role: "user", content: input.transcript });
  });

  it("tolerates prose and code fences around the JSON", async () => {
    const { impl } = fakeFetch(() =>
      chatResponse("Here is the scorecard:\n```json\n" + JSON.stringify(validCard) + "\n```"),
    );
    const scored = await new OpenAICallScorer(cfg, impl).scoreCall(input);
    expect(scored.result).toEqual(validCard);
  });

  it("retries once with a correction turn on invalid output, then succeeds", async () => {
    let n = 0;
    const badText = "I'd rate this call quite highly overall.";
    const { impl, calls } = fakeFetch(() =>
      chatResponse(n++ === 0 ? badText : JSON.stringify(validCard)),
    );
    const scored = await new OpenAICallScorer(cfg, impl).scoreCall(input);
    expect(scored.result).toEqual(validCard);
    expect(calls).toHaveLength(2);
    const retryMessages = calls[1]!.body.messages as { role: string; content: string }[];
    expect(retryMessages).toHaveLength(4);
    expect(retryMessages[2]).toEqual({ role: "assistant", content: badText });
    expect(retryMessages[3]!.content).toContain("ONLY the JSON object");
  });

  it("fails after a second invalid response", async () => {
    const { impl, calls } = fakeFetch(() => chatResponse("still not json"));
    await expect(new OpenAICallScorer(cfg, impl).scoreCall(input)).rejects.toThrow(/invalid JSON twice/);
    expect(calls).toHaveLength(2);
  });

  it("treats an out-of-range score as invalid output (retry then fail)", async () => {
    const { impl, calls } = fakeFetch(() => chatResponse(JSON.stringify({ ...validCard, score: 140 })));
    await expect(new OpenAICallScorer(cfg, impl).scoreCall(input)).rejects.toThrow(/invalid JSON twice/);
    expect(calls).toHaveLength(2);
  });

  it("surfaces API errors with their status", async () => {
    const { impl } = fakeFetch(() => new Response("rate limited", { status: 429 }));
    await expect(new OpenAICallScorer(cfg, impl).scoreCall(input)).rejects.toMatchObject({
      name: "OpenAIApiError",
      status: 429,
    });
    await expect(new OpenAICallScorer(cfg, impl).scoreCall(input)).rejects.toBeInstanceOf(OpenAIApiError);
  });

  it("explains missing configuration", async () => {
    await expect(new OpenAICallScorer(null).scoreCall(input)).rejects.toThrow(/OPENAI_API_KEY/);
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
