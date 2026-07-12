// Dashboard date-range resolution. Ranges are day-aligned (whole UTC days,
// exclusive end at the next UTC midnight): daily buckets stay stable within a
// day and the demo dataset's period totals land exactly on its targets.

import { alignedLastNDays, type DateRange } from "@anchorline/metrics";

export const RANGE_PRESETS = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
  { days: 60, label: "Last 60 days" },
  { days: 90, label: "Last 90 days" },
] as const;

export const DEFAULT_RANGE_DAYS = 30;

export interface ResolvedRange {
  range: DateRange;
  days: number;
  label: string;
}

/**
 * Resolve `?days=N` (or API `?from&to` ISO dates, normalized to whole UTC
 * days) into a concrete range. Unknown values fall back to the 30-day default.
 */
export function resolveRange(params: { days?: string; from?: string; to?: string }): ResolvedRange {
  if (params.from && params.to) {
    const from = parseUtcDay(params.from);
    // `to` is an inclusive calendar day; the range's exclusive end is the next midnight.
    const toDay = parseUtcDay(params.to);
    if (from && toDay && toDay.getTime() >= from.getTime()) {
      const to = new Date(toDay.getTime() + 86_400_000);
      const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
      return { range: { from, to }, days, label: `${params.from} – ${params.to}` };
    }
  }
  const days = Number(params.days);
  const preset = RANGE_PRESETS.find((p) => p.days === days) ?? RANGE_PRESETS.find((p) => p.days === DEFAULT_RANGE_DAYS)!;
  return { range: alignedLastNDays(preset.days), days: preset.days, label: preset.label };
}

function parseUtcDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
