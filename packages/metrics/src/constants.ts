// Signal badge thresholds. Every knob that decides how a producer is labeled
// lives here so the agency can tune them in one place.

export const BADGE_THRESHOLDS = {
  /** "Process gap": process score below this while call volume is above the team median. */
  processGapMaxScore: 50,
  /** "Ramping": minimum period-over-period process score improvement (points). */
  rampingMinTrendPts: 3,
  /** "Needs coaching": bottom quartile on both process score and close rate. */
  needsCoachingQuartile: 0.25,
} as const;

/** Sales process score color bands (mirrors the mockup's scoreColor). */
export const SCORE_BANDS = {
  good: 80,
  mid: 55,
} as const;

/** Call score badge bands in the drill-down modal (mockup's scoreBand). */
export const CALL_SCORE_BANDS = {
  good: 75,
  mid: 45,
} as const;
