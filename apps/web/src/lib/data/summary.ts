// AI daily summary: read the latest generated summary, and (demo mode)
// regenerate one from live DB aggregates via the deterministic demo builder.
// The real Anthropic-backed generator arrives in Phase 5; demo mode must work
// with zero external credentials.

import { prisma, Prisma, type DailySummary } from "@anchorline/db";
import { alignedLastNDays, priorPeriod, ptsDelta } from "@anchorline/metrics";
import { isDemoMode } from "@anchorline/providers";
import { buildDemoSummary, DEMO_MODEL, type DemoSummaryStats } from "@anchorline/providers/mock";
import { getProducerRows, periodTotals } from "./metrics";

export interface SummaryInsight {
  producer: string;
  text: string;
  tone: "good" | "warning" | "info";
}

export interface SummaryView {
  summaryText: string;
  insights: SummaryInsight[];
  generatedAt: Date;
  model: string;
}

function toView(row: DailySummary): SummaryView {
  return {
    summaryText: row.summaryText,
    insights: (row.insights as unknown as SummaryInsight[]) ?? [],
    generatedAt: row.generatedAt,
    model: row.model,
  };
}

export async function getLatestSummary(agencyId: string): Promise<SummaryView | null> {
  const row = await prisma.dailySummary.findFirst({
    where: { agencyId },
    orderBy: [{ forDate: "desc" }, { generatedAt: "desc" }],
  });
  return row ? toView(row) : null;
}

/** Build the demo-summary stats input from real DB aggregates (last 30 aligned days). */
async function demoStats(agencyId: string): Promise<DemoSummaryStats> {
  const range = alignedLastNDays(30);
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

/**
 * Regenerate today's summary. Demo mode rotates through the three summary
 * variants (like the mockup's Regenerate button); live mode lands in Phase 5.
 */
export async function regenerateSummary(agencyId: string): Promise<SummaryView> {
  if (!isDemoMode()) {
    throw new Error("Live summary generation arrives in Phase 5 — set DATA_MODE=demo for now.");
  }

  const stats = await demoStats(agencyId);
  const current = await prisma.dailySummary.findFirst({
    where: { agencyId },
    orderBy: [{ forDate: "desc" }, { generatedAt: "desc" }],
  });

  // Rotate to the variant after whichever one is currently stored.
  const variants = [0, 1, 2].map((v) => buildDemoSummary(stats, v));
  const currentIdx = variants.findIndex((v) => v.summaryText === current?.summaryText);
  const next = variants[(currentIdx + 1) % variants.length]!;

  const forDate = new Date(new Date().toISOString().slice(0, 10));
  const existing = await prisma.dailySummary.findFirst({ where: { agencyId, forDate } });
  const data = {
    summaryText: next.summaryText,
    insights: next.insights as unknown as Prisma.InputJsonValue,
    model: DEMO_MODEL,
    generatedAt: new Date(),
  };
  const row = existing
    ? await prisma.dailySummary.update({ where: { id: existing.id }, data })
    : await prisma.dailySummary.create({ data: { agencyId, forDate, ...data } });
  return toView(row);
}
