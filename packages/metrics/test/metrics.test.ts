import { describe, expect, it } from "vitest";
import {
  priorPeriod,
  pctDelta,
  ptsDelta,
  closeRatePct,
  bucketByDay,
  dayKeys,
  lastNDays,
  alignedLastNDays,
  assignBadges,
  type ProducerBadgeInput,
} from "../src";

describe("periods", () => {
  it("prior period has equal length and abuts the current one", () => {
    const range = { from: new Date("2026-06-12T00:00:00Z"), to: new Date("2026-07-12T00:00:00Z") };
    const prior = priorPeriod(range);
    expect(prior.to.getTime()).toBe(range.from.getTime());
    expect(prior.to.getTime() - prior.from.getTime()).toBe(range.to.getTime() - range.from.getTime());
    expect(prior.from.toISOString()).toBe("2026-05-13T00:00:00.000Z");
  });

  it("pctDelta computes percent change and guards prior=0", () => {
    expect(pctDelta(1755, 1619)).toBeCloseTo(8.4, 1);
    expect(pctDelta(0, 10)).toBe(-100);
    expect(pctDelta(10, 0)).toBeNull();
  });

  it("closeRatePct guards divide-by-zero", () => {
    expect(closeRatePct(70, 481)).toBeCloseTo(14.55, 1);
    expect(closeRatePct(0, 0)).toBeNull();
    expect(closeRatePct(5, 0)).toBeNull();
  });

  it("ptsDelta returns point difference or null", () => {
    expect(ptsDelta(14.6, 14.1)).toBeCloseTo(0.5, 5);
    expect(ptsDelta(null, 14)).toBeNull();
    expect(ptsDelta(14, null)).toBeNull();
  });

  it("dayKeys covers the range with UTC days", () => {
    const keys = dayKeys({ from: new Date("2026-07-01T00:00:00Z"), to: new Date("2026-07-04T00:00:00Z") });
    expect(keys).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });

  it("bucketByDay zero-fills empty days and sums values", () => {
    const range = { from: new Date("2026-07-01T00:00:00Z"), to: new Date("2026-07-04T00:00:00Z") };
    const buckets = bucketByDay(range, [
      { at: new Date("2026-07-01T09:00:00Z"), value: 2 },
      { at: new Date("2026-07-01T15:00:00Z"), value: 3 },
      { at: new Date("2026-07-03T12:00:00Z"), value: 1 },
      { at: new Date("2026-08-01T12:00:00Z"), value: 99 }, // outside range: ignored
    ]);
    expect(buckets).toEqual([
      { day: "2026-07-01", value: 5 },
      { day: "2026-07-02", value: 0 },
      { day: "2026-07-03", value: 1 },
    ]);
  });

  it("lastNDays produces an n-day window ending now", () => {
    const now = new Date("2026-07-12T10:00:00Z");
    const range = lastNDays(30, now);
    expect(range.to).toEqual(now);
    expect((range.to.getTime() - range.from.getTime()) / 86_400_000).toBe(30);
  });

  it("alignedLastNDays ends at the next UTC midnight and spans whole days", () => {
    const now = new Date("2026-07-12T10:23:45Z");
    const range = alignedLastNDays(30, now);
    expect(range.to.toISOString()).toBe("2026-07-13T00:00:00.000Z");
    expect(range.from.toISOString()).toBe("2026-06-13T00:00:00.000Z");
    // Stable for any instant within the same UTC day.
    const later = alignedLastNDays(30, new Date("2026-07-12T23:59:59Z"));
    expect(later.from).toEqual(range.from);
    expect(later.to).toEqual(range.to);
  });
});

describe("signal badges", () => {
  // A team shaped like the mockup's five producers.
  const team: ProducerBadgeInput[] = [
    { id: "priya", calls: 336, processScore: 94, priorProcessScore: 92, closeRatePct: 23.2, isRamping: false },
    { id: "devon", calls: 412, processScore: 67, priorProcessScore: 66, closeRatePct: 15.7, isRamping: false },
    { id: "aisha", calls: 188, processScore: 61, priorProcessScore: 49, closeRatePct: 14.8, isRamping: true },
    { id: "marcus", calls: 618, processScore: 41, priorProcessScore: 43, closeRatePct: 8.8, isRamping: false },
    { id: "tomas", calls: 201, processScore: 34, priorProcessScore: 35, closeRatePct: 8.7, isRamping: false },
  ];

  it("reproduces the mockup's five badges", () => {
    const badges = assignBadges(team);
    expect(badges.get("priya")).toBe("top_performer");
    expect(badges.get("devon")).toBe("on_pace");
    expect(badges.get("aisha")).toBe("ramping");
    expect(badges.get("marcus")).toBe("process_gap");
    expect(badges.get("tomas")).toBe("needs_coaching");
  });

  it("handles producers with no scored calls or no quotes", () => {
    const badges = assignBadges([
      { id: "a", calls: 100, processScore: null, priorProcessScore: null, closeRatePct: null, isRamping: false },
      { id: "b", calls: 50, processScore: 80, priorProcessScore: 78, closeRatePct: 20, isRamping: false },
    ]);
    expect(badges.get("a")).toBe("on_pace");
    expect(badges.get("b")).toBe("top_performer");
  });

  it("does not label ramping without an upward trend", () => {
    const badges = assignBadges([
      { id: "flat", calls: 100, processScore: 50, priorProcessScore: 50, closeRatePct: 10, isRamping: true },
      { id: "other", calls: 100, processScore: 90, priorProcessScore: 90, closeRatePct: 20, isRamping: false },
      { id: "third", calls: 100, processScore: 70, priorProcessScore: 70, closeRatePct: 15, isRamping: false },
    ]);
    expect(badges.get("flat")).not.toBe("ramping");
  });

  it("assigns on_pace to everyone in a one-producer team without close data", () => {
    const badges = assignBadges([
      { id: "solo", calls: 10, processScore: 90, priorProcessScore: null, closeRatePct: null, isRamping: false },
    ]);
    expect(badges.get("solo")).toBe("on_pace");
  });
});
