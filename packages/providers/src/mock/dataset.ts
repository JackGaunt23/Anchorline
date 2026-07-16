// Deterministic demo dataset generator.
//
// Produces the full synthetic history the seed script inserts and the mock
// providers serve: calls, leads, quotes, sold policies, and scored calls with
// transcripts. Totals reproduce the mockup: for the 30 days ending at the
// anchor — 1,755 calls, 10,870 talk minutes, 481 quotes, 70 policies,
// $187,600 premium — with a prior 30-day window scaled to yield the mockup's
// period-over-period deltas, and earlier months topped up so the 6-month
// premium chart tracks the mockup's bars.

import { mulberry32, pickWeighted, distributeInt, type Rng } from "./prng";
import {
  PRODUCERS,
  SCRIPTED_CALLS,
  MONTHLY_PREMIUM_TARGETS_DOLLARS,
  PRODUCT_LINES,
  PRODUCT_LINE_WEIGHTS,
  CARRIERS,
  LEAD_SOURCES,
  CONTACTS,
  CONVERSATION_STORY_CALLS,
  HOUSEHOLD_NAMES,
  type ProducerFixture,
  type RubricSteps,
  type ContactFixture,
} from "./fixtures";
import { SCRIPTED_TRANSCRIPTS, generateTranscript, generateSummary } from "./transcripts";
import type { NormalizedCall, NormalizedLead, NormalizedQuote, SummaryInsight, SummaryStats } from "../types";

const DAY_MS = 86_400_000;
export const DEMO_SEED = 20260708;
export const DEMO_MODEL = "demo-fixture";
export const DEMO_PROMPT_VERSION = "demo-1";

export interface DemoPolicy {
  azLeadId: string;
  azProducerId: string | null;
  productLine: string;
  premiumCents: number;
  soldDate: Date;
  effectiveDate: Date;
}

export interface DemoScoredCall {
  rcSessionId: string;
  producerKey: string;
  score: number;
  steps: RubricSteps;
  summary: string;
  transcript: string;
}

export interface DemoDataset {
  producers: ProducerFixture[];
  calls: NormalizedCall[];
  leads: NormalizedLead[];
  quotes: NormalizedQuote[];
  policies: DemoPolicy[];
  scoredCalls: DemoScoredCall[];
}

/**
 * Random business-hours timestamp `daysAgo` days back. The anchor is an
 * exclusive end-of-window instant (next UTC midnight), so day 0 = the day
 * ending at the anchor, i.e. "today".
 */
function businessTime(rng: Rng, anchor: Date, daysAgo: number): Date {
  const day = new Date(anchor.getTime() - (daysAgo + 1) * DAY_MS);
  day.setUTCHours(13 + Math.floor(rng() * 9), Math.floor(rng() * 60), Math.floor(rng() * 60), 0);
  return day;
}

function storyTime(anchor: Date, daysAgo: number, hourUtc: number, minuteUtc: number): Date {
  const day = new Date(anchor.getTime() - (daysAgo + 1) * DAY_MS);
  day.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return day;
}

const STANDARD_CONTACTS = CONTACTS.slice(0, -8);

/** Squaring the draw heavily reuses early contacts while retaining a long tail. */
function pickContact(rng: Rng): ContactFixture {
  const index = Math.floor(rng() ** 2 * STANDARD_CONTACTS.length);
  return STANDARD_CONTACTS[index] ?? STANDARD_CONTACTS[0]!;
}

function contactFields(direction: "Inbound" | "Outbound", contact: ContactFixture) {
  return {
    fromNumber: direction === "Outbound" ? "+15550100" : contact.phone,
    toNumber: direction === "Outbound" ? contact.phone : "+15550100",
    contactName: contact.name,
    counterpartyNumber: contact.phone,
  };
}

function householdName(azLeadId: string): string {
  const index = Math.max(0, Number(azLeadId) - 50_000);
  if (index < HOUSEHOLD_NAMES.length) return HOUSEHOLD_NAMES[index]!;
  const contact = STANDARD_CONTACTS[index % STANDARD_CONTACTS.length] ?? STANDARD_CONTACTS[0]!;
  const surname = contact.name.split(/\s+/).at(-1) ?? "Sample";
  return `${surname} Household`;
}

/** Per-day weights over a 30-day window: weekdays busy, weekends quiet. */
function dayWeights(rng: Rng, anchor: Date, offsetDays: number): number[] {
  const weights: number[] = [];
  for (let d = 0; d < 30; d++) {
    const date = new Date(anchor.getTime() - (offsetDays + d + 1) * DAY_MS);
    const dow = date.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    weights.push((weekend ? 0.55 : 1) * (0.85 + rng() * 0.3));
  }
  return weights;
}

/** Integer durations that sum exactly to totalSeconds, varied around the mean. */
function durations(rng: Rng, count: number, totalSeconds: number): number[] {
  if (count <= 0) return [];
  const weights = Array.from({ length: count }, () => 0.3 + rng() * 1.4);
  return distributeInt(totalSeconds, weights);
}

/** Scores with an exact sum, spread around the mean, clamped to [3, 100]. */
function scoresWithMean(rng: Rng, count: number, targetSum: number): number[] {
  if (count <= 0) return [];
  const scores = Array.from({ length: count }, () => {
    const mean = targetSum / count;
    return Math.round(Math.min(100, Math.max(3, mean + (rng() - 0.5) * 30)));
  });
  let drift = targetSum - scores.reduce((s, v) => s + v, 0);
  let i = 0;
  while (drift !== 0 && i < 10_000) {
    const idx = i % count;
    const cur = scores[idx] ?? 0;
    if (drift > 0 && cur < 100) {
      scores[idx] = cur + 1;
      drift--;
    } else if (drift < 0 && cur > 3) {
      scores[idx] = cur - 1;
      drift++;
    }
    i++;
  }
  return scores;
}

/** Plausible rubric pattern for a generated score. Quote is almost always presented. */
function stepsForScore(rng: Rng, score: number): RubricSteps {
  return {
    rapport: rng() < score / 100 + 0.15,
    discovery: rng() < (score >= 55 ? 0.9 : 0.2),
    quote: rng() < 0.95,
    objection: rng() < (score >= 70 ? 0.85 : 0.15),
    close: rng() < (score >= 65 ? 0.85 : 0.3),
  };
}

export function generateDemoDataset(anchor: Date): DemoDataset {
  const rng = mulberry32(DEMO_SEED);
  const calls: NormalizedCall[] = [];
  const leads: NormalizedLead[] = [];
  const quotes: NormalizedQuote[] = [];
  const policies: DemoPolicy[] = [];
  const scoredCalls: DemoScoredCall[] = [];

  let leadSeq = 50_000;
  let quoteSeq = 80_000;

  const pushCall = (c: NormalizedCall) => calls.push(c);

  for (const producer of PRODUCERS) {
    const scripted = SCRIPTED_CALLS.filter((s) => s.producerKey === producer.key);
    const firstName = producer.displayName.split(" ")[0] ?? producer.displayName;

    // Two windows: 0 = current (last 30 days), 1 = prior (days 30-60).
    for (const windowIdx of [0, 1] as const) {
      const targets = windowIdx === 0 ? producer.current : producer.prior;
      const offsetDays = windowIdx * 30;
      const windowScripted = windowIdx === 0 ? scripted : [];
      const windowStories = CONVERSATION_STORY_CALLS.filter(
        (story) =>
          story.producerKey === producer.key &&
          story.daysAgo >= offsetDays &&
          story.daysAgo < offsetDays + 30,
      );

      // --- Scored calls -------------------------------------------------
      // Roughly 6% of calls get recorded + scored, capped for sanity.
      const scoredTotal = Math.min(30, Math.max(8, Math.round(targets.calls * 0.06)));
      const extraScoredCount = Math.max(0, scoredTotal - windowScripted.length);
      const scriptedScoreSum = windowScripted.reduce((s, c) => s + c.score, 0);
      const extraScoreSum = Math.max(0, targets.processScore * scoredTotal - scriptedScoreSum);
      const extraScores = scoresWithMean(rng, extraScoredCount, extraScoreSum);

      let talkBudget = targets.talkMinutes * 60;

      // Scripted calls become real call rows at their mockup day offsets.
      for (const sc of windowScripted) {
        const startTime = businessTime(rng, anchor, sc.daysAgo + offsetDays);
        const rcSessionId = `demo-rc-${sc.id}`;
        talkBudget -= sc.durationSeconds;
        const direction = rng() < 0.55 ? "Outbound" : "Inbound";
        const contact = pickContact(rng);
        pushCall({
          rcSessionId,
          rcExtensionId: producer.rcExtensionId,
          direction,
          startTime,
          durationSeconds: sc.durationSeconds,
          result: "Call connected",
          ...contactFields(direction, contact),
          hasRecording: true,
          recordingContentUri: `demo://recording/${rcSessionId}`,
          raw: { demo: true, scripted: sc.id },
        });
        const transcript = SCRIPTED_TRANSCRIPTS[sc.id];
        scoredCalls.push({
          rcSessionId,
          producerKey: producer.key,
          score: sc.score,
          steps: sc.steps,
          summary: sc.summary,
          transcript: transcript ?? generateTranscript(rng, firstName, sc.steps),
        });
      }

      // Generated scored calls: recorded, 3-10 minutes.
      const extraScoredDurations = extraScores.map(() => 180 + Math.floor(rng() * 420));
      extraScores.forEach((score, i) => {
        const durationSeconds = extraScoredDurations[i] ?? 300;
        const daysAgo = offsetDays + Math.floor(rng() * 30);
        const rcSessionId = `demo-rc-${producer.key}-w${windowIdx}-s${i}`;
        const steps = stepsForScore(rng, score);
        talkBudget -= durationSeconds;
        const direction = rng() < 0.55 ? "Outbound" : "Inbound";
        const contact = pickContact(rng);
        pushCall({
          rcSessionId,
          rcExtensionId: producer.rcExtensionId,
          direction,
          startTime: businessTime(rng, anchor, daysAgo),
          durationSeconds,
          result: "Call connected",
          ...contactFields(direction, contact),
          hasRecording: true,
          recordingContentUri: `demo://recording/${rcSessionId}`,
          raw: { demo: true },
        });
        scoredCalls.push({
          rcSessionId,
          producerKey: producer.key,
          score,
          steps,
          summary: generateSummary(rng, steps),
          transcript: generateTranscript(rng, firstName, steps),
        });
      });

      // Hand-placed, unscored calls make the Calls page tell the same stories
      // as the mockup without changing any producer's call/talk-time budget.
      for (const story of windowStories) {
        talkBudget -= story.durationSeconds;
        pushCall({
          rcSessionId: `demo-rc-conversation-${story.id}`,
          rcExtensionId: producer.rcExtensionId,
          direction: story.direction,
          startTime: storyTime(anchor, story.daysAgo, story.hourUtc, story.minuteUtc),
          durationSeconds: story.durationSeconds,
          result: "Call connected",
          ...contactFields(story.direction, story.contact),
          hasRecording: false,
          recordingContentUri: null,
          raw: { demo: true, conversationStory: story.id },
        });
      }

      // --- Plain (unscored) calls ---------------------------------------
      const plainCount = Math.max(
        0,
        targets.calls - windowScripted.length - extraScores.length - windowStories.length,
      );
      const perDay = distributeInt(plainCount, dayWeights(rng, anchor, offsetDays));
      const plainDurations = durations(rng, plainCount, Math.max(plainCount * 30, talkBudget));
      let di = 0;
      perDay.forEach((n, day) => {
        for (let i = 0; i < n; i++) {
          const durationSeconds = plainDurations[di] ?? 60;
          const inbound = rng() < 0.45;
          const direction = inbound ? "Inbound" : "Outbound";
          const contact = pickContact(rng);
          // Label very short calls as missed, but keep their (small) duration
          // so per-producer talk-time totals stay exact.
          const missed = inbound && durationSeconds < 40 && rng() < 0.5;
          const outboundResult = !inbound ? rng() : 1;
          pushCall({
            rcSessionId: `demo-rc-${producer.key}-w${windowIdx}-c${di}`,
            rcExtensionId: producer.rcExtensionId,
            direction,
            startTime: businessTime(rng, anchor, offsetDays + day),
            durationSeconds,
            result: missed
              ? "Missed"
              : outboundResult < 0.25
                ? "Voicemail"
                : outboundResult < 0.35
                  ? "No Answer"
                  : "Call connected",
            ...contactFields(direction, contact),
            hasRecording: false,
            recordingContentUri: null,
            raw: { demo: true },
          });
          di++;
        }
      });

      // --- Leads, quotes, sold policies ---------------------------------
      const quoteDays = distributeInt(targets.quotes, dayWeights(rng, anchor, offsetDays));
      const producerQuoteLeads: { azLeadId: string; quotedAt: Date; productLine: string }[] = [];
      quoteDays.forEach((n, day) => {
        for (let i = 0; i < n; i++) {
          const azLeadId = String(leadSeq++);
          const azQuoteId = String(quoteSeq++);
          const quotedAt = businessTime(rng, anchor, offsetDays + day);
          const createDate = new Date(quotedAt.getTime() - (1 + Math.floor(rng() * 5)) * DAY_MS);
          const productLine = pickWeighted(rng, PRODUCT_LINES, PRODUCT_LINE_WEIGHTS);
          const premiumCents = (600 + Math.floor(rng() * 2400)) * 100;
          leads.push({
            azLeadId,
            azProducerId: producer.azProducerId,
            contactName: householdName(azLeadId),
            statusCode: 1,
            status: "quoted",
            source: pickWeighted(rng, LEAD_SOURCES, [0.35, 0.25, 0.2, 0.1, 0.1]),
            createDate,
            contactDate: createDate,
            quoteDate: quotedAt,
            soldDate: null,
            lastActivityDate: quotedAt,
            quotedPremiumCents: premiumCents,
            soldPremiumCents: null,
            raw: { demo: true },
          });
          quotes.push({
            azQuoteId,
            azLeadId,
            productLine,
            carrier: CARRIERS[Math.floor(rng() * CARRIERS.length)] ?? "Progressive",
            premiumCents,
            sold: false,
            effectiveDate: null,
            raw: { demo: true },
          });
          producerQuoteLeads.push({ azLeadId, quotedAt, productLine });
        }
      });

      // Extra never-quoted leads (~18% on top) for realistic pipeline noise.
      const extraLeads = Math.round(targets.quotes * 0.18);
      for (let i = 0; i < extraLeads; i++) {
        const azLeadId = String(leadSeq++);
        const createDate = businessTime(rng, anchor, offsetDays + Math.floor(rng() * 30));
        const statusCode = pickWeighted(rng, [0, 4, 3], [0.4, 0.35, 0.25]);
        leads.push({
          azLeadId,
          azProducerId: producer.azProducerId,
          contactName: householdName(azLeadId),
          statusCode,
          status: statusCode === 0 ? "new" : statusCode === 4 ? "contacted" : "lost",
          source: pickWeighted(rng, LEAD_SOURCES, [0.35, 0.25, 0.2, 0.1, 0.1]),
          createDate,
          contactDate: statusCode === 4 ? createDate : null,
          quoteDate: null,
          soldDate: null,
          lastActivityDate: createDate,
          quotedPremiumCents: null,
          soldPremiumCents: null,
          raw: { demo: true },
        });
      }

      // Sold policies: pick quoted leads, distribute the premium target exactly.
      const soldCount = Math.min(targets.policies, producerQuoteLeads.length);
      const premiumParts = distributeInt(
        targets.premiumDollars,
        Array.from({ length: soldCount }, () => 0.6 + rng() * 1.4),
      );
      for (let i = 0; i < soldCount; i++) {
        // Spread sold picks across the window rather than clustering.
        const pickIdx = Math.floor((i / soldCount) * producerQuoteLeads.length);
        const sold = producerQuoteLeads[pickIdx] ?? producerQuoteLeads[i];
        if (!sold) continue;
        const premiumCents = (premiumParts[i] ?? 0) * 100;
        // Sold 0-6 days after the quote, clamped inside the window.
        const soldTime = Math.min(
          sold.quotedAt.getTime() + Math.floor(rng() * 6) * DAY_MS,
          anchor.getTime() - offsetDays * DAY_MS - 1,
        );
        const soldDate = new Date(soldTime);
        const lead = leads.find((l) => l.azLeadId === sold.azLeadId);
        if (lead) {
          lead.statusCode = 2;
          lead.status = "won";
          lead.soldDate = soldDate;
          lead.soldPremiumCents = premiumCents;
          lead.lastActivityDate = soldDate;
        }
        const quote = quotes.find((q) => q.azLeadId === sold.azLeadId);
        if (quote) {
          quote.sold = true;
          quote.premiumCents = premiumCents;
        }
        policies.push({
          azLeadId: sold.azLeadId,
          azProducerId: producer.azProducerId,
          productLine: sold.productLine,
          premiumCents,
          soldDate,
          effectiveDate: new Date(soldDate.getTime() + 7 * DAY_MS),
        });
      }
    }
  }

  // --- Unmapped-extension calls (outside both KPI windows) ------------------
  // A shared office line no identity mapping covers; visible in Settings.
  for (let i = 0; i < 9; i++) {
    const daysAgo = 65 + Math.floor(rng() * 15);
    const direction = rng() < 0.5 ? "Inbound" : "Outbound";
    const contact = pickContact(rng);
    pushCall({
      rcSessionId: `demo-rc-office-${i}`,
      rcExtensionId: "199",
      direction,
      startTime: businessTime(rng, anchor, daysAgo),
      durationSeconds: 60 + Math.floor(rng() * 400),
      result: "Call connected",
      ...contactFields(direction, contact),
      hasRecording: false,
      recordingContentUri: null,
      raw: { demo: true, note: "shared office line" },
    });
  }

  // --- Historical month top-ups for the 6-month premium chart ---------------
  // Months anchorMonth-5 .. anchorMonth-1 get fill policies (dated before the
  // 60-day KPI window) so each calendar month's total approaches the mockup.
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const seededByMonth = new Map<string, number>();
  for (const p of policies) {
    const k = monthKey(p.soldDate);
    seededByMonth.set(k, (seededByMonth.get(k) ?? 0) + p.premiumCents);
  }
  const windowStart = new Date(anchor.getTime() - 60 * DAY_MS);
  const premiumShareWeights = PRODUCERS.map((p) => p.current.premiumDollars);

  MONTHLY_PREMIUM_TARGETS_DOLLARS.forEach((targetDollars, idx) => {
    const monthsBack = MONTHLY_PREMIUM_TARGETS_DOLLARS.length - idx; // 5 .. 1
    const month = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - monthsBack, 1));
    const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    // Only days strictly before the KPI windows are fair game for fills.
    const fillableDays: Date[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), d, 16, 0, 0));
      if (day < windowStart) fillableDays.push(day);
    }
    if (fillableDays.length === 0) return;
    const existing = (seededByMonth.get(monthKey(month)) ?? 0) / 100;
    const fillDollars = targetDollars - existing;
    if (fillDollars < 1000) return;
    const fillCount = Math.max(3, Math.round(fillDollars / 2800));
    const parts = distributeInt(fillDollars, Array.from({ length: fillCount }, () => 0.6 + rng() * 1.4));
    const producerIdx = distributeInt(fillCount, premiumShareWeights);
    let pi = 0;
    producerIdx.forEach((countForProducer, pIdx) => {
      const producer = PRODUCERS[pIdx];
      if (!producer) return;
      for (let j = 0; j < countForProducer; j++) {
        const azLeadId = String(leadSeq++);
        const day = fillableDays[Math.floor(rng() * fillableDays.length)] ?? fillableDays[0];
        if (!day) continue;
        const premiumCents = (parts[pi++] ?? 0) * 100;
        if (premiumCents <= 0) continue;
        const quotedAt = new Date(day.getTime() - (2 + Math.floor(rng() * 7)) * DAY_MS);
        const productLine = pickWeighted(rng, PRODUCT_LINES, PRODUCT_LINE_WEIGHTS);
        leads.push({
          azLeadId,
          azProducerId: producer.azProducerId,
          contactName: householdName(azLeadId),
          statusCode: 2,
          status: "won",
          source: pickWeighted(rng, LEAD_SOURCES, [0.35, 0.25, 0.2, 0.1, 0.1]),
          createDate: new Date(quotedAt.getTime() - 3 * DAY_MS),
          contactDate: quotedAt,
          quoteDate: quotedAt,
          soldDate: day,
          lastActivityDate: day,
          quotedPremiumCents: premiumCents,
          soldPremiumCents: premiumCents,
          raw: { demo: true, fill: true },
        });
        quotes.push({
          azQuoteId: String(quoteSeq++),
          azLeadId,
          productLine,
          carrier: CARRIERS[Math.floor(rng() * CARRIERS.length)] ?? "Progressive",
          premiumCents,
          sold: true,
          effectiveDate: new Date(day.getTime() + 7 * DAY_MS),
          raw: { demo: true, fill: true },
        });
        policies.push({
          azLeadId,
          azProducerId: producer.azProducerId,
          productLine,
          premiumCents,
          soldDate: day,
          effectiveDate: new Date(day.getTime() + 7 * DAY_MS),
        });
      }
    });
  });

  return { producers: PRODUCERS, calls, leads, quotes, policies, scoredCalls };
}

// ---------------------------------------------------------------------------
// Demo daily summary (used by the seed and the demo Regenerate action).
// Mirrors the mockup's rotating variants.
// ---------------------------------------------------------------------------

export type DemoSummaryStats = SummaryStats;
export type DemoInsight = SummaryInsight;

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtMin = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;

export function buildDemoSummary(
  stats: DemoSummaryStats,
  variant: number,
): { summaryText: string; insights: DemoInsight[] } {
  const byPremium = [...stats.producers].sort((a, b) => b.premiumDollars - a.premiumDollars);
  const byScore = [...stats.producers].sort((a, b) => a.processScore - b.processScore);
  const top = byPremium[0];
  const coaching = byScore[0];
  const secondLowest = byScore[1];
  const ramping = stats.producers.find((p) => p.isRamping) ?? byScore[Math.floor(byScore.length / 2)];
  if (!top || !coaching || !ramping) {
    return { summaryText: "Not enough producer data to generate a summary yet.", insights: [] };
  }
  const first = (name: string) => name.split(" ")[0] ?? name;

  const base =
    `Over the last 30 days the team logged ${stats.totalCalls.toLocaleString("en-US")} calls totaling ` +
    `${fmtMin(stats.talkMinutes)} of talk time, generating ${stats.quotes.toLocaleString("en-US")} quotes and closing ` +
    `${stats.policies.toLocaleString("en-US")} policies for ${fmtMoney(stats.premiumDollars)} in written premium — a ` +
    `${stats.closeRatePct.toFixed(1)}% close rate, ${stats.closeRateDeltaPts >= 0 ? "up" : "down"} ` +
    `${Math.abs(stats.closeRateDeltaPts).toFixed(1)} points from the prior period. `;

  const variants = [
    base +
      `${first(top.name)} leads the team with a ${top.processScore}% sales process score and a ${top.closeRatePct.toFixed(1)}% close rate, ` +
      `while ${first(coaching.name)}'s ${coaching.processScore}% process score lines up with the team's lowest close rate — the same pattern holds ` +
      `across every producer. Pairing ${first(coaching.name)} with ${first(top.name)} for call shadowing is the highest-leverage next step.`,
    base +
      `Reps who complete all five steps of the sales process are converting at a far higher rate than those who skip discovery or objection ` +
      `handling: ${first(top.name)}'s ${top.processScore}% adherence score tracks a ${top.closeRatePct.toFixed(1)}% close rate, while high call ` +
      `volume alone hasn't translated to sales for producers who rush straight to quoting. Process adherence, not activity, is the clearer ` +
      `lever on this team right now.`,
    base +
      `${first(ramping.name)} is trending the right direction — process score up from ${ramping.prevProcessScore ?? "—"}% to ` +
      `${ramping.processScore}% over the last two periods, with close rate improving alongside it. That trajectory suggests recent coaching is ` +
      `working; extending the same approach to ${first(coaching.name)}${secondLowest ? ` and ${first(secondLowest.name)}` : ""}, still below a ` +
      `50% process score, is where the next gains are likely to come from.`,
  ];

  const insights: DemoInsight[] = [
    {
      producer: top.name,
      text: `${top.name} leads the last 30 days — ${fmtMoney(top.premiumDollars)} written at a ${top.closeRatePct.toFixed(1)}% close rate.`,
      tone: "good",
    },
    {
      producer: coaching.name,
      text: `${coaching.name} is the clearest coaching case — ${coaching.processScore}% process score and the team's lowest close rate at ${coaching.closeRatePct.toFixed(1)}%.`,
      tone: "warning",
    },
    {
      producer: ramping.name,
      text:
        ramping.prevProcessScore != null
          ? `${ramping.name} is ramping well — process score up ${ramping.processScore - ramping.prevProcessScore} points period over period, with close rate following.`
          : `${ramping.name} is trending upward on process score period over period.`,
      tone: "info",
    },
  ];

  return { summaryText: variants[variant % variants.length] ?? variants[0]!, insights };
}
