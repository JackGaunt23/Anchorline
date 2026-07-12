// Demo fixture definitions. Numbers are lifted from the sold mockup
// (anchorline-mockup.html) so the seeded demo reproduces it closely:
// 1,755 calls / 10,870 talk minutes / 481 quotes / 70 policies / $187,600.

export interface RubricSteps {
  rapport: boolean;
  discovery: boolean;
  quote: boolean;
  objection: boolean;
  close: boolean;
}

export interface ScriptedCall {
  /** Stable id; also keys the handwritten transcript. */
  id: string;
  producerKey: ProducerKey;
  /** Days before the anchor date (mockup dates were relative to 2026-07-08). */
  daysAgo: number;
  durationSeconds: number;
  score: number;
  summary: string;
  steps: RubricSteps;
}

export type ProducerKey = "priya" | "devon" | "aisha" | "marcus" | "tomas";

export interface ProducerFixture {
  key: ProducerKey;
  displayName: string;
  roleTitle: string;
  rcExtensionId: string;
  azProducerId: string;
  isRamping: boolean;
  /** Current 30-day window targets (exact). */
  current: PeriodTargets;
  /** Prior 30-day window targets (drive the period-over-period deltas). */
  prior: PeriodTargets;
}

export interface PeriodTargets {
  calls: number;
  talkMinutes: number;
  /** Mean sales-process score for scored calls in the window. */
  processScore: number;
  quotes: number;
  policies: number;
  premiumDollars: number;
}

/**
 * Global mockup deltas (current vs prior period): calls +8.4%, talk +5.1%,
 * quotes +11.2%, policies +14.6%, premium +17.3%. Prior targets below are
 * current / (1 + delta), rounded, applied per producer.
 */
const DELTAS = { calls: 1.084, talk: 1.051, quotes: 1.112, policies: 1.146, premium: 1.173 };

function prior(current: PeriodTargets, processScore: number): PeriodTargets {
  return {
    calls: Math.round(current.calls / DELTAS.calls),
    talkMinutes: Math.round(current.talkMinutes / DELTAS.talk),
    processScore,
    quotes: Math.round(current.quotes / DELTAS.quotes),
    policies: Math.round(current.policies / DELTAS.policies),
    premiumDollars: Math.round(current.premiumDollars / DELTAS.premium),
  };
}

export const PRODUCERS: ProducerFixture[] = [
  {
    key: "priya",
    displayName: "Priya Nandakumar",
    roleTitle: "Senior Producer",
    rcExtensionId: "101",
    azProducerId: "9001",
    isRamping: false,
    current: { calls: 336, talkMinutes: 2570, processScore: 94, quotes: 112, policies: 26, premiumDollars: 79400 },
    prior: prior(
      { calls: 336, talkMinutes: 2570, processScore: 94, quotes: 112, policies: 26, premiumDollars: 79400 },
      92,
    ),
  },
  {
    key: "devon",
    displayName: "Devon Whitfield",
    roleTitle: "Producer",
    rcExtensionId: "102",
    azProducerId: "9002",
    isRamping: false,
    current: { calls: 412, talkMinutes: 2860, processScore: 67, quotes: 121, policies: 19, premiumDollars: 47600 },
    prior: prior(
      { calls: 412, talkMinutes: 2860, processScore: 67, quotes: 121, policies: 19, premiumDollars: 47600 },
      66,
    ),
  },
  {
    key: "aisha",
    displayName: "Aisha Coleman",
    roleTitle: "Producer · ramping",
    rcExtensionId: "103",
    azProducerId: "9003",
    isRamping: true,
    current: { calls: 188, talkMinutes: 1240, processScore: 61, quotes: 54, policies: 8, premiumDollars: 22900 },
    // Mockup: Aisha's process score climbed from 49 to 61 period over period.
    prior: prior(
      { calls: 188, talkMinutes: 1240, processScore: 61, quotes: 54, policies: 8, premiumDollars: 22900 },
      49,
    ),
  },
  {
    key: "marcus",
    displayName: "Marcus Ferreira",
    roleTitle: "Producer",
    rcExtensionId: "104",
    azProducerId: "9004",
    isRamping: false,
    current: { calls: 618, talkMinutes: 3120, processScore: 41, quotes: 148, policies: 13, premiumDollars: 21800 },
    prior: prior(
      { calls: 618, talkMinutes: 3120, processScore: 41, quotes: 148, policies: 13, premiumDollars: 21800 },
      43,
    ),
  },
  {
    key: "tomas",
    displayName: "Tomas Berglund",
    roleTitle: "Producer",
    rcExtensionId: "105",
    azProducerId: "9005",
    isRamping: false,
    current: { calls: 201, talkMinutes: 1080, processScore: 34, quotes: 46, policies: 4, premiumDollars: 15900 },
    prior: prior(
      { calls: 201, talkMinutes: 1080, processScore: 34, quotes: 46, policies: 4, premiumDollars: 15900 },
      35,
    ),
  },
];

/**
 * Monthly premium chart targets (mockup, oldest → newest). The final bar in
 * the mockup is the last-30-days total ($187,600) which the seeded windows
 * produce; the five earlier calendar months are topped up toward these.
 */
export const MONTHLY_PREMIUM_TARGETS_DOLLARS = [141200, 149800, 163400, 157900, 174300];

export const PRODUCT_LINES = ["Auto", "Home", "Renters", "Umbrella", "Life"] as const;
export const PRODUCT_LINE_WEIGHTS = [0.5, 0.3, 0.08, 0.07, 0.05];

export const CARRIERS = ["Progressive", "Travelers", "Safeco", "Nationwide", "Hartford"] as const;

export const LEAD_SOURCES = ["Web quote form", "Referral", "Google LSA", "Walk-in", "Renewal shop"] as const;

/**
 * The mockup's 20 scored calls, verbatim (dates were relative to the mockup's
 * "today", 2026-07-08 → stored as daysAgo offsets from the seed anchor).
 */
export const SCRIPTED_CALLS: ScriptedCall[] = [
  // ---- Marcus Ferreira (process gap) ----
  {
    id: "marcus-1",
    producerKey: "marcus",
    daysAgo: 1,
    durationSeconds: 252,
    score: 38,
    summary:
      "Jumped straight into pricing without asking about current coverage; caller seemed unsure why the quote skipped roadside assistance and asked for time to compare.",
    steps: { rapport: false, discovery: false, quote: true, objection: false, close: true },
  },
  {
    id: "marcus-2",
    producerKey: "marcus",
    daysAgo: 2,
    durationSeconds: 225,
    score: 32,
    summary:
      "Fast-paced call focused on price alone — no questions about driving history or bundling before quoting.",
    steps: { rapport: false, discovery: false, quote: true, objection: false, close: true },
  },
  {
    id: "marcus-3",
    producerKey: "marcus",
    daysAgo: 5,
    durationSeconds: 302,
    score: 45,
    summary:
      "Opened with a quick rapport check-in, then quoted before confirming coverage needs; a premium objection went unaddressed.",
    steps: { rapport: true, discovery: false, quote: true, objection: false, close: true },
  },
  {
    id: "marcus-4",
    producerKey: "marcus",
    daysAgo: 7,
    durationSeconds: 270,
    score: 25,
    summary:
      "Skipped discovery entirely and read off pricing tiers; caller disengaged and asked to be called back later.",
    steps: { rapport: false, discovery: false, quote: true, objection: false, close: false },
  },
  // ---- Priya Nandakumar (top performer) ----
  {
    id: "priya-1",
    producerKey: "priya",
    daysAgo: 0,
    durationSeconds: 550,
    score: 98,
    summary:
      "Genuine rapport-building up front, then a full needs assessment across auto and home before presenting a tailored bundle; handled a deductible objection smoothly and secured a verbal yes.",
    steps: { rapport: true, discovery: true, quote: true, objection: true, close: true },
  },
  {
    id: "priya-2",
    producerKey: "priya",
    daysAgo: 3,
    durationSeconds: 520,
    score: 95,
    summary:
      "Thorough discovery uncovered an underinsured umbrella gap; the quote addressed it directly and closed after a brief question about payment timing.",
    steps: { rapport: true, discovery: true, quote: true, objection: true, close: true },
  },
  {
    id: "priya-3",
    producerKey: "priya",
    daysAgo: 5,
    durationSeconds: 475,
    score: 93,
    summary:
      "Strong rapport and discovery; the quote matched stated needs closely, price hesitation was reframed around claims service, and the close landed.",
    steps: { rapport: true, discovery: true, quote: true, objection: true, close: true },
  },
  {
    id: "priya-4",
    producerKey: "priya",
    daysAgo: 8,
    durationSeconds: 410,
    score: 88,
    summary:
      "Solid process throughout — discovery ran a little short on liability limits but recovered during the quote walkthrough, objection handled well, close attempted successfully.",
    steps: { rapport: true, discovery: true, quote: true, objection: true, close: true },
  },
  // ---- Devon Whitfield (on pace) ----
  {
    id: "devon-1",
    producerKey: "devon",
    daysAgo: 1,
    durationSeconds: 380,
    score: 61,
    summary:
      "Good rapport opener and discovery on vehicle usage, then a standard auto quote; a price objection was not fully resolved and no close was attempted.",
    steps: { rapport: true, discovery: true, quote: true, objection: false, close: false },
  },
  {
    id: "devon-2",
    producerKey: "devon",
    daysAgo: 4,
    durationSeconds: 340,
    score: 70,
    summary:
      "Discovery covered the basics, quote presented, and a coverage-limit objection was handled reasonably well with a close attempt at the end.",
    steps: { rapport: false, discovery: true, quote: true, objection: true, close: true },
  },
  {
    id: "devon-3",
    producerKey: "devon",
    daysAgo: 6,
    durationSeconds: 365,
    score: 58,
    summary:
      "Rapport and discovery both solid, quote aligned to needs, but the call ended before addressing hesitation on premium.",
    steps: { rapport: true, discovery: true, quote: true, objection: false, close: false },
  },
  {
    id: "devon-4",
    producerKey: "devon",
    daysAgo: 9,
    durationSeconds: 430,
    score: 82,
    summary:
      "Full process followed — rapport, discovery, quote, objection handling, and a direct close attempt that landed.",
    steps: { rapport: true, discovery: true, quote: true, objection: true, close: true },
  },
  // ---- Aisha Coleman (ramping) ----
  {
    id: "aisha-1",
    producerKey: "aisha",
    daysAgo: 0,
    durationSeconds: 395,
    score: 79,
    summary:
      "Rapport and discovery both present, quote presented clearly, and handled a pricing objection using a talk track from recent training before attempting the close.",
    steps: { rapport: true, discovery: true, quote: true, objection: true, close: true },
  },
  {
    id: "aisha-2",
    producerKey: "aisha",
    daysAgo: 3,
    durationSeconds: 350,
    score: 64,
    summary:
      "Discovery questions surfaced a bundling opportunity and a clear quote followed; objection handling was tentative and no close was attempted.",
    steps: { rapport: true, discovery: true, quote: true, objection: false, close: false },
  },
  {
    id: "aisha-3",
    producerKey: "aisha",
    daysAgo: 10,
    durationSeconds: 255,
    score: 44,
    summary:
      "Jumped to quoting quickly without much discovery; the caller asked several coverage questions that went unanswered before the call ended.",
    steps: { rapport: true, discovery: false, quote: true, objection: false, close: false },
  },
  {
    id: "aisha-4",
    producerKey: "aisha",
    daysAgo: 14,
    durationSeconds: 230,
    score: 33,
    summary:
      "Rapport was brief, discovery was skipped, and the quote was read off without confirming fit; the call ended without an objection check or close.",
    steps: { rapport: false, discovery: false, quote: true, objection: false, close: false },
  },
  // ---- Tomas Berglund (needs coaching) ----
  {
    id: "tomas-1",
    producerKey: "tomas",
    daysAgo: 2,
    durationSeconds: 200,
    score: 28,
    summary:
      "Minimal rapport, no discovery questions asked; the quote presented was generic and the caller asked to shop around before deciding.",
    steps: { rapport: false, discovery: false, quote: true, objection: false, close: false },
  },
  {
    id: "tomas-2",
    producerKey: "tomas",
    daysAgo: 6,
    durationSeconds: 175,
    score: 24,
    summary:
      "Call moved quickly to pricing with little context gathered; hesitation about coverage gaps went unaddressed.",
    steps: { rapport: false, discovery: false, quote: true, objection: false, close: false },
  },
  {
    id: "tomas-3",
    producerKey: "tomas",
    daysAgo: 11,
    durationSeconds: 245,
    score: 35,
    summary:
      "A brief rapport check-in, but discovery was skipped and a premium objection was not handled before the call ended.",
    steps: { rapport: true, discovery: false, quote: true, objection: false, close: false },
  },
  {
    id: "tomas-4",
    producerKey: "tomas",
    daysAgo: 16,
    durationSeconds: 215,
    score: 18,
    summary:
      "No rapport-building, no discovery — the quote was read directly from the rate table with no close attempted.",
    steps: { rapport: false, discovery: false, quote: true, objection: false, close: false },
  },
];
