// Signal badge assignment. Documented rules (see PLAN.md §6):
//
// - Top performer:  highest process score AND close rate above team median
// - Needs coaching: bottom-quartile process score AND bottom-quartile close rate
// - Process gap:    call volume above team median AND process score < 50
// - Ramping:        manually flagged (identity map) AND score trending up
// - On pace:        everything else
//
// Precedence: Top performer > Ramping > Needs coaching > Process gap > On pace.
// (Ramping outranks the negative badges so a flagged, improving producer is
// celebrated rather than flagged red while mid-ramp.)

import { BADGE_THRESHOLDS } from "./constants";

export type SignalBadge = "top_performer" | "on_pace" | "ramping" | "process_gap" | "needs_coaching";

export const BADGE_LABELS: Record<SignalBadge, { label: string; tone: "good" | "neutral" | "ramping" | "warning" | "critical" }> = {
  top_performer: { label: "Top performer", tone: "good" },
  on_pace: { label: "On pace", tone: "neutral" },
  ramping: { label: "Ramping", tone: "ramping" },
  process_gap: { label: "Process gap", tone: "warning" },
  needs_coaching: { label: "Needs coaching", tone: "critical" },
};

export interface ProducerBadgeInput {
  id: string;
  calls: number;
  /** Mean call score in range; null when no scored calls. */
  processScore: number | null;
  /** Mean call score in the prior period; null when no history. */
  priorProcessScore: number | null;
  /** Close rate percent; null when no quotes. */
  closeRatePct: number | null;
  isRamping: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Value at (or below) the given quantile of the team's distribution. */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[idx] ?? 0;
}

/** Assign a badge to every producer, considering the whole team's stats. */
export function assignBadges(team: ProducerBadgeInput[]): Map<string, SignalBadge> {
  const badges = new Map<string, SignalBadge>();
  const scores = team.filter((p) => p.processScore != null).map((p) => p.processScore as number);
  const closeRates = team.filter((p) => p.closeRatePct != null).map((p) => p.closeRatePct as number);
  const callVolumes = team.map((p) => p.calls);

  const medianClose = median(closeRates);
  const medianCalls = median(callVolumes);
  const scoreQ1 = quantile(scores, BADGE_THRESHOLDS.needsCoachingQuartile);
  const closeQ1 = quantile(closeRates, BADGE_THRESHOLDS.needsCoachingQuartile);
  const topScore = scores.length > 0 ? Math.max(...scores) : null;

  for (const p of team) {
    let badge: SignalBadge = "on_pace";

    const isTop =
      p.processScore != null &&
      topScore != null &&
      p.processScore === topScore &&
      p.closeRatePct != null &&
      p.closeRatePct >= medianClose;

    const isRampingUp =
      p.isRamping &&
      p.processScore != null &&
      p.priorProcessScore != null &&
      p.processScore - p.priorProcessScore >= BADGE_THRESHOLDS.rampingMinTrendPts;

    // Strictly below the quartile boundary: on small teams the boundary value
    // itself belongs to the next band up (e.g. mockup's Marcus is a process
    // gap, not a coaching case).
    const needsCoaching =
      p.processScore != null &&
      p.closeRatePct != null &&
      team.length >= 3 &&
      p.processScore < scoreQ1 &&
      p.closeRatePct < closeQ1;

    const processGap =
      p.processScore != null &&
      p.calls > medianCalls &&
      p.processScore < BADGE_THRESHOLDS.processGapMaxScore;

    if (isTop) badge = "top_performer";
    else if (isRampingUp) badge = "ramping";
    else if (needsCoaching) badge = "needs_coaching";
    else if (processGap) badge = "process_gap";

    badges.set(p.id, badge);
  }
  return badges;
}
