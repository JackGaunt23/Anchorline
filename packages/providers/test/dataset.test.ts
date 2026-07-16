import { describe, expect, it } from "vitest";
import { generateDemoDataset, demoAnchor } from "../src/mock";
import { CONVERSATION_STORY_CALLS, PRODUCERS, SCRIPTED_CALLS } from "../src/mock/fixtures";
import { SCRIPTED_TRANSCRIPTS } from "../src/mock/transcripts";

const DAY_MS = 86_400_000;
const anchor = demoAnchor(new Date("2026-07-12T15:00:00Z"));
const dataset = generateDemoDataset(anchor);
const windowStart = new Date(anchor.getTime() - 30 * DAY_MS);

const inCurrentWindow = (d: Date) => d >= windowStart && d < anchor;

describe("demo dataset reproduces the mockup's last-30-day numbers", () => {
  const currentCalls = dataset.calls.filter((c) => inCurrentWindow(c.startTime));

  it("hits the exact call totals per producer and overall (1,755)", () => {
    for (const p of PRODUCERS) {
      const n = currentCalls.filter((c) => c.rcExtensionId === p.rcExtensionId).length;
      expect(n, p.key).toBe(p.current.calls);
    }
    const mapped = currentCalls.filter((c) => c.rcExtensionId !== "199");
    expect(mapped.length).toBe(1755);
  });

  it("hits the exact talk-time totals (10,870 minutes)", () => {
    let totalSeconds = 0;
    for (const p of PRODUCERS) {
      const secs = currentCalls
        .filter((c) => c.rcExtensionId === p.rcExtensionId)
        .reduce((s, c) => s + c.durationSeconds, 0);
      expect(secs, p.key).toBe(p.current.talkMinutes * 60);
      totalSeconds += secs;
    }
    expect(totalSeconds).toBe(10_870 * 60);
  });

  it("hits the exact quote counts (481)", () => {
    const quoteDates = new Map(dataset.leads.map((l) => [l.azLeadId, l.quoteDate]));
    let total = 0;
    for (const p of PRODUCERS) {
      const leadIds = new Set(
        dataset.leads.filter((l) => l.azProducerId === p.azProducerId).map((l) => l.azLeadId),
      );
      const n = dataset.quotes.filter((q) => {
        if (!leadIds.has(q.azLeadId)) return false;
        const at = quoteDates.get(q.azLeadId);
        return at != null && inCurrentWindow(at);
      }).length;
      expect(n, p.key).toBe(p.current.quotes);
      total += n;
    }
    expect(total).toBe(481);
  });

  it("hits the exact policy counts (70) and premium ($187,600)", () => {
    let count = 0;
    let premiumCents = 0;
    for (const p of PRODUCERS) {
      const sold = dataset.policies.filter(
        (pol) => pol.azProducerId === p.azProducerId && inCurrentWindow(pol.soldDate),
      );
      expect(sold.length, p.key).toBe(p.current.policies);
      const cents = sold.reduce((s, pol) => s + pol.premiumCents, 0);
      expect(cents, p.key).toBe(p.current.premiumDollars * 100);
      count += sold.length;
      premiumCents += cents;
    }
    expect(count).toBe(70);
    expect(premiumCents).toBe(187_600 * 100);
  });

  it("scored-call means match each producer's process score", () => {
    const callById = new Map(dataset.calls.map((c) => [c.rcSessionId, c]));
    for (const p of PRODUCERS) {
      const scores = dataset.scoredCalls.filter((s) => {
        if (s.producerKey !== p.key) return false;
        const call = callById.get(s.rcSessionId);
        return call != null && inCurrentWindow(call.startTime);
      });
      const mean = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
      expect(Math.round(mean), p.key).toBe(p.current.processScore);
    }
  });

  it("includes all 20 scripted calls with their transcripts", () => {
    for (const sc of SCRIPTED_CALLS) {
      const scored = dataset.scoredCalls.find((s) => s.rcSessionId === `demo-rc-${sc.id}`);
      expect(scored, sc.id).toBeDefined();
      expect(scored?.score).toBe(sc.score);
      expect(scored?.summary).toBe(sc.summary);
      expect(scored?.transcript).toBe(SCRIPTED_TRANSCRIPTS[sc.id]);
      const call = dataset.calls.find((c) => c.rcSessionId === `demo-rc-${sc.id}`);
      expect(call?.durationSeconds).toBe(sc.durationSeconds);
      expect(call?.hasRecording).toBe(true);
    }
  });

  it("keeps at least three qualifying first-contact stories in the latest two days", () => {
    const recentLongStories = CONVERSATION_STORY_CALLS.filter(
      (story) => story.daysAgo <= 1 && story.durationSeconds > 600,
    );
    const firstContacts = recentLongStories.filter((story) => {
      const call = dataset.calls.find(
        (candidate) => candidate.rcSessionId === `demo-rc-conversation-${story.id}`,
      );
      if (!call?.counterpartyNumber) return false;
      return !dataset.calls.some(
        (candidate) =>
          candidate.counterpartyNumber === call.counterpartyNumber &&
          candidate.startTime < call.startTime,
      );
    });

    expect(firstContacts.length).toBeGreaterThanOrEqual(3);
  });

  it("prior-window volumes produce the mockup deltas (within rounding)", () => {
    const priorStart = new Date(anchor.getTime() - 60 * DAY_MS);
    const priorCalls = dataset.calls.filter(
      (c) => c.startTime >= priorStart && c.startTime < windowStart && c.rcExtensionId !== "199",
    );
    const priorTotal = PRODUCERS.reduce((s, p) => s + p.prior.calls, 0);
    expect(priorCalls.length).toBe(priorTotal);
    // 1755 / prior ≈ 1.084
    expect(1755 / priorCalls.length).toBeGreaterThan(1.075);
    expect(1755 / priorCalls.length).toBeLessThan(1.095);
  });

  it("keeps unmapped-extension calls outside the KPI windows", () => {
    const office = dataset.calls.filter((c) => c.rcExtensionId === "199");
    expect(office.length).toBeGreaterThan(0);
    const priorStart = new Date(anchor.getTime() - 60 * DAY_MS);
    for (const c of office) expect(c.startTime < priorStart).toBe(true);
  });

  it("is deterministic for a given anchor", () => {
    const again = generateDemoDataset(anchor);
    expect(again.calls.length).toBe(dataset.calls.length);
    expect(again.calls[100]?.rcSessionId).toBe(dataset.calls[100]?.rcSessionId);
    expect(again.calls[100]?.startTime.getTime()).toBe(dataset.calls[100]?.startTime.getTime());
    expect(again.policies.map((p) => p.premiumCents).join()).toBe(
      dataset.policies.map((p) => p.premiumCents).join(),
    );
  });

  it("never generates future-dated records", () => {
    for (const c of dataset.calls) expect(c.startTime < anchor).toBe(true);
  });
});
