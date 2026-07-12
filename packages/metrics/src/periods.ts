// Date-range and delta arithmetic shared by every KPI.

export interface DateRange {
  from: Date;
  to: Date; // exclusive
}

const DAY_MS = 86_400_000;

/**
 * The prior period of equal length, ending where the current period starts.
 * All period-over-period deltas compare against this window.
 */
export function priorPeriod(range: DateRange): DateRange {
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: new Date(range.from.getTime()) };
}

/** Percent change current vs prior; null when the prior value is 0 (no meaningful delta). */
export function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

/** Difference in percentage points (for rates). Null when either rate is null. */
export function ptsDelta(currentPct: number | null, priorPct: number | null): number | null {
  if (currentPct == null || priorPct == null) return null;
  return currentPct - priorPct;
}

/** Close rate as a percentage; null when there are no quotes (divide-by-zero guard). */
export function closeRatePct(policies: number, quotes: number): number | null {
  if (quotes === 0) return null;
  return (policies / quotes) * 100;
}

/** UTC day keys (YYYY-MM-DD) covering [from, to). */
export function dayKeys(range: DateRange): string[] {
  const keys: string[] = [];
  let t = Date.UTC(
    range.from.getUTCFullYear(),
    range.from.getUTCMonth(),
    range.from.getUTCDate(),
  );
  while (t < range.to.getTime()) {
    keys.push(new Date(t).toISOString().slice(0, 10));
    t += DAY_MS;
  }
  return keys;
}

/**
 * Bucket timestamped values into daily sums across the range (sparklines and
 * the daily trend chart). Days with no data are zero, not missing.
 */
export function bucketByDay(
  range: DateRange,
  points: { at: Date; value: number }[],
): { day: string; value: number }[] {
  const keys = dayKeys(range);
  const sums = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const p of points) {
    const key = p.at.toISOString().slice(0, 10);
    if (sums.has(key)) sums.set(key, (sums.get(key) ?? 0) + p.value);
  }
  return keys.map((day) => ({ day, value: sums.get(day) ?? 0 }));
}

/** Default dashboard range: the last `days` days ending now. */
export function lastNDays(days: number, now = new Date()): DateRange {
  return { from: new Date(now.getTime() - days * DAY_MS), to: now };
}

/**
 * The last `days` whole UTC days, ending at the next UTC midnight (exclusive),
 * so "today" is always included in full. This is the dashboard's default
 * range: day-aligned boundaries keep daily buckets stable within a day and
 * make period-over-period comparisons compare whole days to whole days.
 */
export function alignedLastNDays(days: number, now = new Date()): DateRange {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS,
  );
  return { from: new Date(to.getTime() - days * DAY_MS), to };
}
