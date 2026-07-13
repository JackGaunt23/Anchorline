import { describe, expect, it } from "vitest";
import { AnthropicSummaryGenerator, parseSummaryJson } from "../src/live/anthropic-summary";
import type { AnthropicConfig } from "../src/live/anthropic";
import { MockSummaryGenerator } from "../src/mock/providers";
import { buildDemoSummary, DEMO_MODEL } from "../src/mock/dataset";
import type { SummaryStats } from "../src/types";

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

const stats: SummaryStats = {
  totalCalls: 1755,
  talkMinutes: 10870,
  quotes: 481,
  policies: 70,
  premiumDollars: 187600,
  closeRatePct: 14.6,
  closeRateDeltaPts: 2.9,
  producers: [
    { name: "Priya Nandakumar", processScore: 94, prevProcessScore: 91, closeRatePct: 23.2, premiumDollars: 79400, isRamping: false },
    { name: "Tomas Berglund", processScore: 34, prevProcessScore: 36, closeRatePct: 8.7, premiumDollars: 15900, isRamping: false },
    { name: "Aisha Coleman", processScore: 61, prevProcessScore: 49, closeRatePct: 14.8, premiumDollars: 22900, isRamping: true },
  ],
};

const validSummary = {
  summary: "The team logged 1,755 calls and wrote $187,600 across 70 policies at a 14.6% close rate.",
  insights: [
    { producer: "Priya Nandakumar", text: "Priya leads with $79,400 written.", tone: "good" },
    { producer: "Tomas Berglund", text: "Tomas's 34 process score is the clearest coaching case.", tone: "warning" },
    { producer: "Aisha Coleman", text: "Aisha's score is up 12 points period over period.", tone: "info" },
  ],
};

const messagesResponse = (text: string) =>
  new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("AnthropicSummaryGenerator", () => {
  it("sends the stats and returns the validated summary", async () => {
    const { impl, calls } = fakeFetch(() => messagesResponse(JSON.stringify(validSummary)));
    const generated = await new AnthropicSummaryGenerator(cfg, impl).generateSummary(stats);

    expect(generated.summaryText).toBe(validSummary.summary);
    expect(generated.insights).toEqual(validSummary.insights);
    expect(generated.model).toBe("claude-sonnet-5");

    expect(calls[0]!.url).toBe("https://anthropic.test/v1/messages");
    const body = calls[0]!.body;
    expect(String(body.system)).toContain("exactly 3");
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0]!.content).toContain('"totalCalls": 1755');
    expect(messages[0]!.content).not.toContain("previous summary");
  });

  it("asks for a fresh angle when a previous summary exists", async () => {
    const { impl, calls } = fakeFetch(() => messagesResponse(JSON.stringify(validSummary)));
    await new AnthropicSummaryGenerator(cfg, impl).generateSummary(stats, {
      previousSummaryText: "Yesterday's take.",
    });
    const messages = calls[0]!.body.messages as { role: string; content: string }[];
    expect(messages[0]!.content).toContain('The previous summary read: "Yesterday\'s take."');
    expect(messages[0]!.content).toContain("fresh angle");
  });

  it("retries once on invalid output, then fails", async () => {
    const { impl, calls } = fakeFetch(() => messagesResponse("not json"));
    await expect(new AnthropicSummaryGenerator(cfg, impl).generateSummary(stats)).rejects.toThrow(
      /invalid JSON twice/,
    );
    expect(calls).toHaveLength(2);
    const retryMessages = calls[1]!.body.messages as { role: string }[];
    expect(retryMessages).toHaveLength(3);
  });

  it("rejects the wrong number of insights as invalid output", async () => {
    const { impl, calls } = fakeFetch(() =>
      messagesResponse(JSON.stringify({ ...validSummary, insights: validSummary.insights.slice(0, 2) })),
    );
    await expect(new AnthropicSummaryGenerator(cfg, impl).generateSummary(stats)).rejects.toThrow(
      /invalid JSON twice/,
    );
    expect(calls).toHaveLength(2);
  });

  it("explains missing configuration", async () => {
    await expect(new AnthropicSummaryGenerator(null).generateSummary(stats)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("parseSummaryJson", () => {
  it("rejects a bad tone value", () => {
    const bad = {
      ...validSummary,
      insights: validSummary.insights.map((i) => ({ ...i, tone: "great" })),
    };
    expect(parseSummaryJson(JSON.stringify(bad))).toBeNull();
  });
});

describe("MockSummaryGenerator", () => {
  it("rotates through the three variants based on the previous text", async () => {
    const generator = new MockSummaryGenerator();
    const variants = [0, 1, 2].map((v) => buildDemoSummary(stats, v));

    const first = await generator.generateSummary(stats, { previousSummaryText: null });
    expect(first.summaryText).toBe(variants[0]!.summaryText);
    expect(first.model).toBe(DEMO_MODEL);

    const second = await generator.generateSummary(stats, { previousSummaryText: first.summaryText });
    expect(second.summaryText).toBe(variants[1]!.summaryText);

    const third = await generator.generateSummary(stats, { previousSummaryText: second.summaryText });
    expect(third.summaryText).toBe(variants[2]!.summaryText);

    const wrapped = await generator.generateSummary(stats, { previousSummaryText: third.summaryText });
    expect(wrapped.summaryText).toBe(variants[0]!.summaryText);
  });
});
