// Anchorline worker: cron schedules + DB-backed job queue poller.

import "./env";
import cron from "node-cron";
import { prisma, type Job } from "@anchorline/db";
import { isDemoMode } from "@anchorline/providers";
import { syncRingCentral } from "./handlers/sync-ringcentral";
import { syncAgencyZoom } from "./handlers/sync-agencyzoom";
import { transcribeCall } from "./handlers/transcribe-call";
import { scoreCall } from "./handlers/score-call";
import { generateDailySummaryJob } from "./handlers/daily-summary";

const POLL_INTERVAL_MS = 5_000;

type JobHandler = (job: Job) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  sync_ringcentral: syncRingCentral,
  sync_agencyzoom: syncAgencyZoom,
  transcribe_call: transcribeCall,
  score_call: scoreCall,
  generate_daily_summary: generateDailySummaryJob,
};

/** Claim the next runnable job with FOR UPDATE SKIP LOCKED (multi-worker safe). */
async function claimJob(): Promise<Job | null> {
  // Aliases map snake_case columns onto the Prisma Job field names.
  const rows = await prisma.$queryRaw<Job[]>`
    UPDATE jobs SET status = 'running', updated_at = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_at <= now()
      ORDER BY run_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, agency_id AS "agencyId", type, payload, status,
      run_at AS "runAt", attempts, max_attempts AS "maxAttempts",
      last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt"`;
  return rows[0] ?? null;
}

async function runOnce(): Promise<boolean> {
  const job = await claimJob();
  if (!job) return false;

  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
    await handler(job);
    await prisma.job.update({ where: { id: job.id }, data: { status: "done" } });
  } catch (err) {
    const attempts = job.attempts + 1;
    const failedForGood = attempts >= job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: failedForGood ? "failed" : "queued",
        attempts,
        lastError: err instanceof Error ? err.message : String(err),
        // Exponential backoff: 1m, 4m, 9m...
        runAt: failedForGood ? job.runAt : new Date(Date.now() + attempts * attempts * 60_000),
      },
    });
    console.error(`Job ${job.id} (${job.type}) attempt ${attempts} failed:`, err);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Scheduled syncs (live mode only — demo mode's manual sync runs inline in
// the web app, and a cron here would drift the deterministic demo numbers)
// ---------------------------------------------------------------------------

/** Enqueue a job unless one of the same type is already queued or running. */
async function enqueueUnlessPending(agencyId: string, type: string): Promise<void> {
  const pending = await prisma.job.findFirst({
    where: { agencyId, type, status: { in: ["queued", "running"] } },
  });
  if (!pending) await prisma.job.create({ data: { agencyId, type } });
}

async function enqueueScheduledSyncs(type: "sync_ringcentral" | "sync_agencyzoom"): Promise<void> {
  const agencies = await prisma.agency.findMany({ select: { id: true } });
  for (const agency of agencies) {
    await enqueueUnlessPending(agency.id, type);
  }
}

async function startSchedules(): Promise<void> {
  if (isDemoMode()) {
    console.log("Demo mode: scheduled syncs disabled (manual demo sync runs inline in the web app).");
    return;
  }
  const enqueue = (type: "sync_ringcentral" | "sync_agencyzoom") => {
    enqueueScheduledSyncs(type).catch((err) => console.error(`Failed to enqueue ${type}:`, err));
  };
  // Recurring schedules, plus once at boot so a fresh deploy backfills immediately.
  cron.schedule("*/15 * * * *", () => enqueue("sync_ringcentral"));
  cron.schedule("*/30 * * * *", () => enqueue("sync_agencyzoom"));
  enqueue("sync_ringcentral");
  enqueue("sync_agencyzoom");

  // Daily AI summary at 7:00 AM in each agency's time zone. Schedules are
  // read once at boot (an agency added later needs a worker restart — fine
  // for the single-tenant deployment).
  const agencies = await prisma.agency.findMany({ select: { id: true, timezone: true } });
  for (const agency of agencies) {
    cron.schedule(
      "0 7 * * *",
      () => {
        enqueueUnlessPending(agency.id, "generate_daily_summary").catch((err) =>
          console.error("Failed to enqueue generate_daily_summary:", err),
        );
      },
      { timezone: agency.timezone },
    );
  }
  console.log(
    "Live mode: RingCentral sync every 15 minutes, AgencyZoom sync every 30 minutes, daily summary at 7:00 AM agency-local.",
  );
}

async function loop() {
  console.log(`Anchorline worker started (DATA_MODE=${process.env.DATA_MODE ?? "demo"}).`);
  await startSchedules().catch((err) => console.error("Failed to start schedules:", err));
  // Drain available jobs, then idle-poll.
  for (;;) {
    try {
      const worked = await runOnce();
      if (!worked) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      console.error("Worker loop error:", err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

loop().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
