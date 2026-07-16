// AI daily summary: read the latest generated summary, and regenerate on
// demand. Generation + persistence are shared with the worker's 7 AM
// generate_daily_summary job (generateDailySummary in @anchorline/metrics);
// the generator is OpenAI in live mode and the rotating deterministic
// demo builder in demo mode, so Regenerate works with zero credentials.

import { prisma, type DailySummary } from "@anchorline/db";
import { generateDailySummary, type SummaryInsight } from "@anchorline/metrics";
import { getSummaryGenerator } from "@anchorline/providers";

export type { SummaryInsight } from "@anchorline/metrics";

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

/** Regenerate today's summary (same generation path as the daily worker job). */
export async function regenerateSummary(agencyId: string): Promise<SummaryView> {
  const row = await generateDailySummary(agencyId, getSummaryGenerator());
  return toView(row);
}
