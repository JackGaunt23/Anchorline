// Daily AI summary (job type "generate_daily_summary").
//
// Shared generation path with the dashboard's Regenerate button:
// generateDailySummary builds last-30-day stats, runs the generator
// (OpenAI in live mode, rotating demo variants in demo mode), and upserts
// the row for today in the agency's time zone. Scheduled at 7:00 AM
// agency-local by the worker cron.

import { type Job } from "@anchorline/db";
import { generateDailySummary } from "@anchorline/metrics";
import { getSummaryGenerator } from "@anchorline/providers";

export async function generateDailySummaryJob(job: Job): Promise<void> {
  await generateDailySummary(job.agencyId, getSummaryGenerator());
}
