// Daily AI summary: stats input, generation orchestration, persistence.
// Shared by the worker's 7 AM generate_daily_summary job and the dashboard's
// Regenerate button so both produce identical rows.
//
// The generator itself (Anthropic in live mode, rotating demo variants in
// demo mode) is passed in rather than imported: packages/db depends on
// packages/providers (the seed uses the mock dataset), so a providers import
// here would close a package cycle. The SummaryGenerator shape below is
// structurally identical to the one implemented in @anchorline/providers.

import { prisma, Prisma, type DailySummary } from "@anchorline/db";
import { alignedLastNDays, priorPeriod, ptsDelta } from "./periods";
import { getProducerRows, periodTotals } from "./aggregates";

export interface SummaryProducerStats {
  name: string;
  processScore: number;
  prevProcessScore: number | null;
  closeRatePct: number;
  premiumDollars: number;
  isRamping: boolean;
}

export interface SummaryStats {
  totalCalls: number;
  talkMinutes: number;
  quotes: number;
  policies: number;
  premiumDollars: number;
  closeRatePct: number;
  closeRateDeltaPts: number;
  producers: SummaryProducerStats[];
}

export interface SummaryInsight {
  producer: string;
  text: string;
  tone: "good" | "warning" | "info";
}

export interface SummaryGenerator {
  generateSummary(
    stats: SummaryStats,
    opts?: { previousSummaryText?: string | null },
  ): Promise<{ summaryText: string; insights: SummaryInsight[]; model: string }>;
}

/** Last-30-aligned-days aggregates in the shape the summary prompt consumes. */
export async function buildSummaryStats(agencyId: string, now = new Date()): Promise<SummaryStats> {
  const range = alignedLastNDays(30, now);
  const [totals, priorTotals, producers] = await Promise.all([
    periodTotals(agencyId, range),
    periodTotals(agencyId, priorPeriod(range)),
    getProducerRows(agencyId, range),
  ]);
  return {
    totalCalls: totals.calls,
    talkMinutes: totals.talkMinutes,
    quotes: totals.quotes,
    policies: totals.policies,
    premiumDollars: totals.premiumCents / 100,
    closeRatePct: totals.closeRatePct ?? 0,
    closeRateDeltaPts: ptsDelta(totals.closeRatePct, priorTotals.closeRatePct) ?? 0,
    producers: producers
      .filter((p) => p.processScore != null)
      .map((p) => ({
        name: p.displayName,
        processScore: p.processScore!,
        prevProcessScore: p.priorProcessScore,
        closeRatePct: p.closeRatePct ?? 0,
        premiumDollars: p.premiumCents / 100,
        isRamping: p.isRamping,
      })),
  };
}

/** "YYYY-MM-DD" for an instant in a named time zone (en-CA formats ISO-style). */
export function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(date);
}

/**
 * Generate and store the daily summary for "today" in the agency's time zone
 * (one row per agency-local date; regenerating overwrites it). The previous
 * summary's text is passed to the generator so demo mode can rotate variants
 * and live mode can be nudged toward a fresh angle on Regenerate.
 */
export async function generateDailySummary(
  agencyId: string,
  generator: SummaryGenerator,
  now = new Date(),
): Promise<DailySummary> {
  const agency = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId } });
  const forDate = new Date(`${localDateKey(now, agency.timezone)}T00:00:00Z`);

  const [stats, previous] = await Promise.all([
    buildSummaryStats(agencyId, now),
    prisma.dailySummary.findFirst({
      where: { agencyId },
      orderBy: [{ forDate: "desc" }, { generatedAt: "desc" }],
    }),
  ]);

  const generated = await generator.generateSummary(stats, { previousSummaryText: previous?.summaryText ?? null });

  const data = {
    summaryText: generated.summaryText,
    insights: generated.insights as unknown as Prisma.InputJsonValue,
    model: generated.model,
    generatedAt: now,
  };
  const existing = await prisma.dailySummary.findFirst({ where: { agencyId, forDate } });
  return existing
    ? prisma.dailySummary.update({ where: { id: existing.id }, data })
    : prisma.dailySummary.create({ data: { agencyId, forDate, ...data } });
}
