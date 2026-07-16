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

export interface ContactFixture {
  name: string;
  phone: string;
}

/**
 * Deterministic caller pool. The generator draws heavily from the front of
 * this list so the same prospects recur, while the final eight entries are
 * reserved for the hand-placed Calls-page stories below.
 */
export const CONTACTS: ContactFixture[] = [
  { name: "Maya Alvarez", phone: "+15552000001" },
  { name: "Daniel Whitmore", phone: "+15552000002" },
  { name: "Sofia Chen-Ortiz", phone: "+15552000003" },
  { name: "Elliot Bregman", phone: "+15552000004" },
  { name: "Amara Okafor", phone: "+15552000005" },
  { name: "Lucia Delacroix-Reyes", phone: "+15552000006" },
  { name: "Jordan Bennett", phone: "+15552000007" },
  { name: "Naomi Carter", phone: "+15552000008" },
  { name: "Theo Davidson", phone: "+15552000009" },
  { name: "Iris Edwards", phone: "+15552000010" },
  { name: "Caleb Foster", phone: "+15552000011" },
  { name: "Leila Green", phone: "+15552000012" },
  { name: "Miles Hassan", phone: "+15552000013" },
  { name: "Anika Ito", phone: "+15552000014" },
  { name: "Owen Jackson", phone: "+15552000015" },
  { name: "Fatima Khan", phone: "+15552000016" },
  { name: "Jonah Laurent", phone: "+15552000017" },
  { name: "Carmen Morales", phone: "+15552000018" },
  { name: "Ravi Nair", phone: "+15552000019" },
  { name: "Mia O'Connell", phone: "+15552000020" },
  { name: "Andre Park", phone: "+15552000021" },
  { name: "Zara Qureshi", phone: "+15552000022" },
  { name: "Leo Ramirez", phone: "+15552000023" },
  { name: "Nina Svensson", phone: "+15552000024" },
  { name: "Arjun Talwar", phone: "+15552000025" },
  { name: "Clara Usman", phone: "+15552000026" },
  { name: "Mateo Vega", phone: "+15552000027" },
  { name: "Hana Watanabe", phone: "+15552000028" },
  { name: "Isaac Young", phone: "+15552000029" },
  { name: "Layla Zimmerman", phone: "+15552000030" },
  { name: "Avery Brooks", phone: "+15552000031" },
  { name: "Simon Clarke", phone: "+15552000032" },
  { name: "Keira Dominguez", phone: "+15552000033" },
  { name: "Malcolm Evans", phone: "+15552000034" },
  { name: "Talia Freeman", phone: "+15552000035" },
  { name: "Noah Gupta", phone: "+15552000036" },
  { name: "Elise Hoffman", phone: "+15552000037" },
  { name: "Darius Ibrahim", phone: "+15552000038" },
  { name: "Maeve Jensen", phone: "+15552000039" },
  { name: "Nico Kim", phone: "+15552000040" },
  { name: "Alina Lopez", phone: "+15552000041" },
  { name: "Grant Mitchell", phone: "+15552000042" },
  { name: "Priya Narang", phone: "+15552000043" },
  { name: "Felix Owens", phone: "+15552000044" },
  { name: "Mei Patel", phone: "+15552000045" },
  { name: "Hugo Rivera", phone: "+15552000046" },
  { name: "Lena Schmidt", phone: "+15552000047" },
  { name: "Wesley Thompson", phone: "+15552000048" },
  { name: "Sana Ullah", phone: "+15552000049" },
  { name: "Victor Valdez", phone: "+15552000050" },
  { name: "Amina Walker", phone: "+15552000051" },
  { name: "Xavier Xu", phone: "+15552000052" },
  { name: "Yara Youssef", phone: "+15552000053" },
  { name: "Zane Abbott", phone: "+15552000054" },
  { name: "Bianca Flores", phone: "+15552000055" },
  { name: "Cedric Grant", phone: "+15552000056" },
  { name: "Dahlia Hayes", phone: "+15552000057" },
  { name: "Emmett Inoue", phone: "+15552000058" },
  { name: "Freya James", phone: "+15552000059" },
  { name: "Gideon Knox", phone: "+15552000060" },
  { name: "Helena Martin", phone: "+15552000061" },
  { name: "Idris Novak", phone: "+15552000062" },
  { name: "Juno Price", phone: "+15552000063" },
  { name: "Kellan Ross", phone: "+15552000064" },
  { name: "Lila Singh", phone: "+15552000065" },
  { name: "Micah Turner", phone: "+15552000066" },
  { name: "Nadia Vasquez", phone: "+15552000067" },
  { name: "Orson Williams", phone: "+15552000068" },
  { name: "Pia Yamamoto", phone: "+15552000069" },
  { name: "Quinn Zoric", phone: "+15552000070" },
  { name: "Rosa Acosta", phone: "+15552000071" },
  { name: "Stefan Bell", phone: "+15552000072" },
  { name: "Grace Whitfield", phone: "+15552900001" },
  { name: "Marcus Doyle", phone: "+15552900002" },
  { name: "Elena Petrov", phone: "+15552900003" },
  { name: "Harold Jennings", phone: "+15552900004" },
  { name: "Sam Okonkwo", phone: "+15552900005" },
  { name: "Priya Deshmukh", phone: "+15552900006" },
  { name: "Ben Locke", phone: "+15552900007" },
  { name: "Nora Fitzgerald", phone: "+15552900008" },
];

export interface ConversationStoryCall {
  id: string;
  producerKey: ProducerKey;
  contact: ContactFixture;
  daysAgo: number;
  hourUtc: number;
  minuteUtc: number;
  durationSeconds: number;
  direction: "Inbound" | "Outbound";
}

const storyContact = (name: string) => CONTACTS.find((contact) => contact.name === name)!;

/** Calls that guarantee the demo page has the mockup's qualify/skip mix. */
export const CONVERSATION_STORY_CALLS: ConversationStoryCall[] = [
  { id: "grace-first", producerKey: "priya", contact: storyContact("Grace Whitfield"), daysAgo: 0, hourUtc: 13, minuteUtc: 12, durationSeconds: 872, direction: "Outbound" },
  { id: "priya-first", producerKey: "tomas", contact: storyContact("Priya Deshmukh"), daysAgo: 1, hourUtc: 16, minuteUtc: 35, durationSeconds: 965, direction: "Inbound" },
  { id: "marcus-prior", producerKey: "devon", contact: storyContact("Marcus Doyle"), daysAgo: 45, hourUtc: 15, minuteUtc: 0, durationSeconds: 180, direction: "Inbound" },
  { id: "marcus-return", producerKey: "devon", contact: storyContact("Marcus Doyle"), daysAgo: 0, hourUtc: 14, minuteUtc: 40, durationSeconds: 725, direction: "Outbound" },
  { id: "elena-first", producerKey: "aisha", contact: storyContact("Elena Petrov"), daysAgo: 1, hourUtc: 19, minuteUtc: 5, durationSeconds: 1330, direction: "Inbound" },
  { id: "harold-prior", producerKey: "marcus", contact: storyContact("Harold Jennings"), daysAgo: 48, hourUtc: 16, minuteUtc: 20, durationSeconds: 200, direction: "Outbound" },
  { id: "harold-return", producerKey: "marcus", contact: storyContact("Harold Jennings"), daysAgo: 0, hourUtc: 17, minuteUtc: 22, durationSeconds: 708, direction: "Outbound" },
  { id: "sam-short", producerKey: "priya", contact: storyContact("Sam Okonkwo"), daysAgo: 0, hourUtc: 15, minuteUtc: 5, durationSeconds: 520, direction: "Outbound" },
  { id: "ben-short", producerKey: "tomas", contact: storyContact("Ben Locke"), daysAgo: 0, hourUtc: 12, minuteUtc: 50, durationSeconds: 372, direction: "Outbound" },
  { id: "nora-prior", producerKey: "aisha", contact: storyContact("Nora Fitzgerald"), daysAgo: 6, hourUtc: 18, minuteUtc: 0, durationSeconds: 240, direction: "Inbound" },
  { id: "nora-recent", producerKey: "aisha", contact: storyContact("Nora Fitzgerald"), daysAgo: 1, hourUtc: 20, minuteUtc: 30, durationSeconds: 1124, direction: "Outbound" },
];

export const HOUSEHOLD_NAMES = [
  "The Alvarez Family",
  "Whitmore Household",
  "Chen-Ortiz Family",
  "Bregman Household",
  "Okafor Family",
  "Delacroix-Reyes Household",
  "Bennett Household",
  "The Carter Family",
  "Davidson Household",
  "Edwards Family",
  "Foster Household",
  "The Green Family",
  "Hassan Household",
  "Ito Family",
  "Jackson Household",
  "The Khan Family",
] as const;

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
