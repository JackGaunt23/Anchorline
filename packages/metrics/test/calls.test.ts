import { describe, expect, it } from "vitest";
import {
  agencyDayRange,
  buildDailyCallReport,
  classifyCallResult,
  qualifyConversation,
} from "../src/calls";

const callStart = new Date("2026-07-15T16:00:00.000Z");
const daysBefore = (days: number) => new Date(callStart.getTime() - days * 86_400_000);

describe("qualifyConversation", () => {
  it("requires more than 600 seconds", () => {
    expect(qualifyConversation({ durationSeconds: 600, callStart, lastPriorContactAt: null })).toEqual({
      qualifies: false,
      reason: "under_10_min",
      daysSinceContact: null,
    });
    expect(qualifyConversation({ durationSeconds: 601, callStart, lastPriorContactAt: null }).qualifies).toBe(true);
  });

  it("requires more than a 30-day gap", () => {
    expect(qualifyConversation({ durationSeconds: 601, callStart, lastPriorContactAt: daysBefore(30) })).toEqual({
      qualifies: false,
      reason: "contacted_recently",
      daysSinceContact: 30,
    });
    expect(qualifyConversation({ durationSeconds: 601, callStart, lastPriorContactAt: daysBefore(31) })).toEqual({
      qualifies: true,
      reason: null,
      daysSinceContact: 31,
    });
  });

  it("qualifies a first contact and gives duration precedence for a short recent call", () => {
    expect(qualifyConversation({ durationSeconds: 900, callStart, lastPriorContactAt: null }).qualifies).toBe(true);
    expect(qualifyConversation({ durationSeconds: 300, callStart, lastPriorContactAt: daysBefore(2) })).toEqual({
      qualifies: false,
      reason: "under_10_min",
      daysSinceContact: 2,
    });
  });
});

describe("classifyCallResult", () => {
  it.each([
    ["Call connected", "connected"],
    ["Accepted", "connected"],
    ["Voicemail", "voicemail"],
    ["Reply", "voicemail"],
    ["Missed", "no_answer"],
    ["No Answer", "no_answer"],
    ["Busy", "no_answer"],
    ["Hang Up", "no_answer"],
    ["Rejected", "no_answer"],
    ["Call Failed", "no_answer"],
    ["Wrong Number", "no_answer"],
    ["Something new", "no_answer"],
    [null, "no_answer"],
  ] as const)("maps %s to %s", (result, expected) => {
    expect(classifyCallResult(result)).toBe(expected);
  });
});

describe("buildDailyCallReport", () => {
  it("builds segment totals and rounds the outbound connect rate to one decimal", () => {
    const report = buildDailyCallReport([
      { direction: "Inbound", result: "Accepted" },
      { direction: "Outbound", result: "Call connected" },
      { direction: "Outbound", result: "Accepted" },
      { direction: "Outbound", result: "Voicemail" },
      { direction: "Outbound", result: "No Answer" },
      { direction: "Outbound", result: "Busy" },
    ]);
    expect(report).toEqual({
      inbound: 1,
      outboundConnected: 2,
      outboundVoicemail: 1,
      outboundNoAnswer: 2,
      outboundTotal: 5,
      total: 6,
      connectRatePct: 40,
    });

    const rounded = buildDailyCallReport([
      { direction: "Outbound", result: "Accepted" },
      { direction: "Outbound", result: "No Answer" },
      { direction: "Outbound", result: "No Answer" },
    ]);
    expect(rounded.connectRatePct).toBe(33.3);
  });

  it("returns a zero rate with no outbound calls", () => {
    expect(buildDailyCallReport([{ direction: "Inbound", result: null }]).connectRatePct).toBe(0);
  });
});

describe("agencyDayRange", () => {
  it("uses the previous New York local date when UTC is past midnight", () => {
    const range = agencyDayRange("America/New_York", new Date("2026-07-15T02:00:00.000Z"));
    expect(range.from.toISOString()).toBe("2026-07-14T04:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("bounds a UTC day at UTC midnight", () => {
    const range = agencyDayRange("UTC", new Date("2026-07-15T00:00:01.000Z"));
    expect(range.from.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-07-16T00:00:00.000Z");
  });
});
