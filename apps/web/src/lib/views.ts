// Serialized view models crossing the server → client component boundary.

export interface KpiView {
  key: "calls" | "talk" | "quotes" | "policies" | "premium" | "close";
  label: string;
  value: string;
  /** Percent (or points, for close rate) vs the prior period; null = no prior data. */
  deltaPct: number | null;
  /** Sparkline values; omitted for the close-rate meter tile. */
  spark?: number[];
  /** Meter fill percent (close-rate tile). */
  meterPct?: number;
  color: string;
}

export interface ProducerRowView {
  id: string;
  displayName: string;
  firstName: string;
  roleTitle: string;
  initials: string;
  badgeLabel: string;
  badgeTone: "good" | "neutral" | "ramping" | "warning" | "critical";
  calls: number;
  talkMinutes: number;
  processScore: number | null;
  quotes: number;
  policies: number;
  premiumDollars: number;
  closeRatePct: number | null;
}

export interface TrendDayView {
  day: string;
  calls: number;
  quotes: number;
}

export interface PremiumMonthView {
  label: string;
  premiumDollars: number;
  isCurrent: boolean;
}

export interface SummaryView {
  summaryText: string;
  insights: { producer: string; text: string; tone: "good" | "warning" | "info" }[];
  generatedAtIso: string;
  model: string;
}

export interface ScoredCallView {
  callId: string;
  startTime: string;
  durationSeconds: number;
  score: number;
  summary: string;
  steps: { rapport: boolean; discovery: boolean; quote: boolean; objection: boolean; close: boolean };
}
